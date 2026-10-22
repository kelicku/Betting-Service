from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminAuditLog, User


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    # リバースプロキシ配下では uvicorn --proxy-headers / forwarded-allow-ips で client.host が補正される
    return request.client.host if request.client else None


def audit(
    db: AsyncSession,
    actor: User | None,
    action: str,
    target_type: str | None = None,
    target_id: object | None = None,
    detail: dict | None = None,
    request: Request | None = None,
) -> None:
    """管理者操作の監査ログ。呼び出し元のトランザクションと一緒に COMMIT される。"""
    db.add(
        AdminAuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            detail=detail or {},
            ip=client_ip(request),
            user_agent=(request.headers.get("user-agent", "")[:300] if request else None),
        )
    )
