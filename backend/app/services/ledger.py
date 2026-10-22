"""残高（チケット・ポイント）の共通の更新処理。

- すべての増減は同一トランザクション内で履歴テーブルに記録される
- 残高行を SELECT ... FOR UPDATE でロックしてから更新するため、同時リクエストでも整合性が保たれる
- dedupe_key（一意制約）により、同じ理由による重複付与・重複消費を DB レベルで防止する
- 残高は CHECK 制約で 0 未満にならない
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError


class InsufficientBalance(AppError):
    status_code = 402


class Ledger:
    def __init__(self, wallet_model, tx_model, *, label: str, unit: str, error_code: str):
        self.Wallet = wallet_model
        self.Tx = tx_model
        self.label = label  # 「チケット」「ポイント」
        self.unit = unit  # 「枚」「pt」
        self.error_code = error_code

    def fmt(self, n: int) -> str:
        return f"{n:,}{self.unit}"

    def insufficient(self, required: int, balance: int) -> InsufficientBalance:
        return InsufficientBalance(
            self.error_code,
            f"{self.label}が不足しています（必要：{self.fmt(required)}／所持：{self.fmt(balance)}）。",
            required=required,
            balance=balance,
        )

    async def ensure_wallet(self, db: AsyncSession, user_id: int) -> None:
        await db.execute(insert(self.Wallet).values(user_id=user_id, balance=0).on_conflict_do_nothing())

    async def lock_wallet(self, db: AsyncSession, user_id: int):
        await self.ensure_wallet(db, user_id)
        return (
            await db.execute(
                select(self.Wallet)
                .where(self.Wallet.user_id == user_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()

    async def get_balance(self, db: AsyncSession, user_id: int) -> int:
        bal = await db.scalar(select(self.Wallet.balance).where(self.Wallet.user_id == user_id))
        return bal or 0

    async def _apply(self, db, wallet, delta, kind, description, *, dedupe_key, ref_type, ref_id, actor_id, is_test):
        new_balance = wallet.balance + delta
        stmt = (
            insert(self.Tx)
            .values(
                user_id=wallet.user_id,
                delta=delta,
                balance_after=new_balance,
                kind=kind,
                description=description[:200],
                ref_type=ref_type,
                ref_id=ref_id,
                dedupe_key=dedupe_key,
                actor_id=actor_id,
                is_test=is_test,
            )
            .returning(self.Tx)
        )
        if dedupe_key is not None:
            stmt = stmt.on_conflict_do_nothing(index_elements=["dedupe_key"])
        tx = (await db.execute(stmt)).scalar_one_or_none()
        if tx is None:
            return None  # 既に同じ dedupe_key で処理済み
        wallet.balance = new_balance
        if delta > 0:
            wallet.total_earned += delta
        else:
            wallet.total_spent += -delta
        await db.flush()
        return tx

    async def credit(self, db, user_id, amount, kind, description, *, dedupe_key=None, ref_type=None, ref_id=None,
                     actor_id=None, is_test=False):
        """付与する。dedupe_key が既に使われていれば何もせず None を返す。"""
        if amount <= 0:
            raise ValueError("credit amount must be positive")
        wallet = await self.lock_wallet(db, user_id)
        return await self._apply(db, wallet, amount, kind, description, dedupe_key=dedupe_key, ref_type=ref_type,
                                 ref_id=ref_id, actor_id=actor_id, is_test=is_test)

    async def debit(self, db, user_id, amount, kind, description, *, wallet=None, dedupe_key=None, ref_type=None,
                    ref_id=None, actor_id=None):
        """消費する。残高不足なら InsufficientBalance。"""
        if amount <= 0:
            raise ValueError("debit amount must be positive")
        wallet = wallet or await self.lock_wallet(db, user_id)
        if wallet.balance < amount:
            raise self.insufficient(amount, wallet.balance)
        tx = await self._apply(db, wallet, -amount, kind, description, dedupe_key=dedupe_key, ref_type=ref_type,
                               ref_id=ref_id, actor_id=actor_id, is_test=False)
        if tx is None:
            raise AppError("duplicate_debit", "この操作は既に処理されています。", status_code=409)
        return tx

    async def adjust(self, db, user_id, delta, kind, description, *, actor_id, dedupe_key=None):
        """管理者による付与・減算。減算で残高がマイナスになる場合はエラー。"""
        if delta == 0:
            raise AppError("invalid_amount", f"0 以外の{self.label}数を指定してください。")
        wallet = await self.lock_wallet(db, user_id)
        if wallet.balance + delta < 0:
            raise AppError("negative_balance", f"残高がマイナスになるため減算できません（現在の残高：{self.fmt(wallet.balance)}）。")
        return await self._apply(db, wallet, delta, kind, description, dedupe_key=dedupe_key, ref_type="admin",
                                 ref_id=str(actor_id), actor_id=actor_id, is_test=False)
