from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """ユーザーに表示可能な日本語メッセージを持つ業務エラー。"""

    status_code = 400

    def __init__(self, code: str, message: str, status_code: int | None = None, **extra):
        self.code = code
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.extra = extra
        super().__init__(message)


class NotFound(AppError):
    status_code = 404

    def __init__(self, message: str = "対象が見つかりません。"):
        super().__init__("not_found", message)


class Forbidden(AppError):
    status_code = 403

    def __init__(self, message: str = "この操作を行う権限がありません。"):
        super().__init__("forbidden", message)


class Unauthorized(AppError):
    status_code = 401

    def __init__(self, message: str = "ログインが必要です。"):
        super().__init__("unauthorized", message)


class Conflict(AppError):
    status_code = 409


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, **exc.extra}},
    )
