"""トップページ用の公開 API：キャンペーンバナー・注目の景品・実績・メール登録・SNS。"""

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import DB, OptionalUser, rate_limit
from app.core.errors import AppError
from app.models import Banner, Gacha, GachaItem, NewsletterSubscription, Prize, TicketTransaction, User
from app.models.enums import GachaStatus, UserStatus
from app.services import settings_store
from app.services.auth import DEMO_EMAIL_DOMAIN

router = APIRouter(tags=["トップページ"])


@router.get("/banners", summary="開催中のキャンペーンバナー")
async def banners(db: DB):
    now = datetime.now(UTC)
    rows = (
        await db.execute(
            select(Banner)
            .where(
                Banner.is_active.is_(True),
                or_(Banner.starts_at.is_(None), Banner.starts_at <= now),
                or_(Banner.ends_at.is_(None), Banner.ends_at > now),
            )
            .order_by(Banner.sort_order, Banner.id)
        )
    ).scalars()
    return [
        {"id": b.id, "tag": b.tag, "tag_color": b.tag_color, "title": b.title, "subtitle": b.subtitle,
         "image_url": b.image_url, "link": b.link, "starts_at": b.starts_at, "ends_at": b.ends_at}
        for b in rows
    ]


@router.get("/featured-prizes", summary="注目の景品")
async def featured_prizes(db: DB):
    prizes = (
        await db.execute(
            select(Prize).where(Prize.is_featured.is_(True), Prize.is_active.is_(True)).order_by(Prize.featured_order, Prize.id).limit(10)
        )
    ).scalars().all()
    # 景品が含まれる公開中のガチャ（最初の 1 件）へのリンク
    links: dict[int, str] = {}
    if prizes:
        rows = (
            await db.execute(
                select(GachaItem.prize_id, Gacha.slug)
                .join(Gacha, Gacha.id == GachaItem.gacha_id)
                .where(GachaItem.prize_id.in_([p.id for p in prizes]), Gacha.status == GachaStatus.published)
                .order_by(Gacha.sort_order)
            )
        ).all()
        for pid, slug in rows:
            links.setdefault(pid, slug)
        lo = (
            await db.execute(
                select(Gacha.last_one_prize_id, Gacha.slug).where(
                    Gacha.last_one_prize_id.in_([p.id for p in prizes]), Gacha.status == GachaStatus.published
                )
            )
        ).all()
        for pid, slug in lo:
            links.setdefault(pid, slug)
    return [
        {"id": p.id, "name": p.name, "subtitle": p.subtitle, "rarity": p.rarity, "image_url": p.image_url,
         "description": p.description, "gacha_slug": links.get(p.id)}
        for p in prizes
    ]


@router.get("/stats/public", summary="公開している実績（会員数など）")
async def public_stats(db: DB):
    """実際のデータから集計する（架空の数値は表示しない）。お試しアカウントは会員数に含めない。"""
    users = await db.scalar(
        select(func.count()).select_from(User).where(
            User.status == UserStatus.active, User.email_verified_at.is_not(None), ~User.email.endswith("@" + DEMO_EMAIL_DOMAIN)
        )
    )
    tickets = await db.scalar(
        select(func.coalesce(func.sum(TicketTransaction.delta), 0)).where(TicketTransaction.delta > 0, TicketTransaction.is_test.is_(False))
    )
    items = await db.scalar(
        select(func.count(func.distinct(GachaItem.prize_id)))
        .join(Gacha, Gacha.id == GachaItem.gacha_id)
        .where(Gacha.status == GachaStatus.published, GachaItem.is_active.is_(True))
    )
    bonus = await settings_store.get(db, "signup_bonus_tickets")
    bonus_pt = await settings_store.get(db, "signup_bonus_points")
    return {"members": users or 0, "tickets_earned": int(tickets or 0), "items": items or 0,
            "signup_bonus": int(bonus or 0), "signup_bonus_points": int(bonus_pt or 0)}


@router.get("/site-links", summary="SNS などのリンク")
async def site_links(db: DB):
    v = await settings_store.get_all(db)

    def safe(u: str) -> str | None:
        # https 以外（javascript: など）はリンクとして出さない
        return u if isinstance(u, str) and u.startswith("https://") else None

    return {"x": safe(v["sns_x_url"]), "instagram": safe(v["sns_instagram_url"]), "youtube": safe(v["sns_youtube_url"])}


class NewsletterIn(BaseModel):
    email: EmailStr
    consent: bool


@router.post("/newsletter", summary="最新情報のメール登録", dependencies=[rate_limit("newsletter", 5, 3600)])
async def subscribe(body: NewsletterIn, user: OptionalUser, db: DB):
    if not body.consent:
        raise AppError("consent_required", "お知らせ・キャンペーン情報の受け取りに同意してください。")
    email = body.email.strip().lower()
    stmt = insert(NewsletterSubscription).values(email=email, user_id=user.id if user else None)
    stmt = stmt.on_conflict_do_update(index_elements=["email"], set_={"unsubscribed_at": None})
    await db.execute(stmt)
    await db.commit()
    # 登録済みかどうかは返さない（メールアドレスの存在確認に使われないように）
    return {"message": "ご登録ありがとうございます。最新情報をお届けします。"}
