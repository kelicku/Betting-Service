from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "わくわくガチャ"
    # フロントエンドの公開 URL（メール内リンクに使用）
    public_base_url: str = "http://localhost:3300"

    database_url: str = "postgresql+asyncpg://gacha:gacha@localhost:5470/gacha"
    # DB 接続数：1 ワーカーあたり最大 pool_size + max_overflow 本。
    # 「サーバー台数 × ワーカー数 × (pool_size + max_overflow)」が DB の最大接続数を下回るように設定する（docs/hosting-proposal.md）
    database_pool_size: int = 10
    database_max_overflow: int = 5
    database_pool_timeout: int = 30  # 接続が空くまで待つ秒数（超えたらエラー）
    redis_url: str | None = "redis://localhost:6390/0"

    # 署名・暗号化用の鍵。本番では必ず環境変数で上書きすること
    secret_key: str = Field(default="dev-insecure-secret-change-me", min_length=16)
    # 個人情報（配送先）暗号化用 Fernet 鍵。空なら secret_key から導出（開発用）
    pii_encryption_key: str | None = None

    session_cookie_name: str = "hf_session"
    csrf_cookie_name: str = "hf_csrf"
    session_ttl_hours: int = 24 * 14
    cookie_secure: bool = False
    cookie_domain: str | None = None

    # 認証の安全対策
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    rate_limit_enabled: bool = True

    # メール
    mail_backend: Literal["smtp", "console", "memory"] = "smtp"
    smtp_host: str = "localhost"
    smtp_port: int = 1030
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    mail_from: str = "わくわくガチャ <no-reply@hoshifuru.example>"
    ops_notify_email: str | None = None

    # SMS（電話番号の確認）。console：送らずにログへ出す（開発用）／memory：テスト用／twilio：Twilio で送信
    sms_backend: Literal["console", "memory", "twilio"] = "console"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None  # 送信元の電話番号（+1... など）
    twilio_messaging_service_sid: str | None = None  # 送信元番号の代わりに Messaging Service を使う場合
    sms_code_ttl_minutes: int = 10

    # デジコ（デジタルギフト）の自動発行。API 契約後に設定する（未設定の間はコード在庫・手動発行で運用）
    digico_api_base_url: str | None = None
    digico_api_key: str | None = None

    # オブジェクトストレージ
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: str = "var/uploads"
    storage_public_base_url: str = "/api/media"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "hoshifuru"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "ap-northeast-1"
    s3_public_base_url: str | None = None

    # エラー監視
    sentry_dsn: str | None = None

    # 広告・アンケート連携
    # 開発用の模擬成果（シミュレーション）を有効にするか。本番では常に無効
    enable_mock_offers: bool = True
    postback_max_skew_seconds: int = 600

    # デモ用のワンクリックログイン（お試しアカウントを自動作成）。本番では常に無効
    demo_login_enabled: bool = False
    demo_login_tickets: int = 30  # お試しアカウントに配るチケット（1 回 1〜5 枚のガチャを何度か引ける量）
    demo_login_points: int = 10000  # お試しアカウントに配るポイント（ポイント交換を試せる量）

    cors_origins: Annotated[list[str], NoDecode] = []
    # PUBLIC_BASE_URL 以外に、操作（POST 等）を受け付けるアクセス元。
    # デモ用の一時 URL（Cloudflare Tunnel 等）や、移行期間中の旧ドメインを指定する
    allowed_origins: Annotated[list[str], NoDecode] = []

    @property
    def allowed_origin_set(self) -> set[str]:
        return {o.rstrip("/") for o in [self.public_base_url, *self.cors_origins, *self.allowed_origins]}

    @field_validator("cors_origins", "allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def mock_offers_allowed(self) -> bool:
        return self.enable_mock_offers and not self.is_production

    @property
    def demo_login_allowed(self) -> bool:
        return self.demo_login_enabled and not self.is_production


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        if s.secret_key.startswith("dev-") or len(s.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be a strong random value in production")
        if not s.pii_encryption_key:
            raise RuntimeError("PII_ENCRYPTION_KEY is required in production")
        if not s.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true in production")
        if s.sms_backend != "twilio":
            # 本番で SMS を送らない設定のままにしない（SMS 認証を必須にしていない場合も、誤送信の防止のため明示させる）
            import logging

            logging.getLogger(__name__).warning("SMS_BACKEND is not 'twilio' in production; SMS codes will not be delivered")
    return s


settings = get_settings()
