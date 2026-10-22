from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class TicketAdjustIn(BaseModel):
    delta: int = Field(ge=-100000, le=100000)
    reason: str = Field(min_length=2, max_length=150)
    idempotency_key: str = Field(min_length=8, max_length=64)


class SuspendIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class RoleIn(BaseModel):
    role: Literal["user", "staff", "admin"]


class PrizeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)
    rarity: Literal["N", "R", "SR", "SSR"]
    is_exchangeable: bool = True
    requires_shipping: bool = True
    reference_value_yen: int | None = Field(default=None, ge=0)
    is_active: bool = True
    subtitle: str = Field(default="", max_length=60)
    is_featured: bool = False
    featured_order: int = 0
    # 0 より大きいとポイント景品（当選するとこの数のポイントが自動で加算される）
    point_value: int = Field(default=0, ge=0, le=10_000_000)


class GachaItemIn(BaseModel):
    prize_id: int
    weight: int = Field(default=0, ge=0, le=10_000_000)
    stock_total: int | None = Field(default=None, ge=0, le=1_000_000)
    sort_order: int = 0
    is_active: bool = True


class GachaIn(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    title: str = Field(min_length=1, max_length=100)
    subtitle: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)
    banner_image_url: str | None = Field(default=None, max_length=500)
    theme_color: str = Field(default="#7654C8", pattern=r"^#[0-9A-Fa-f]{6}$")
    ticket_cost: int = Field(ge=1, le=10000)
    mode: Literal["probability", "box"]
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_pulls: int | None = Field(default=None, ge=1, le=10_000_000)
    allow_multi_10: bool = True
    allow_multi_100: bool = True
    last_one_prize_id: int | None = None
    last_one_description: str = Field(default="", max_length=2000)
    sort_order: int = 0
    badge: str = Field(default="", max_length=16)

    @model_validator(mode="after")
    def _check(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("終了日時は開始日時より後にしてください。")
        return self


class GachaItemsIn(BaseModel):
    items: list[GachaItemIn] = Field(max_length=200)


class StockAdjustIn(BaseModel):
    item_id: int
    delta: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=2, max_length=150)


class GachaStatusIn(BaseModel):
    status: Literal["draft", "published", "archived"]


class OfferIn(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    kind: Literal["ad", "survey", "video"]
    external_id: str | None = Field(default=None, max_length=64)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    conditions: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)
    url_template: str = Field(min_length=1, max_length=1000)
    reward_tickets: int = Field(ge=1, le=10000)
    estimated_minutes: int | None = Field(default=None, ge=0, le=600)
    per_user_limit: int = Field(default=1, ge=1, le=1000)
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sort_order: int = 0


class MissionIn(BaseModel):
    code: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9_\-]+$")
    kind: Literal["campaign", "achievement"]
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    reward_tickets: int = Field(ge=1, le=10000)
    condition_type: Literal["none", "total_draws", "email_verified", "first_exchange", "login_days"]
    condition_value: int = Field(default=0, ge=0, le=100000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True


class ExchangeTransitionIn(BaseModel):
    status: Literal["approved", "preparing", "shipped", "completed", "rejected"]
    note: str | None = Field(default=None, max_length=500)
    carrier: str | None = Field(default=None, max_length=40)
    tracking_number: str | None = Field(default=None, max_length=64)


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=10000)
    category: Literal["info", "campaign", "maintenance", "important", "new_gacha"] = "info"
    is_published: bool = False
    published_at: datetime | None = None


class ContactStatusIn(BaseModel):
    status: Literal["open", "in_progress", "closed"]


class MessageIn(BaseModel):
    target_type: Literal["users", "all", "verified"]
    user_ids: list[int] = Field(default_factory=list, max_length=500)
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=4000)
    # サイト内のページへのリンクのみ（外部サイトへの誘導は不可）
    link: str | None = Field(default=None, max_length=300, pattern=r"^/([^/\s][^\s]*)?$")
    send_email: bool = False


class BannerIn(BaseModel):
    tag: str = Field(default="", max_length=16)
    tag_color: Literal["pink", "gold", "purple", "blue"] = "pink"
    title: str = Field(min_length=1, max_length=60)
    subtitle: str = Field(default="", max_length=80)
    image_url: str | None = Field(default=None, max_length=500)
    link: str = Field(default="/gacha", max_length=300, pattern=r"^/([^/\s][^\s]*)?$")
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sort_order: int = 0
    is_active: bool = True
