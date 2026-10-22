from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin


class ExchangeRequest(Base, TimestampMixin):
    """景品交換（発送）申請。配送先は申請時点のスナップショットを暗号化して保持する。"""

    __tablename__ = "exchange_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64))
    shipping_encrypted: Mapped[str | None] = mapped_column(Text)
    # 一覧表示用のマスク済み氏名（例: 星野 ●●）
    recipient_masked: Mapped[str | None] = mapped_column(String(60))
    carrier: Mapped[str | None] = mapped_column(String(40))
    tracking_number: Mapped[str | None] = mapped_column(String(64))
    admin_note: Mapped[str | None] = mapped_column(Text)
    user_message: Mapped[str | None] = mapped_column(String(500))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 個人情報の保持期限（完了後一定期間で配送先を消去する）
    pii_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["ExchangeItem"]] = relationship(back_populates="request", lazy="raise")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key"),
        CheckConstraint(
            "status in ('pending','approved','preparing','shipped','completed','rejected','cancelled')",
            name="status_valid",
        ),
    )


class ExchangeItem(Base):
    __tablename__ = "exchange_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("exchange_requests.id", ondelete="CASCADE"), index=True
    )
    user_prize_id: Mapped[int] = mapped_column(ForeignKey("user_prizes.id", ondelete="CASCADE"))
    # 却下・取消された申請の項目は active=false になり、再申請が可能になる
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    request: Mapped[ExchangeRequest] = relationship(back_populates="items", lazy="raise")
    user_prize = relationship("UserPrize", lazy="raise")

    __table_args__ = (
        # 同じ景品を二重に交換申請できないことを DB で保証
        Index(
            "uq_exchange_items_active_prize",
            "user_prize_id",
            unique=True,
            postgresql_where=text("active"),
        ),
    )


class ExchangeStatusLog(Base):
    __tablename__ = "exchange_status_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("exchange_requests.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
