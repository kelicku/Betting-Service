"""運営から会員へのメッセージ配信。

- サイト内のお知らせ（notifications）として全受信者に届ける（1 本の INSERT … SELECT で作成）
- 「メールでも送る」場合は、メール確認済みの会員にのみ送信する。送信はレスポンス返却後に行う
"""

from sqlalchemy import Select, func, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import settings
from app.core.errors import AppError
from app.models import AdminMessage, Notification, User
from app.models.enums import UserStatus
from app.services.auth import DEMO_EMAIL_DOMAIN

TARGET_LABELS = {"users": "指定した会員", "all": "全会員", "verified": "メール確認済みの会員"}


def _recipients(target_type: str, user_ids: list[int]) -> Select:
    q = select(User.id).where(User.status == UserStatus.active)
    if target_type == "users":
        if not user_ids:
            raise AppError("no_recipients", "送信先の会員を選択してください。")
        q = q.where(User.id.in_(user_ids))
    elif target_type == "verified":
        q = q.where(User.email_verified_at.is_not(None))
    elif target_type != "all":
        raise AppError("invalid_target", "送信先の指定が正しくありません。")
    return q


def _emailable(q: Select) -> Select:
    # メール確認済み・お試しアカウント以外の会員だけにメールを送る
    return q.where(User.email_verified_at.is_not(None), ~User.email.endswith("@" + DEMO_EMAIL_DOMAIN))


async def count_recipients(db: AsyncSession, target_type: str, user_ids: list[int]) -> tuple[int, int]:
    q = _recipients(target_type, user_ids)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    emailable = await db.scalar(select(func.count()).select_from(_emailable(q).subquery())) or 0
    return total, emailable


async def send(
    db: AsyncSession,
    sender: User,
    target_type: str,
    user_ids: list[int],
    title: str,
    body: str,
    link: str | None,
    send_email: bool,
) -> tuple[AdminMessage, list[tuple[str, str]]]:
    """メッセージを保存し、(配信履歴, メール送信先の一覧) を返す。メール送信は呼び出し元で行う。"""
    q = _recipients(target_type, user_ids)
    res = await db.execute(
        insert(Notification).from_select(
            ["user_id", "kind", "title", "body", "link"],
            q.with_only_columns(User.id, literal("message"), literal(title), literal(body), literal(link)),
        )
    )
    count = res.rowcount or 0
    if count == 0:
        raise AppError("no_recipients", "送信先の会員が見つかりません（利用停止中の会員には送信されません）。")
    emails: list[tuple[str, str]] = []
    if send_email:
        emails = [(e, n) for e, n in (await db.execute(_emailable(q).with_only_columns(User.email, User.display_name))).all()]
    msg = AdminMessage(
        sender_id=sender.id,
        target_type=target_type,
        target_user_ids=user_ids if target_type == "users" else [],
        title=title,
        body=body,
        link=link,
        send_email=send_email,
        recipient_count=count,
        email_count=len(emails),
    )
    db.add(msg)
    await db.flush()
    return msg, emails


async def deliver_emails(recipients: list[tuple[str, str]], title: str, body: str, link: str | None) -> None:
    url = f"{settings.public_base_url}{link or '/notifications'}"
    for email, name in recipients:
        await mail.send_mail(
            email,
            f"【{settings.app_name}】{title}",
            f"{name} 様\n\n{body}\n\n詳しくはこちら：{url}\n\n──────────────\n{settings.app_name}\n"
            "このメールは送信専用です。",
        )
