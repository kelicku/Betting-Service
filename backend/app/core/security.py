import base64
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
# ユーザーが存在しない場合にも同程度の計算時間をかけ、存在有無の推測を防ぐ
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def hmac_hex(message: str, key: str | None = None) -> str:
    return hmac.new((key or settings.secret_key).encode(), message.encode(), hashlib.sha256).hexdigest()


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _fernet() -> Fernet:
    key = settings.pii_encryption_key
    if not key:
        # 開発用：secret_key から決定的に鍵を導出
        key = base64.urlsafe_b64encode(hashlib.sha256(("pii:" + settings.secret_key).encode()).digest())
    return Fernet(key)


def encrypt_pii(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_pii(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
