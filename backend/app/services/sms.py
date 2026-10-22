"""SMS 認証（初回登録時の電話番号の確認）。

- 電話番号は保存しない。正規化した番号の HMAC（同じ番号での複数アカウントの防止）と末尾 4 桁だけを持つ
- 確認コードは 6 桁。ハッシュで保存し、有効期限（既定 10 分）・試行回数（5 回）で総当たりを防ぐ
- 送信回数の上限：1 アカウント 10 分に 3 回・1 日 10 回、同じ番号へは 1 日 5 回
- 送信は sms_backend で切り替え（開発：ログ出力、本番：Twilio）
"""

import hashlib
import hmac
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.models import SmsCode, User
from app.models.enums import Role
from app.services import settings_store

log = logging.getLogger(__name__)
MAX_ATTEMPTS = 5


@dataclass
class SentSms:
    to: str
    body: str


outbox: list[SentSms] = []  # sms_backend=memory（テスト）で送った内容


def now() -> datetime:
    return datetime.now(UTC)


def normalize_phone(raw: str) -> str:
    """日本の携帯番号（090-1234-5678、+81 90 1234 5678 など）を E.164 形式（+819012345678）にする。

    海外の番号は受け付けない（高額な海外番号へ確認コードを大量に送らせる「SMS パンピング」による費用の不正発生を防ぐ）。
    """
    s = re.sub(r"[\s\-‐ー－()（）]", "", raw.strip()).translate(str.maketrans("０１２３４５６７８９＋", "0123456789+"))
    if s.startswith("+81"):
        e164 = s
    elif s.startswith("0"):
        e164 = "+81" + s[1:]
    elif s.startswith("+"):
        raise AppError("invalid_phone", "日本の携帯電話番号を入力してください。")
    else:
        raise AppError("invalid_phone", "電話番号の形式が正しくありません。")
    # SMS を受け取れる携帯番号（070・080・090）に限る
    if not re.fullmatch(r"\+81[789]0\d{8}", e164):
        raise AppError("invalid_phone", "SMS を受信できる携帯電話番号（070・080・090 で始まる番号）を入力してください。")
    return e164


def phone_hash(e164: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"phone:{e164}".encode(), hashlib.sha256).hexdigest()


def _code_hash(code: str, sms_id_salt: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"sms:{sms_id_salt}:{code}".encode(), hashlib.sha256).hexdigest()


async def is_required_for(db: AsyncSession, user: User) -> bool:
    """この利用者に SMS 認証が必要で、まだ済んでいないか。運営スタッフ・お試しアカウントは対象外。"""
    from app.services.auth import is_demo_user

    if user.phone_verified_at is not None or user.role != Role.user or is_demo_user(user):
        return False
    return bool(await settings_store.get(db, "sms_verification_required"))


async def send_sms(to: str, body: str) -> None:
    if settings.sms_backend == "memory":
        outbox.append(SentSms(to, body))
        return
    if settings.sms_backend == "console":
        log.warning("SMS (console, not sent) to=***%s body=%s", to[-4:], body)
        return
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        raise AppError("sms_unavailable", "現在 SMS を送信できません。時間をおいてお試しください。", 503)
    data = {"To": to, "Body": body}
    if settings.twilio_messaging_service_sid:
        data["MessagingServiceSid"] = settings.twilio_messaging_service_sid
    elif settings.twilio_from_number:
        data["From"] = settings.twilio_from_number
    else:
        raise AppError("sms_unavailable", "現在 SMS を送信できません。時間をおいてお試しください。", 503)
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, data=data, auth=(settings.twilio_account_sid, settings.twilio_auth_token))
    except httpx.HTTPError as e:
        log.error("twilio request failed: %s", type(e).__name__)
        raise AppError("sms_unavailable", "SMS の送信に失敗しました。時間をおいてお試しください。", 503) from e
    if r.status_code >= 300:
        # 番号の誤りなど（Twilio のエラーコードのみ記録。番号・本文は記録しない）
        code = r.json().get("code") if r.headers.get("content-type", "").startswith("application/json") else None
        log.error("twilio error status=%s code=%s", r.status_code, code)
        raise AppError("sms_failed", "SMS を送信できませんでした。電話番号をご確認ください。", 400)


async def request_code(db: AsyncSession, user: User, raw_phone: str) -> str:
    """確認コードを送る。戻り値は表示用の末尾 4 桁。"""
    if user.phone_verified_at is not None:
        raise AppError("phone_already_verified", "電話番号は確認済みです。")
    e164 = normalize_phone(raw_phone)
    ph = phone_hash(e164)
    other = await db.scalar(select(User.id).where(User.phone_hash == ph, User.id != user.id))
    if other:
        raise AppError("phone_in_use", "この電話番号は別のアカウントで使われています。")

    t = now()
    async def sent_since(*conds, since):
        return await db.scalar(select(func.count()).select_from(SmsCode).where(*conds, SmsCode.created_at >= since)) or 0

    if await sent_since(SmsCode.user_id == user.id, since=t - timedelta(minutes=10)) >= 3:
        raise AppError("sms_rate_limited", "確認コードの送信回数が多すぎます。10 分ほどおいてからお試しください。", 429)
    if await sent_since(SmsCode.user_id == user.id, since=t - timedelta(days=1)) >= 10:
        raise AppError("sms_rate_limited", "本日の確認コードの送信回数の上限に達しました。明日お試しください。", 429)
    if await sent_since(SmsCode.phone_hash == ph, since=t - timedelta(days=1)) >= 5:
        raise AppError("sms_rate_limited", "この電話番号への本日の送信回数の上限に達しました。明日お試しください。", 429)

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_hex(8)
    row = SmsCode(
        user_id=user.id, phone_hash=ph, phone_last4=e164[-4:], code_hash=f"{salt}${_code_hash(code, salt)}",
        expires_at=t + timedelta(minutes=settings.sms_code_ttl_minutes),
    )
    db.add(row)
    await db.flush()
    await send_sms(e164, f"【わくわくガチャ】確認コード：{code}（{settings.sms_code_ttl_minutes}分間有効）。このコードを他人に教えないでください。")
    await db.commit()
    return e164[-4:]


async def verify_code(db: AsyncSession, user: User, code: str) -> None:
    code = code.strip().translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    row = (
        await db.execute(
            select(SmsCode)
            .where(SmsCode.user_id == user.id, SmsCode.used_at.is_(None))
            .order_by(SmsCode.id.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.expires_at < now():
        raise AppError("sms_code_expired", "確認コードの有効期限が切れています。もう一度コードを送信してください。")
    if row.attempts >= MAX_ATTEMPTS:
        raise AppError("sms_code_locked", "入力回数の上限に達しました。もう一度コードを送信してください。")
    row.attempts += 1
    salt, digest = row.code_hash.split("$", 1)
    if not re.fullmatch(r"\d{6}", code) or not hmac.compare_digest(digest, _code_hash(code, salt)):
        await db.commit()
        left = MAX_ATTEMPTS - row.attempts
        raise AppError("sms_code_invalid", f"確認コードが正しくありません（あと {left} 回入力できます）。")
    row.used_at = now()
    user.phone_hash = row.phone_hash
    user.phone_last4 = row.phone_last4
    user.phone_verified_at = now()
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise AppError("phone_in_use", "この電話番号は別のアカウントで使われています。") from e
    from app.services import referrals

    await referrals.maybe_reward(db, user)
    await db.commit()
