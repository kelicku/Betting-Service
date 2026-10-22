"""管理画面から変更可能なシステム設定。"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.models import SystemSetting

DEFAULTS: dict[str, Any] = {
    "signup_bonus_tickets": 10,
    # 新規登録特典のポイント（交換用。0 なら付与しない）
    "signup_bonus_points": 0,
    # 動画リワード広告：1 人 1 日あたりの視聴上限回数（日本時間 0:00 にリセット）
    "video_daily_limit": 5,
    # SMS 認証：有効にすると、ガチャ・チケット獲得・交換の前に電話番号の確認が必要になる
    "sms_verification_required": False,
    # 友達紹介：紹介された人が登録を完了（メール認証＋SMS 認証が必須なら SMS 認証も）したときに付与するチケット
    "referral_inviter_tickets": 10,
    "referral_invitee_tickets": 5,
    "daily_login_tickets": 1,
    # 連続ログイン 7 日目ごとの追加ボーナス
    "daily_login_streak7_bonus": 3,
    "maintenance_mode": False,
    "maintenance_message": "ただいまメンテナンス中です。しばらくお待ちください。",
    # 交換完了後に配送先の個人情報を保持する日数
    "pii_retention_days": 90,
    "exchange_requires_verified_email": True,
    # フッターの SNS リンク（空欄のものは「準備中」として表示）
    "sns_x_url": "",
    "sns_instagram_url": "",
    "sns_youtube_url": "",
}

DESCRIPTIONS: dict[str, str] = {
    "signup_bonus_tickets": "新規登録特典（メール認証完了時に付与）のチケット枚数",
    "signup_bonus_points": "新規登録特典（メール認証完了時に付与）のポイント数（0 なら付与しない）",
    "video_daily_limit": "動画リワード広告の 1 日あたりの視聴上限回数（日本時間 0:00 にリセット）",
    "sms_verification_required": "SMS 認証を必須にする（有効時、ガチャ・チケット獲得・ポイント交換の前に電話番号の確認が必要）",
    "referral_inviter_tickets": "友達紹介：紹介した人に付与するチケット枚数",
    "referral_invitee_tickets": "友達紹介：紹介された人に付与するチケット枚数",
    "daily_login_tickets": "毎日のログインボーナスのチケット枚数",
    "daily_login_streak7_bonus": "連続ログイン7日ごとの追加ボーナスのチケット枚数",
    "maintenance_mode": "メンテナンスモード（有効時は一般ユーザーの抽選・獲得操作を停止）",
    "maintenance_message": "メンテナンス中に表示するメッセージ",
    "pii_retention_days": "交換完了後に配送先情報を保持する日数",
    "exchange_requires_verified_email": "景品交換にメール認証を必須とする",
    "sns_x_url": "公式 X（旧 Twitter）の URL（空欄なら「準備中」と表示）",
    "sns_instagram_url": "公式 Instagram の URL",
    "sns_youtube_url": "公式 YouTube チャンネルの URL",
}


async def _load_all(db: AsyncSession) -> dict[str, Any]:
    rows = (await db.execute(select(SystemSetting))).scalars()
    values = dict(DEFAULTS)
    for r in rows:
        if r.key in DEFAULTS:
            values[r.key] = r.value.get("v")
    return values


# 設定はほぼ変わらないため 5 秒キャッシュする（変更したワーカーではすぐ反映、他のワーカーは最大 5 秒後）
CACHE_SECONDS = 5.0


async def get_all(db: AsyncSession) -> dict[str, Any]:
    return dict(await cache.cached("settings", CACHE_SECONDS, lambda: _load_all(db)))


async def get(db: AsyncSession, key: str) -> Any:
    return (await get_all(db))[key]


async def set_many(db: AsyncSession, values: dict[str, Any], actor_id: int) -> None:
    for k, v in values.items():
        if k not in DEFAULTS:
            continue
        expected = type(DEFAULTS[k])
        if expected is int and (not isinstance(v, int) or isinstance(v, bool) or v < 0):
            raise ValueError(f"{k} must be a non-negative integer")
        if expected is bool and not isinstance(v, bool):
            raise ValueError(f"{k} must be a boolean")
        if expected is str and not isinstance(v, str):
            raise ValueError(f"{k} must be a string")
        stmt = insert(SystemSetting).values(key=k, value={"v": v}, updated_by=actor_id)
        stmt = stmt.on_conflict_do_update(
            index_elements=["key"], set_={"value": {"v": v}, "updated_by": actor_id}
        )
        await db.execute(stmt)
    cache.invalidate("settings")
