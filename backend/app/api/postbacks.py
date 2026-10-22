from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

from app.api.deps import DB
from app.core.ratelimit import hit
from app.providers.registry import get_provider
from app.services import offers
from app.services.audit import client_ip

router = APIRouter(prefix="/postbacks", tags=["成果通知（サーバー間）"])


@router.api_route("/{provider_name}", methods=["GET", "POST"], response_class=PlainTextResponse)
async def postback(provider_name: str, request: Request, db: DB):
    """広告・アンケート事業者からの成果通知を受け取る。署名・時刻・click_id を検証し、
    正しく確認できた成果に対してのみチケットを付与する。"""
    provider = get_provider(provider_name)
    if provider is None:
        return PlainTextResponse("unknown provider", status_code=404)
    ip = client_ip(request)
    await hit(f"postback:{provider_name}:{ip}", 600, 60)
    params = {k: v for k, v in request.query_params.items()}
    if request.method == "POST":
        ctype = request.headers.get("content-type", "")
        if "application/json" in ctype:
            body = await request.json()
            if isinstance(body, dict):
                params.update({k: str(v) for k, v in body.items()})
        elif "form" in ctype:
            form = await request.form()
            params.update({k: str(v) for k, v in form.items()})
    res = await offers.handle_postback(db, provider, params, dict(request.headers), ip)
    return PlainTextResponse("OK" if res.http_status == 200 else res.outcome, status_code=res.http_status)
