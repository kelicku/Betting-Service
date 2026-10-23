import uuid
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
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin


class Offer(Base, TimestampMixin):
    """広告・アンケート案件。"""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    external_id: Mapped[str | None] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    conditions: Mapped[str] = mapped_column(Text, default="", server_default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    # 遷移先 URL。{click_id} が成果通知と照合するための ID に置き換わる
    url_template: Mapped[str] = mapped_column(String(1000))
    reward_tickets: Mapped[int] = mapped_column(Integer)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    per_user_limit: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # 開発用の仮案件。本番の広告成果と明確に区別する
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("kind in ('ad','survey','video')", name="kind_valid"),
        CheckConstraint("reward_tickets > 0", name="reward_positive"),
    )


class OfferClick(Base):
    """案件への遷移記録。click_id を広告事業者に渡し、成果通知で返してもらう。"""

    __tablename__ = "offer_clicks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"), index=True)
    ip: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Conversion(Base):
    """広告・アンケートの成果履歴。(provider, external_conversion_id) の一意制約で重複付与を防ぐ。"""

    __tablename__ = "conversions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    external_conversion_id: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))
    click_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("offer_clicks.id", ondelete="SET NULL")
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(16))
    reject_reason: Mapped[str | None] = mapped_column(String(64))
    reward_tickets: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    payout: Mapped[str | None] = mapped_column(String(32))
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ticket_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("ticket_transactions.id", ondelete="SET NULL")
    )
    raw: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    __table_args__ = (
        UniqueConstraint("provider", "external_conversion_id"),
        CheckConstraint("status in ('credited','rejected')", name="status_valid"),
    )


class PostbackLog(Base):
    """受信したすべての成果通知（署名不正なものを含む）の監査ログ。"""

    __tablename__ = "postback_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    outcome: Mapped[str] = mapped_column(String(32), index=True)
    detail: Mapped[str | None] = mapped_column(String(200))
    ip: Mapped[str | None] = mapped_column(String(64))
    params: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class Mission(Base, TimestampMixin):
    """キャンペーン参加・条件達成でチケットがもらえるミッション。"""

    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    reward_tickets: Mapped[int] = mapped_column(Integer)
    condition_type: Mapped[str] = mapped_column(String(32))
    condition_value: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    __table_args__ = (CheckConstraint("reward_tickets > 0", name="reward_positive"),)


class MissionClaim(Base):
    __tablename__ = "mission_claims"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("mission_id", "user_id"),)


class Notification(Base):
    """ユーザー個別のお知らせ（通知履歴）。"""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    link: Mapped[str | None] = mapped_column(String(300))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)


class Announcement(Base, TimestampMixin):
    """全体向けのお知らせ。"""

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(24), default="info", server_default="info")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(254))
    category: Mapped[str] = mapped_column(String(32))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DailyLoginClaim(Base):
    """ログインボーナス受取記録。(user_id, jst_date) の一意制約で 1 日 1 回を保証。"""

    __tablename__ = "daily_login_claims"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    jst_date: Mapped[str] = mapped_column(String(10))
    streak: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "jst_date"),)


class AdminMessage(Base):
    """運営から会員へのメッセージ配信の履歴。受信者ごとの本文は notifications に保存される。"""

    __tablename__ = "admin_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # users（指定した会員）/ all（全会員）/ verified（メール確認済み会員）
    target_type: Mapped[str] = mapped_column(String(16))
    target_user_ids: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    send_email: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    recipient_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    email_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class Banner(Base, TimestampMixin):
    """トップページのキャンペーンバナー。"""

    __tablename__ = "banners"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tag: Mapped[str] = mapped_column(String(16), default="", server_default="")  # PICK UP / NEW / LAST ONE など
    tag_color: Mapped[str] = mapped_column(String(16), default="pink", server_default="pink")  # pink / gold / purple / blue
    title: Mapped[str] = mapped_column(String(60))
    subtitle: Mapped[str] = mapped_column(String(80), default="", server_default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    link: Mapped[str] = mapped_column(String(300), default="/gacha", server_default="/gacha")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class NewsletterSubscription(Base):
    """フッターの「最新情報を受け取る」メール登録。"""

    __tablename__ = "newsletter_subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
