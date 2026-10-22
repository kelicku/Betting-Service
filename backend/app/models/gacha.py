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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.enums import GachaMode, GachaStatus, UserPrizeStatus


class Prize(Base, TimestampMixin):
    """景品マスタ。複数のガチャで共有できる。"""

    __tablename__ = "prizes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    rarity: Mapped[str] = mapped_column(String(8), index=True)
    is_exchangeable: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    requires_shipping: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # 景品表示法の上限管理などに使う参考価格（円）
    reference_value_yen: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # トップページ「注目の景品」用：副題（例：星の乙女）と掲載フラグ・表示順
    subtitle: Mapped[str] = mapped_column(String(60), default="", server_default="")
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    featured_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # 0 より大きいと「ポイント景品」：当選すると、その数のポイントがポイント残高に自動で加算される（発送・交換申請なし）
    point_value: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("rarity in ('N','R','SR','SSR')", name="rarity_valid"),
        CheckConstraint("point_value >= 0", name="point_value_non_negative"),
    )


class Gacha(Base, TimestampMixin):
    __tablename__ = "gachas"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(100))
    subtitle: Mapped[str] = mapped_column(String(200), default="", server_default="")
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    banner_image_url: Mapped[str | None] = mapped_column(String(500))
    theme_color: Mapped[str] = mapped_column(String(16), default="#7654C8", server_default="#7654C8")
    ticket_cost: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(16), default=GachaMode.probability)
    status: Mapped[str] = mapped_column(String(16), default=GachaStatus.draft, index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 確率抽選方式での総口数上限（NULL なら無制限）。ボックス方式では在庫合計が口数になる
    max_pulls: Mapped[int | None] = mapped_column(Integer)
    pulls_done: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    allow_multi_10: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    allow_multi_100: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    last_one_prize_id: Mapped[int | None] = mapped_column(ForeignKey("prizes.id", ondelete="SET NULL"))
    last_one_description: Mapped[str] = mapped_column(Text, default="", server_default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # カードに表示するラベル（NEW／人気／限定／ラストワン賞 など。空なら表示しない）
    badge: Mapped[str] = mapped_column(String(16), default="", server_default="")

    items: Mapped[list["GachaItem"]] = relationship(
        back_populates="gacha", lazy="raise", order_by="GachaItem.sort_order"
    )
    last_one_prize: Mapped[Prize | None] = relationship(lazy="raise")

    __table_args__ = (
        CheckConstraint("ticket_cost > 0", name="ticket_cost_positive"),
        CheckConstraint("mode in ('probability','box')", name="mode_valid"),
        CheckConstraint("status in ('draft','published','archived')", name="status_valid"),
        CheckConstraint("pulls_done >= 0", name="pulls_done_non_negative"),
        CheckConstraint("max_pulls is null or pulls_done <= max_pulls", name="pulls_within_max"),
    )


class GachaItem(Base):
    """ガチャに含まれる景品と、その当選確率（重み）・在庫数。"""

    __tablename__ = "gacha_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gacha_id: Mapped[int] = mapped_column(ForeignKey("gachas.id", ondelete="CASCADE"), index=True)
    prize_id: Mapped[int] = mapped_column(ForeignKey("prizes.id", ondelete="RESTRICT"))
    # 確率抽選方式での重み。確率 = weight / 有効な重みの合計
    weight: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # NULL は在庫無制限（確率抽選方式のみ）
    stock_total: Mapped[int | None] = mapped_column(Integer)
    stock_remaining: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    gacha: Mapped[Gacha] = relationship(back_populates="items", lazy="raise")
    prize: Mapped[Prize] = relationship(lazy="raise")

    __table_args__ = (
        UniqueConstraint("gacha_id", "prize_id"),
        CheckConstraint("weight >= 0", name="weight_non_negative"),
        CheckConstraint("stock_remaining is null or stock_remaining >= 0", name="stock_non_negative"),
        CheckConstraint(
            "(stock_total is null) = (stock_remaining is null)", name="stock_both_or_none"
        ),
    )


class Draw(Base):
    """1 回の抽選リクエスト（1・10・100 回）。アニメーション開始前に確定・保存される。"""

    __tablename__ = "draws"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    gacha_id: Mapped[int] = mapped_column(ForeignKey("gachas.id", ondelete="RESTRICT"))
    count: Mapped[int] = mapped_column(Integer)
    tickets_spent: Mapped[int] = mapped_column(Integer)
    # この抽選で当たったポイント景品の合計（ポイント残高に加算済み）
    points_won: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    idempotency_key: Mapped[str] = mapped_column(String(64))
    # 抽選結果の改ざん検知用 HMAC
    result_digest: Mapped[str] = mapped_column(String(64))
    has_last_one: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    best_rarity: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    results: Mapped[list["DrawResult"]] = relationship(
        back_populates="draw", lazy="raise", order_by="DrawResult.position"
    )
    gacha: Mapped[Gacha] = relationship(lazy="raise")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key"),
        CheckConstraint("count in (1, 10, 100)", name="count_valid"),
        Index("ix_draws_user_created", "user_id", "created_at"),
        Index("ix_draws_gacha_created", "gacha_id", "created_at"),
        # 「最近の当選」表示用（高レアリティの抽選を新しい順に取得）
        Index("ix_draws_best_rarity_created", "best_rarity", "created_at"),
    )


class DrawResult(Base):
    __tablename__ = "draw_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    draw_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("draws.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    prize_id: Mapped[int] = mapped_column(ForeignKey("prizes.id", ondelete="RESTRICT"))
    gacha_item_id: Mapped[int | None] = mapped_column(ForeignKey("gacha_items.id", ondelete="SET NULL"))
    rarity: Mapped[str] = mapped_column(String(8))
    prize_name: Mapped[str] = mapped_column(String(100))
    is_last_one: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # 抽選時点のポイント景品の値（後から景品の設定を変えても履歴は変わらない）
    point_value: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    draw: Mapped[Draw] = relationship(back_populates="results", lazy="raise")
    prize: Mapped[Prize] = relationship(lazy="raise")

    __table_args__ = (UniqueConstraint("draw_id", "position"),)


class LastOneAward(Base):
    """ラストワン賞の付与記録。gacha_id の一意制約により重複付与を DB レベルで防ぐ。"""

    __tablename__ = "last_one_awards"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gacha_id: Mapped[int] = mapped_column(ForeignKey("gachas.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    draw_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("draws.id", ondelete="CASCADE"))
    prize_id: Mapped[int] = mapped_column(ForeignKey("prizes.id", ondelete="RESTRICT"))
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserPrize(Base):
    """ユーザーが獲得した景品（所持品）。"""

    __tablename__ = "user_prizes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    prize_id: Mapped[int] = mapped_column(ForeignKey("prizes.id", ondelete="RESTRICT"))
    source: Mapped[str] = mapped_column(String(16))
    draw_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("draws.id", ondelete="SET NULL"))
    draw_result_id: Mapped[int | None] = mapped_column(
        ForeignKey("draw_results.id", ondelete="SET NULL"), unique=True
    )
    gacha_id: Mapped[int | None] = mapped_column(ForeignKey("gachas.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), default=UserPrizeStatus.owned)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prize: Mapped[Prize] = relationship(lazy="raise")

    __table_args__ = (
        CheckConstraint(
            "status in ('owned','exchange_pending','exchanged')", name="status_valid"
        ),
        Index("ix_user_prizes_user_status", "user_id", "status"),
    )
