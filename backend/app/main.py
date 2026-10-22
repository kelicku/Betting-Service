import logging
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import auth, points_shop, postbacks, showcase, user
from app.api.admin import catalog as admin_catalog
from app.api.admin import shop as admin_shop
from app.api.admin import users as admin_users
from app.core import cache
from app.core.config import settings
from app.core.db import engine
from app.core.errors import AppError, app_error_handler
from app.core.security import constant_time_eq

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.env, traces_sample_rate=0.1, send_default_pii=False)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# サーバー間通知は Cookie を使わず署名で検証するため CSRF の対象外
CSRF_EXEMPT_PREFIXES = ("/api/postbacks/",)


class SecurityMiddleware(BaseHTTPMiddleware):
    """CSRF 対策（ダブルサブミット Cookie ＋ Origin 検証）とセキュリティヘッダー。"""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if request.method not in SAFE_METHODS and path.startswith("/api/") and not path.startswith(CSRF_EXEMPT_PREFIXES):
            origin = request.headers.get("origin")
            allowed = settings.allowed_origin_set
            if origin and origin.rstrip("/") not in allowed:
                # 運用者が原因を特定できるよう、拒否したアクセス元と許可リストを記録する
                log.warning("csrf: rejected origin=%s path=%s allowed=%s", origin, path, sorted(allowed))
                return JSONResponse(
                    {
                        "error": {
                            "code": "origin_not_allowed",
                            "message": (
                                f"このアドレス（{origin}）からの操作は受け付けていません。"
                                f"お手数ですが、正式な URL（{settings.public_base_url}）からアクセスし直してください。"
                                "解決しない場合は、運営までお問い合わせください。"
                            ),
                        }
                    },
                    status_code=403,
                )
            cookie = request.cookies.get(settings.csrf_cookie_name, "")
            header = request.headers.get("x-csrf-token", "")
            if not cookie or not header or not constant_time_eq(cookie, header):
                log.info("csrf: token mismatch path=%s has_cookie=%s has_header=%s", path, bool(cookie), bool(header))
                return JSONResponse(
                    {
                        "error": {
                            "code": "csrf",
                            "message": (
                                "セキュリティ確認の有効期限が切れたため、操作を完了できませんでした。"
                                "ページを再読み込みしてから、もう一度お試しください。"
                                "解決しない場合は、ブラウザの Cookie が有効になっているかご確認ください。"
                            ),
                        }
                    },
                    status_code=403,
                )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if path.startswith("/api/") and not path.startswith("/api/media/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


app = FastAPI(
    title="わくわくガチャ API",
    version="1.0.0",
    description="WEBガチャプラットフォームのバックエンド API。抽選・チケット・ポイント・在庫の処理はすべてサーバー側で行います。",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.add_middleware(SecurityMiddleware)
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

app.add_exception_handler(AppError, app_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg", "")} for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": "入力内容に誤りがあります。", "fields": errors}},
    )


@app.middleware("http")
async def clear_cache_after_admin_write(request: Request, call_next):
    """管理画面での変更（ガチャ・景品・設定など）は、短時間キャッシュを消してすぐに反映する。"""
    response = await call_next(request)
    if request.method != "GET" and request.url.path.startswith("/api/admin/") and response.status_code < 400:
        cache.clear()
    return response


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "server_error", "message": "サーバーでエラーが発生しました。時間をおいて再度お試しください。"}},
    )


api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(user.router)
api.include_router(points_shop.router)
api.include_router(showcase.router)
api.include_router(postbacks.router)
admin = APIRouter(prefix="/admin", tags=["管理"])
admin.include_router(admin_users.router)
admin.include_router(admin_catalog.router)
admin.include_router(admin_shop.router)
api.include_router(admin)


@api.get("/health", tags=["運用"])
async def health():
    async with engine.connect() as conn:
        await conn.execute(text("select 1"))
    return {"status": "ok"}


@api.get("/config", tags=["運用"])
async def public_config():
    from app.providers.registry import get_provider

    return {
        "app_name": settings.app_name,
        "mock_offers": get_provider("mock") is not None,
        "demo_login": settings.demo_login_allowed,
        "demo_login_tickets": settings.demo_login_tickets,
        "env": settings.env,
    }


app.include_router(api)

if settings.storage_backend == "local":
    media = Path(settings.storage_local_dir)
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/api/media", StaticFiles(directory=media), name="media")
