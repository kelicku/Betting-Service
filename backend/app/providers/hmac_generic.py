"""汎用 HMAC 署名方式のポストバック。

通知パラメータ:
  click_id, conversion_id, status (approved|rejected|pending), payout(任意), ts (UNIX 秒), sig
署名:
  sig = HMAC-SHA256(secret, "&".join(f"{k}={v}" for k, v in sorted(params) if k != "sig"))
"""

import hashlib
import hmac
import os
import time

from app.core.config import settings
from app.providers.base import BaseProvider, PostbackData, PostbackRejected


def canonical(params: dict[str, str]) -> str:
    return "&".join(f"{k}={params[k]}" for k in sorted(params) if k != "sig")


def sign(params: dict[str, str], secret: str) -> str:
    return hmac.new(secret.encode(), canonical(params).encode(), hashlib.sha256).hexdigest()


class HmacProvider(BaseProvider):
    def __init__(self, name: str, secret: str | None = None, allowed_ips: list[str] | None = None, is_test: bool = False):
        self.name = name
        self._secret = secret
        self._allowed_ips = allowed_ips
        self.is_test = is_test

    @property
    def secret(self) -> str | None:
        return self._secret or os.environ.get(f"POSTBACK_SECRET_{self.name.upper()}")

    @property
    def allowed_ips(self) -> list[str]:
        if self._allowed_ips is not None:
            return self._allowed_ips
        raw = os.environ.get(f"POSTBACK_IPS_{self.name.upper()}", "")
        return [s.strip() for s in raw.split(",") if s.strip()]

    def parse(self, params: dict[str, str], headers: dict[str, str], ip: str | None) -> PostbackData:
        secret = self.secret
        if not secret:
            raise PostbackRejected("provider_not_configured", "secret is not configured", 503)
        if self.allowed_ips and ip not in self.allowed_ips:
            raise PostbackRejected("ip_not_allowed", f"ip {ip}", 403)
        sig = params.get("sig", "")
        if not sig or not hmac.compare_digest(sign(params, secret), sig):
            raise PostbackRejected("bad_signature", "signature mismatch", 403)
        try:
            ts = int(params.get("ts", "0"))
        except ValueError:
            ts = 0
        if abs(time.time() - ts) > settings.postback_max_skew_seconds:
            raise PostbackRejected("stale", "timestamp out of range", 403)
        for k in ("click_id", "conversion_id", "status"):
            if not params.get(k):
                raise PostbackRejected("missing_param", k, 400)
        status = params["status"]
        if status not in ("approved", "rejected", "pending"):
            raise PostbackRejected("bad_status", status, 400)
        return PostbackData(
            conversion_id=params["conversion_id"][:128],
            click_id=params["click_id"],
            status=status,  # type: ignore[arg-type]
            payout=params.get("payout"),
            raw={k: v for k, v in params.items() if k != "sig"},
        )
