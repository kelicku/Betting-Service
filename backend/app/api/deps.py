from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, Forbidden, Unauthorized
from app.core.ratelimit import hit
from app.core.security import sha256_hex
from app.models import User, UserSession
from app.models.enums import Role, UserStatus
from app.services import settings_store
from app.services.audit import client_ip

DB = Annotated[AsyncSession, Depends(get_db)]


async def _session_user(request: Request, db: AsyncSession) -> tuple[User, UserSession] | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    now = datetime.now(UTC)
    row = (
        await db.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.token_hash == sha256_hex(token),
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )
    ).first()
    if row is None:
        return None
    sess, user = row
    if user.status != UserStatus.active:
        return None
    if now - sess.last_seen_at > timedelta(minutes=5):
        sess.last_seen_at = now
        await db.commit()
    request.state.session_id = sess.id
    return user, sess


async def optional_user(request: Request, db: DB) -> User | None:
    res = await _session_user(request, db)
    return res[0] if res else None


async def current_user(request: Request, db: DB) -> User:
    res = await _session_user(request, db)
    if res is None:
        raise Unauthorized()
    return res[0]


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]


async def verified_user(user: CurrentUser) -> User:
    if user.email_verified_at is None:
        raise AppError(
            "email_not_verified",
            "この操作にはメールアドレスの確認が必要です。マイページから確認メールを再送できます。",
            403,
        )
    return user


VerifiedUser = Annotated[User, Depends(verified_user)]


async def phone_verified_user(user: CurrentUser, db: DB) -> User:
    """ポイント交換・景品の発送申請の前の確認。SMS 認証が必須の設定なら、電話番号の確認も済んでいること。
    （お客さまの方針：SMS 認証は登録時ではなく、初めてポイントを交換する・景品の発送を申請するときに行う）"""
    from app.services import sms

    if await sms.is_required_for(db, user):
        raise AppError("phone_not_verified", "ポイント交換・景品の発送申請の前に、電話番号の確認（SMS 認証）が必要です。", 403)
    return user


PhoneVerifiedUser = Annotated[User, Depends(phone_verified_user)]


async def not_in_maintenance(db: DB, user: CurrentUser) -> None:
    if user.role == Role.user and await settings_store.get(db, "maintenance_mode"):
        raise AppError(
            "maintenance", await settings_store.get(db, "maintenance_message"), status_code=503
        )


async def require_staff(user: CurrentUser) -> User:
    if user.role not in (Role.staff, Role.admin):
        raise Forbidden()
    return user


async def require_admin(user: CurrentUser) -> User:
    if user.role != Role.admin:
        raise Forbidden("この操作は管理者のみ実行できます。")
    return user


StaffUser = Annotated[User, Depends(require_staff)]
AdminUser = Annotated[User, Depends(require_admin)]


def rate_limit(name: str, limit: int, window: int, per: str = "ip"):
    """エンドポイント単位のレート制限依存関係。per='ip' または 'user'。"""

    async def dep(request: Request) -> None:
        if per == "user":
            token = request.cookies.get(settings.session_cookie_name) or client_ip(request) or "-"
            ident = sha256_hex(token)[:16]
        else:
            ident = client_ip(request) or "-"
        await hit(f"{name}:{ident}", limit, window)

    return Depends(dep)
