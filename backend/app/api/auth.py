from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser, rate_limit
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import hash_password, sha256_hex, verify_password
from app.models import Notification, UserSession
from app.schemas import (
    ChangePasswordIn,
    ForgotIn,
    LoginIn,
    MeOut,
    Message,
    ProfileIn,
    RegisterIn,
    ResetIn,
    SessionOut,
    TokenIn,
)
from app.services import auth as auth_svc
from app.services import points, tickets
from app.services import sms as sms_svc
from app.services.audit import client_ip

router = APIRouter(prefix="/auth", tags=["認証"])


async def me_out(db, user) -> MeOut:
    unread = await db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        email_verified=user.email_verified_at is not None,
        balance=await tickets.get_balance(db, user.id),
        point_balance=await points.get_balance(db, user.id),
        phone_verified=user.phone_verified_at is not None,
        sms_required=await sms_svc.is_required_for(db, user),
        invite_code=user.invite_code,
        unread_notifications=unread or 0,
        created_at=user.created_at,
    )


@router.get("/csrf", response_model=Message, summary="CSRF トークン Cookie を発行")
async def csrf(response: Response):
    auth_svc.set_csrf_cookie(response)
    return Message(message="ok")


@router.post(
    "/register", response_model=Message, status_code=202,
    dependencies=[rate_limit("register", 5, 3600)],
)
async def register(body: RegisterIn, request: Request, db: DB):
    if not body.agree_terms:
        raise AppError("terms_required", "利用規約とプライバシーポリシーへの同意が必要です。")
    await auth_svc.register(db, body.email, body.password, body.display_name, body.invite_code, ip=client_ip(request))
    return Message(message="確認メールを送信しました。メール内のリンクを開いて登録を完了してください。")


@router.post("/verify-email", response_model=MeOut, dependencies=[rate_limit("verify", 20, 3600)])
async def verify_email(body: TokenIn, request: Request, response: Response, db: DB):
    user = await auth_svc.verify_email(db, body.token)
    await auth_svc.create_session(db, user, request, response)
    await db.commit()
    return await me_out(db, user)


@router.post("/resend-verification", response_model=Message, dependencies=[rate_limit("resend", 3, 600, "user")])
async def resend_verification(user: CurrentUser, db: DB):
    await auth_svc.resend_verification(db, user)
    return Message(message="確認メールを再送しました。")


@router.post("/login", response_model=MeOut, dependencies=[rate_limit("login", 20, 600)])
async def login(body: LoginIn, request: Request, response: Response, db: DB):
    from app.core.ratelimit import hit

    await hit(f"login-email:{sha256_hex(body.email.lower())[:16]}", 10, 600)
    user = await auth_svc.authenticate(db, body.email, body.password)
    await auth_svc.create_session(db, user, request, response)
    await db.commit()
    return await me_out(db, user)


@router.post(
    "/demo-login", response_model=MeOut, summary="【デモ環境のみ】お試しアカウントでワンクリックログイン",
    dependencies=[rate_limit("demo-login", 10, 3600)],
)
async def demo_login(request: Request, response: Response, db: DB):
    user = await auth_svc.create_demo_user(db)
    await auth_svc.create_session(db, user, request, response)
    await db.commit()
    return await me_out(db, user)


@router.post("/logout", response_model=Message)
async def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        sess = await db.scalar(select(UserSession).where(UserSession.token_hash == sha256_hex(token)))
        if sess and sess.revoked_at is None:
            sess.revoked_at = auth_svc.now()
            await db.commit()
    auth_svc.clear_session_cookie(response)
    return Message(message="ログアウトしました。")


@router.post("/forgot-password", response_model=Message, dependencies=[rate_limit("forgot", 5, 3600)])
async def forgot_password(body: ForgotIn, db: DB):
    await auth_svc.request_password_reset(db, body.email)
    return Message(message="ご登録のメールアドレス宛に、パスワード再設定のご案内を送信しました。")


@router.post("/reset-password", response_model=Message, dependencies=[rate_limit("reset", 10, 3600)])
async def reset_password(body: ResetIn, db: DB):
    await auth_svc.reset_password(db, body.token, body.password)
    return Message(message="パスワードを再設定しました。新しいパスワードでログインしてください。")


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DB):
    return await me_out(db, user)


@router.patch("/me", response_model=MeOut)
async def update_profile(body: ProfileIn, user: CurrentUser, db: DB):
    user.display_name = body.display_name.strip()
    await db.commit()
    return await me_out(db, user)


@router.post("/change-password", response_model=Message, dependencies=[rate_limit("chpw", 10, 3600, "user")])
async def change_password(body: ChangePasswordIn, request: Request, user: CurrentUser, db: DB):
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("invalid_credentials", "現在のパスワードが正しくありません。", 400)
    auth_svc.validate_password(body.new_password)
    user.password_hash = hash_password(body.new_password)
    await auth_svc.revoke_all_sessions(db, user.id, except_id=getattr(request.state, "session_id", None))
    await db.commit()
    return Message(message="パスワードを変更しました。他の端末のログインは解除されました。")


@router.get("/sessions", response_model=list[SessionOut])
async def sessions(request: Request, user: CurrentUser, db: DB):
    rows = (
        await db.execute(
            select(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None), UserSession.expires_at > auth_svc.now())
            .order_by(UserSession.last_seen_at.desc())
        )
    ).scalars()
    cur = getattr(request.state, "session_id", None)
    return [
        SessionOut(id=s.id, created_at=s.created_at, last_seen_at=s.last_seen_at, ip=s.ip, user_agent=s.user_agent, current=s.id == cur)
        for s in rows
    ]


@router.post("/sessions/revoke-others", response_model=Message)
async def revoke_others(request: Request, user: CurrentUser, db: DB):
    await auth_svc.revoke_all_sessions(db, user.id, except_id=getattr(request.state, "session_id", None))
    await db.commit()
    return Message(message="他の端末からログアウトしました。")
