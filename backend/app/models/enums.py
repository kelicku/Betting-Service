from enum import StrEnum


class Role(StrEnum):
    user = "user"
    staff = "staff"  # 運営スタッフ：閲覧・交換申請対応・案件管理
    admin = "admin"  # 管理者：全権限（チケット付与、ガチャ設定、システム設定）


class UserStatus(StrEnum):
    active = "active"
    suspended = "suspended"


class TokenPurpose(StrEnum):
    verify_email = "verify_email"
    reset_password = "reset_password"


class TicketKind(StrEnum):
    signup_bonus = "signup_bonus"
    daily_login = "daily_login"
    ad = "ad"
    survey = "survey"
    campaign = "campaign"
    achievement = "achievement"
    admin_grant = "admin_grant"
    admin_adjust = "admin_adjust"
    gacha_draw = "gacha_draw"
    refund = "refund"
    referral = "referral"  # 友達紹介
    coupon = "coupon"  # クーポンコード


class PointKind(StrEnum):
    gacha_win = "gacha_win"  # ガチャで当たったポイント
    signup_bonus = "signup_bonus"
    referral = "referral"  # 友達紹介
    admin_grant = "admin_grant"
    admin_adjust = "admin_adjust"
    shop_exchange = "shop_exchange"  # ポイント交換（景品・ギフト）
    refund = "refund"  # 交換の取消による返還


class Rarity(StrEnum):
    N = "N"  # 通常
    R = "R"  # レア
    SR = "SR"  # スーパーレア
    SSR = "SSR"  # 最高レアリティ


RARITY_ORDER = {Rarity.N: 0, Rarity.R: 1, Rarity.SR: 2, Rarity.SSR: 3}


class GachaMode(StrEnum):
    probability = "probability"  # 確率抽選方式
    box = "box"  # 在庫数に基づく抽選方式（ボックス）


class GachaStatus(StrEnum):
    draft = "draft"
    published = "published"
    archived = "archived"


class PrizeSource(StrEnum):
    draw = "draw"
    last_one = "last_one"
    admin = "admin"


class UserPrizeStatus(StrEnum):
    owned = "owned"
    exchange_pending = "exchange_pending"
    exchanged = "exchanged"


class ExchangeStatus(StrEnum):
    pending = "pending"  # 申請受付
    approved = "approved"  # 承認
    preparing = "preparing"  # 発送準備
    shipped = "shipped"  # 発送済み
    completed = "completed"  # 完了
    rejected = "rejected"  # 却下
    cancelled = "cancelled"  # 取消（ユーザー）


# 許可される状態遷移（管理者操作）
EXCHANGE_TRANSITIONS: dict[ExchangeStatus, set[ExchangeStatus]] = {
    ExchangeStatus.pending: {ExchangeStatus.approved, ExchangeStatus.rejected},
    ExchangeStatus.approved: {ExchangeStatus.preparing, ExchangeStatus.rejected},
    ExchangeStatus.preparing: {ExchangeStatus.shipped},
    ExchangeStatus.shipped: {ExchangeStatus.completed},
    ExchangeStatus.completed: set(),
    ExchangeStatus.rejected: set(),
    ExchangeStatus.cancelled: set(),
}


class OfferKind(StrEnum):
    ad = "ad"  # アプリ導入などの案件
    survey = "survey"
    video = "video"  # 動画リワード広告（1 日の視聴回数に上限あり）


class ConversionStatus(StrEnum):
    credited = "credited"
    rejected = "rejected"


class MissionKind(StrEnum):
    campaign = "campaign"
    achievement = "achievement"


class MissionCondition(StrEnum):
    none = "none"  # 期間中に参加するだけ（キャンペーン）
    total_draws = "total_draws"  # 累計抽選回数が N 回以上
    email_verified = "email_verified"
    first_exchange = "first_exchange"
    login_days = "login_days"  # ログインボーナス受取日数が N 日以上


class ShopItemKind(StrEnum):
    digital_code = "digital_code"  # デジタルギフト（デジコなど）：コードをお渡しする
    shipping = "shipping"  # 物の景品：発送する


class ShopOrderStatus(StrEnum):
    pending = "pending"  # 受付（コードの準備待ち・発送待ち）
    fulfilled = "fulfilled"  # ギフトコードをお渡し済み
    shipped = "shipped"  # 発送済み
    cancelled = "cancelled"  # 取消（ポイントは返還）


SHOP_ORDER_TRANSITIONS: dict[ShopOrderStatus, set[ShopOrderStatus]] = {
    ShopOrderStatus.pending: {ShopOrderStatus.fulfilled, ShopOrderStatus.shipped, ShopOrderStatus.cancelled},
    ShopOrderStatus.fulfilled: set(),
    ShopOrderStatus.shipped: set(),
    ShopOrderStatus.cancelled: set(),
}
