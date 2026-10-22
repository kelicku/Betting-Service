from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TicketWallet(Base):
    """ユーザーごとのチケット残高。残高の変更は必ず ticket_service 経由で行い、
    同時に ticket_transactions に履歴を書き込む。"""

    __tablename__ = "ticket_wallets"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_earned: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_spent: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="wallet", lazy="raise")

    __table_args__ = (CheckConstraint("balance >= 0", name="balance_non_negative"),)


class TicketTransaction(Base):
    __tablename__ = "ticket_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    delta: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(String(200))
    ref_type: Mapped[str | None] = mapped_column(String(32))
    ref_id: Mapped[str | None] = mapped_column(String(64))
    # 同じ理由による重複付与・重複消費を DB レベルで防ぐためのキー
    dedupe_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("delta <> 0", name="delta_non_zero"),
        CheckConstraint("balance_after >= 0", name="balance_after_non_negative"),
        Index("ix_ticket_tx_user_created", "user_id", "created_at"),
    )


class PointWallet(Base):
    """ユーザーごとのポイント残高（チケットとは別）。ガチャの当選で増え、景品・ギフトとの交換で減る。
    残高の変更は必ず services/points 経由で行い、同時に point_transactions に履歴を書き込む。"""

    __tablename__ = "point_wallets"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_earned: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_spent: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (CheckConstraint("balance >= 0", name="point_balance_non_negative"),)


class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    delta: Mapped[int] = mapped_column(BigInteger)
    balance_after: Mapped[int] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(String(200))
    ref_type: Mapped[str | None] = mapped_column(String(32))
    ref_id: Mapped[str | None] = mapped_column(String(64))
    dedupe_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("delta <> 0", name="point_delta_non_zero"),
        CheckConstraint("balance_after >= 0", name="point_balance_after_non_negative"),
        Index("ix_point_tx_user_created", "user_id", "created_at"),
    )
