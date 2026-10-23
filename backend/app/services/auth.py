from datetime import UTC, datetime, timedelta

from fastapi import Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import (
    hash_password,
    new_token,
    password_needs_rehash,
    sha256_hex,
    verify_password,
)
from app.models import EmailToken, Notification, User, UserSession
from app.models.enums import PointKind, TicketKind, TokenPurpose, UserStatus
from app.services import points, settings_store, tickets
from app.services.audit import client_ip

TOKEN_TTL = {
    TokenPurpose.verify_email: timedelta(hours=24),
    TokenPurpose.reset_password: timedelta(hours=1),
}


def now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


# ── セッション ───────────────────────────────────────────


async def create_session(db: AsyncSession, user: User, request: Request, response: Response) -> None:
    token = new_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=sha256_hex(token),
            expires_at=now() + timedelta(hours=settings.session_ttl_hours),
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", "")[:300],
        )
    )
    user.last_login_at = now()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )
    # ログインごとに CSRF トークンも更新
    set_csrf_cookie(response)


def set_csrf_cookie(response: Response) -> str:
    token = new_token(24)
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=False,  # フロントエンドが読み取り X-CSRF-Token ヘッダーに設定する
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )
    return token


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/", domain=settings.cookie_domain)


async def revoke_all_sessions(db: AsyncSession, user_id: int, except_id=None) -> None:
    q = update(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_id is not None:
        q = q.where(UserSession.id != except_id)
    await db.execute(q.values(revoked_at=now()))


# ── メールトークン ────────────────────────────────────────


async def issue_token(db: AsyncSession, user: User, purpose: TokenPurpose) -> str:
    # 同じ目的の未使用トークンは無効化
    await db.execute(
        update(EmailToken)
        .where(EmailToken.user_id == user.id, EmailToken.purpose == purpose, EmailToken.used_at.is_(None))
        .values(used_at=now())
    )
    token = new_token()
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=sha256_hex(token),
            expires_at=now() + TOKEN_TTL[purpose],
        )
    )
    return token


async def consume_token(db: AsyncSession, token: str, purpose: TokenPurpose) -> User:
    row = (
        await db.execute(
            select(EmailToken)
            .where(EmailToken.token_hash == sha256_hex(token), EmailToken.purpose == purpose)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.used_at is not None or row.expires_at < now():
        raise AppError("invalid_token", "リンクが無効か、有効期限が切れています。もう一度お手続きください。")
    row.used_at = now()
    user = await db.get(User, row.user_id)
    assert user is not None
    return user


# ── 登録・認証 ─────────────────────────────────────────


def validate_password(password: str) -> None:
    if len(password) < 8 or len(password) > 128:
        raise AppError("weak_password", "パスワードは8文字以上128文字以内で入力してください。")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        raise AppError("weak_password", "パスワードには英字と数字をそれぞれ1文字以上含めてください。")


async def register(
    db: AsyncSession, email: str, password: str, display_name: str, invite_code: str | None = None, ip: str | None = None
) -> None:
    """新規登録。メールアドレスの登録有無を推測されないよう、結果に関わらず同じ応答を返す。"""
    email = normalize_email(email)
    validate_password(password)
    # 登録済みのアドレスかどうかを推測されないよう、上限の確認はアドレスの照合より先に行う
    await check_register_ip_limit(db, ip)
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        await mail.send_mail(
            email,
            f"【{settings.app_name}】ご登録について",
            "このメールアドレスは既に登録されています。\n"
            f"ログインはこちら：{settings.public_base_url}/login\n"
            f"パスワードをお忘れの場合：{settings.public_base_url}/forgot-password",
        )
        return
    from app.services import referrals

    inviter = await referrals.find_inviter(db, invite_code)
    user = User(email=email, password_hash=hash_password(password), display_name=display_name.strip(),
                referred_by_id=inviter.id if inviter else None, signup_ip=ip)
    db.add(user)
    await db.flush()
    await tickets.ensure_wallet(db, user.id)
    await referrals.ensure_invite_code(db, user)
    token = await issue_token(db, user, TokenPurpose.verify_email)
    await db.commit()
    await mail.send_verify_email(email, user.display_name, token)


async def check_register_ip_limit(db: AsyncSession, ip: str | None) -> None:
    """複数アカウント対策：同じネットワーク（IPv4 は同じアドレス、IPv6 は同じ /64）から今日（日本時間）新規登録できるアカウント数の上限。"""
    from app.core.netkey import net_key, same_net
    from app.services import offers, settings_store

    if net_key(ip) is None or not settings.rate_limit_enabled:
        return
    limit = int(await settings_store.get(db, "register_ip_daily_limit"))
    if limit <= 0:
        return
    count = await db.scalar(
        select(func.count()).select_from(User).where(
            User.signup_ip.is_not(None), same_net(User.signup_ip, ip), User.created_at >= offers.jst_day_start()
        )
    ) or 0
    if count >= limit:
        raise AppError(
            "register_ip_limit",
            "同じネットワーク（Wi-Fi など）からの新規登録が、今日の上限に達しました。明日あらためてお試しください。",
            429,
        )


async def resend_verification(db: AsyncSession, user: User) -> None:
    if user.email_verified_at:
        raise AppError("already_verified", "メールアドレスは既に確認済みです。")
    token = await issue_token(db, user, TokenPurpose.verify_email)
    await db.commit()
    await mail.send_verify_email(user.email, user.display_name, token)


async def verify_email(db: AsyncSession, token: str) -> User:
    # 確認済みのリンクをもう一度開いた場合（2 回クリックした・別の端末で開いた等）は、エラーではなく「確認済み」と案内する。
    # 使用済みのリンクではログインさせない（メールに残ったリンクからの不正なログインを防ぐ）
    used = await db.scalar(
        select(EmailToken).where(EmailToken.token_hash == sha256_hex(token), EmailToken.purpose == TokenPurpose.verify_email)
    )
    if used is not None and used.used_at is not None:
        owner = await db.get(User, used.user_id)
        if owner is not None and owner.email_verified_at is not None:
            raise AppError("already_verified", "このメールアドレスは確認済みです。ログインしてご利用ください。", 409)
    user = await consume_token(db, token, TokenPurpose.verify_email)
    await complete_email_verification(db, user)
    return user


async def complete_email_verification(db: AsyncSession, user: User) -> bool:
    """メールアドレスを確認済みにし、新規登録特典・友達紹介の特典を付与する（1 回だけ）。
    確認メールのリンクからと、管理画面の「確認済みにする」から呼ばれる。呼び出し側で commit する。"""
    if user.email_verified_at is not None:
        return False
    user.email_verified_at = now()
    bonus = await settings_store.get(db, "signup_bonus_tickets")
    if bonus > 0:
        # dedupe_key により新規登録特典は 1 ユーザー 1 回のみ
        await tickets.credit(
            db, user.id, bonus, TicketKind.signup_bonus, "新規登録特典",
            dedupe_key=f"signup:{user.id}",
        )
        db.add(
            Notification(
                user_id=user.id,
                kind="welcome",
                title=f"{settings.app_name}へようこそ",
                body=f"新規登録特典としてチケット{bonus}枚をお贈りしました。",
                link="/gacha",
            )
        )
    bonus_pt = await settings_store.get(db, "signup_bonus_points")
    if bonus_pt > 0:
        await points.credit(
            db, user.id, bonus_pt, PointKind.signup_bonus, "新規登録特典", dedupe_key=f"signup-pt:{user.id}",
        )
    from app.services import referrals

    await referrals.maybe_reward(db, user)
    return True


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    email = normalize_email(email)
    user = (
        await db.execute(select(User).where(User.email == email).with_for_update())
    ).scalar_one_or_none()
    generic = AppError("invalid_credentials", "メールアドレスまたはパスワードが正しくありません。", 401)
    if user is None:
        verify_password(password, None)  # タイミング差による存在推測を防ぐ
        raise generic
    if user.locked_until and user.locked_until > now():
        raise AppError(
            "account_locked",
            "ログインの失敗が続いたため、一時的にロックしています。しばらくしてから再度お試しください。",
            423,
        )
    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.login_max_failures:
            user.locked_until = now() + timedelta(minutes=settings.login_lock_minutes)
            user.failed_login_count = 0
        await db.commit()
        raise generic
    if user.status == UserStatus.suspended:
        raise AppError("account_suspended", "このアカウントは利用停止中です。お問い合わせください。", 403)
    user.failed_login_count = 0
    user.locked_until = None
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or user.status != UserStatus.active:
        return
    token = await issue_token(db, user, TokenPurpose.reset_password)
    await db.commit()
    await mail.send_reset_email(user.email, user.display_name, token)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    validate_password(new_password)
    user = await consume_token(db, token, TokenPurpose.reset_password)
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    if user.email_verified_at is None:
        # リセットメールを受け取れた＝メールアドレスの所有確認ができている
        user.email_verified_at = now()
    await revoke_all_sessions(db, user.id)
    await db.commit()


# ── デモ用ワンクリックログイン ─────────────────────────────

# お試しアカウントのメールアドレスに使うドメイン（.invalid は実在しないことが保証されたドメイン）
DEMO_EMAIL_DOMAIN = "guest.hoshifuru.invalid"


def is_demo_user(user: User) -> bool:
    return is_demo_email(user.email)


def is_demo_email(email: str) -> bool:
    return email.endswith("@" + DEMO_EMAIL_DOMAIN)


async def create_demo_user(db: AsyncSession) -> User:
    """お試しアカウントを作成する。閲覧者ごとに別アカウントになるため、残高や獲得景品が混ざらない。
    パスワードはランダム値のハッシュで、ワンクリックログイン以外ではログインできない。"""
    if not settings.demo_login_allowed:
        raise AppError("demo_disabled", "お試しログインは現在ご利用いただけません。", 404)
    suffix = new_token(6).replace("-", "x").replace("_", "y")[:8].lower()
    user = User(
        email=f"guest-{suffix}@{DEMO_EMAIL_DOMAIN}",
        password_hash=hash_password(new_token(32)),
        display_name=f"お試しゲスト{suffix[:4].upper()}",
        email_verified_at=now(),
    )
    db.add(user)
    await db.flush()
    if settings.demo_login_tickets > 0:
        await tickets.credit(
            db, user.id, settings.demo_login_tickets, TicketKind.admin_grant, "お試しアカウント用チケット",
            dedupe_key=f"demo:{user.id}",
        )
    if settings.demo_login_points > 0:
        await points.credit(
            db, user.id, settings.demo_login_points, PointKind.admin_grant, "お試しアカウント用ポイント",
            dedupe_key=f"demo-pt:{user.id}",
        )
    db.add(
        Notification(
            user_id=user.id,
            kind="welcome",
            title="お試しアカウントへようこそ",
            body=f"デモ版をお試しいただくためのチケット{settings.demo_login_tickets}枚と{settings.demo_login_points:,}ptをお贈りしました。"
            "お試しアカウントのデータは、予告なく削除される場合があります。",
            link="/gacha",
        )
    )
    return user
