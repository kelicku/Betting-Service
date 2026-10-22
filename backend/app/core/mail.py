"""メール送信。開発環境では Mailpit（SMTP）に送信し、テストではメモリに保持する。
本番では SMTP 互換のメール送信サービス（Amazon SES / SendGrid 等）の SMTP 設定を指定する。"""

import logging
from dataclasses import dataclass
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

log = logging.getLogger(__name__)


@dataclass
class SentMail:
    to: str
    subject: str
    body: str


outbox: list[SentMail] = []


async def send_mail(to: str, subject: str, body: str, *, raise_errors: bool = False) -> None:
    if settings.mail_backend == "memory":
        outbox.append(SentMail(to, subject, body))
        return
    if settings.mail_backend == "console":
        log.info("MAIL to=%s subject=%s\n%s", to, subject, body)
        return
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            start_tls=settings.smtp_starttls,
            timeout=10,
        )
    except Exception:
        if raise_errors:
            raise
        # メール送信失敗で業務処理を止めない（エラー監視に記録）
        log.exception("failed to send mail to %s", to)


def _footer() -> str:
    return (
        "\n\n──────────────\n"
        f"{settings.app_name}\n{settings.public_base_url}\n"
        "このメールは送信専用です。お心当たりのない場合は破棄してください。"
    )


async def send_verify_email(to: str, name: str, token: str) -> None:
    url = f"{settings.public_base_url}/verify-email?token={token}"
    await send_mail(
        to,
        f"【{settings.app_name}】メールアドレスの確認",
        f"{name} 様\n\n{settings.app_name}へようこそ。\n"
        f"以下のリンクを開いて、メールアドレスの確認を完了してください（24時間有効）。\n\n{url}"
        + _footer(),
    )


async def send_reset_email(to: str, name: str, token: str) -> None:
    url = f"{settings.public_base_url}/reset-password?token={token}"
    await send_mail(
        to,
        f"【{settings.app_name}】パスワード再設定のご案内",
        f"{name} 様\n\nパスワード再設定のリクエストを受け付けました。\n"
        f"以下のリンクから新しいパスワードを設定してください（1時間有効）。\n\n{url}\n\n"
        "このリクエストに心当たりがない場合は、このメールを無視してください。"
        + _footer(),
    )
