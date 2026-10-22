import uuid
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int


class Message(BaseModel):
    message: str


# ── 認証 ─────────────────────────────────────────────


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=20)
    agree_terms: bool
    invite_code: str | None = Field(default=None, max_length=16)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=20)


class MeOut(ORM):
    id: int
    email: str
    display_name: str
    role: str
    email_verified: bool
    balance: int  # ガチャチケットの残高
    point_balance: int = 0  # ポイント（交換用）の残高
    phone_verified: bool = False
    sms_required: bool = False  # SMS 認証が必須で、まだ済んでいない
    invite_code: str | None = None
    unread_notifications: int
    created_at: datetime


class SessionOut(ORM):
    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    ip: str | None
    user_agent: str | None
    current: bool


# ── チケット ───────────────────────────────────────────


class TicketTxOut(ORM):
    id: int
    delta: int
    balance_after: int
    kind: str
    description: str
    is_test: bool
    created_at: datetime


class WalletOut(BaseModel):
    balance: int
    total_earned: int
    total_spent: int


# ── ガチャ ─────────────────────────────────────────────


class PrizeOut(ORM):
    id: int
    name: str
    description: str
    image_url: str | None
    rarity: str
    subtitle: str = ""
    point_value: int = 0  # 0 より大きいとポイント景品


class GachaItemOut(BaseModel):
    prize: PrizeOut
    probability: float  # 0〜1（現在の提供割合）
    stock_total: int | None
    stock_remaining: int | None


class GachaSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    subtitle: str
    banner_image_url: str | None
    theme_color: str
    ticket_cost: int
    mode: str
    starts_at: datetime | None
    ends_at: datetime | None
    is_open: bool
    remaining: int | None
    total_pulls: int | None
    has_last_one: bool
    last_one_awarded: bool
    top_rarity: str | None
    featured_prize: PrizeOut | None
    badge: str = ""
    pulls_done: int = 0


class GachaDetailOut(GachaSummaryOut):
    description: str
    allow_multi_10: bool
    allow_multi_100: bool
    items: list[GachaItemOut]
    rarity_rates: dict[str, float]
    last_one_prize: PrizeOut | None
    last_one_description: str


class DrawIn(BaseModel):
    count: Literal[1, 10, 100]
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")


class DrawResultOut(BaseModel):
    position: int
    prize: PrizeOut
    rarity: str
    is_last_one: bool
    point_value: int = 0


class DrawOut(BaseModel):
    id: uuid.UUID
    gacha_id: int
    gacha_title: str
    gacha_slug: str
    count: int
    tickets_spent: int
    best_rarity: str
    has_last_one: bool
    created_at: datetime
    results: list[DrawResultOut]
    rarity_counts: dict[str, int]
    points_won: int = 0
    balance_after: int | None = None  # チケット残高
    point_balance_after: int | None = None
    replayed: bool = False


class DrawSummaryOut(BaseModel):
    id: uuid.UUID
    gacha_id: int
    gacha_title: str
    count: int
    tickets_spent: int
    points_won: int = 0
    best_rarity: str
    has_last_one: bool
    created_at: datetime


class UserPrizeOut(BaseModel):
    id: int
    prize: PrizeOut
    source: str
    status: str
    gacha_title: str | None
    acquired_at: datetime
    is_exchangeable: bool
    requires_shipping: bool


# ── 交換 ───────────────────────────────────────────────


class ShippingIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    postal_code: str = Field(pattern=r"^\d{3}-?\d{4}$")
    prefecture: str = Field(min_length=2, max_length=5)
    address1: str = Field(min_length=1, max_length=100)
    address2: str = Field(default="", max_length=100)
    phone: str = Field(pattern=r"^0\d{1,4}-?\d{1,4}-?\d{3,4}$")
    note: str = Field(default="", max_length=200)


class ExchangeIn(BaseModel):
    user_prize_ids: list[int] = Field(min_length=1, max_length=50)
    shipping: ShippingIn | None = None
    save_address: bool = False
    message: str | None = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")


class ExchangeItemOut(BaseModel):
    user_prize_id: int
    prize: PrizeOut


class ExchangeOut(BaseModel):
    id: int
    status: str
    status_label: str
    recipient_masked: str | None
    carrier: str | None
    tracking_number: str | None
    admin_note: str | None
    user_message: str | None
    created_at: datetime
    updated_at: datetime
    items: list[ExchangeItemOut]


# ── 案件・ミッション ──────────────────────────────────────


class OfferOut(BaseModel):
    id: int
    kind: str
    title: str
    description: str
    conditions: str
    image_url: str | None
    reward_tickets: int
    estimated_minutes: int | None
    is_test: bool
    earned_count: int
    per_user_limit: int
    ends_at: datetime | None
    # 動画リワード広告のみ：今日の視聴回数と 1 日の上限（すべての動画案件の合計）
    daily_used: int | None = None
    daily_limit: int | None = None


class NotificationOut(ORM):
    id: int
    kind: str
    title: str
    body: str
    link: str | None
    read_at: datetime | None
    created_at: datetime


class AnnouncementOut(ORM):
    id: int
    title: str
    body: str
    category: str
    published_at: datetime | None


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    category: Literal["account", "gacha", "tickets", "exchange", "other"]
    body: str = Field(min_length=5, max_length=4000)
