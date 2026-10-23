"""ポイント交換（貯めたポイントで景品・デジタルギフトと交換する）。"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin


class ShopItem(Base, TimestampMixin):
    """交換できる景品（管理画面で追加・編集・在庫設定）。"""

    __tablename__ = "shop_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    brand: Mapped[str] = mapped_column(String(40), default="", server_default="")  # 例：デジコ、Amazon
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(16))
    point_cost: Mapped[int] = mapped_column(Integer)
    face_value_yen: Mapped[int | None] = mapped_column(Integer)  # 額面（円）。表示と景品表示法の確認用
    # 在庫：null は無制限。デジタルギフトで「ギフトコード在庫」を使う場合は、登録済みの未使用コード数も上限になる
    stock_total: Mapped[int | None] = mapped_column(Integer)
    stock_remaining: Mapped[int | None] = mapped_column(Integer)
    per_user_limit: Mapped[int | None] = mapped_column(Integer)  # 1 人あたりの交換上限（null は無制限）
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("kind in ('digital_code','shipping')", name="shop_kind_valid"),
        CheckConstraint("point_cost > 0", name="shop_cost_positive"),
        CheckConstraint("stock_remaining is null or stock_remaining >= 0", name="shop_stock_non_negative"),
    )


class GiftCode(Base):
    """デジタルギフトのコード在庫。管理画面でまとめて登録し、交換時に 1 件ずつ自動でお渡しする。
    コードは暗号化して保存し、重複登録は照合用ハッシュで防ぐ。"""

    __tablename__ = "gift_codes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("shop_items.id", ondelete="CASCADE"))
    code_encrypted: Mapped[str] = mapped_column(Text)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop_orders.id", ondelete="SET NULL"), unique=True)
    expires_on: Mapped[str | None] = mapped_column(String(10))  # 有効期限（YYYY-MM-DD、表示用）
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_gift_codes_available", "item_id", postgresql_where="order_id is null and assigned_at is null"),)


class ShopOrder(Base, TimestampMixin):
    """ポイント交換の申請。申請時にポイントを消費し、取消時は返還する。"""

    __tablename__ = "shop_orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("shop_items.id", ondelete="RESTRICT"), index=True)
    item_name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(16))
    point_cost: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64))
    # 発送する景品の場合のお届け先（暗号化）と表示用の伏せ字
    shipping_encrypted: Mapped[str | None] = mapped_column(Text)
    recipient_masked: Mapped[str | None] = mapped_column(String(100))
    carrier: Mapped[str | None] = mapped_column(String(40))
    tracking_number: Mapped[str | None] = mapped_column(String(64))
    admin_note: Mapped[str | None] = mapped_column(String(500))
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    item: Mapped[ShopItem] = relationship(lazy="raise")
    gift_code: Mapped["GiftCode | None"] = relationship(lazy="raise", uselist=False, primaryjoin="GiftCode.order_id == ShopOrder.id", viewonly=True)

    __table_args__ = (
        CheckConstraint("kind in ('digital_code','shipping')", name="order_kind_valid"),
        CheckConstraint("status in ('pending','fulfilled','shipped','cancelled')", name="order_status_valid"),
        Index("uq_shop_orders_user_idem", "user_id", "idempotency_key", unique=True),
    )


class Coupon(Base, TimestampMixin):
    """クーポンコード（チケットを配布する）。

    - single：使い捨て型。1 回使われたら無効（SNS の DM で個別に配る用）
    - shared：先着型。全員共通のあいことばで、上限回数（max_uses）に達したら無効。1 人 1 回まで
    """

    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # 大文字で保存し、大文字・小文字を区別せず照合
    kind: Mapped[str] = mapped_column(String(8))
    tickets: Mapped[int] = mapped_column(Integer)
    max_uses: Mapped[int] = mapped_column(Integer)  # single は 1
    uses: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    note: Mapped[str] = mapped_column(String(100), default="", server_default="")  # 管理用のメモ（配布先など）
    batch_id: Mapped[str | None] = mapped_column(String(32), index=True)  # まとめて発行したときの識別子
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint("kind in ('single','shared')", name="coupon_kind_valid"),
        CheckConstraint("tickets > 0", name="coupon_tickets_positive"),
        CheckConstraint("max_uses > 0", name="coupon_max_uses_positive"),
        CheckConstraint("uses >= 0 and uses <= max_uses", name="coupon_uses_within_max"),
    )


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("uq_coupon_redemptions_coupon_user", "coupon_id", "user_id", unique=True),)


class RankEffect(Base):
    """当選ランクごとの表示名・演出動画・ロゴ（管理画面で設定）。rarity は内部のランク（SSR/SR/R/N）。"""

    __tablename__ = "rank_effects"

    rarity: Mapped[str] = mapped_column(String(8), primary_key=True)
    label: Mapped[str] = mapped_column(String(20))
    video_url: Mapped[str | None] = mapped_column(String(500))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (CheckConstraint("rarity in ('N','R','SR','SSR')", name="rank_effect_rarity_valid"),)
