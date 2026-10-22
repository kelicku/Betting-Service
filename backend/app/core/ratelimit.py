"""固定ウィンドウ方式のレート制限。Redis があれば共有し、なければプロセス内メモリで代替する。"""

import logging
import time

from redis import asyncio as aioredis

from app.core.config import settings
from app.core.errors import AppError

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None
_memory: dict[str, tuple[int, float]] = {}


def get_redis() -> aioredis.Redis | None:
    global _redis
    if _redis is None and settings.redis_url:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


class RateLimited(AppError):
    status_code = 429

    def __init__(self, retry_after: int):
        super().__init__(
            "rate_limited",
            "操作が集中しています。しばらく時間をおいてから再度お試しください。",
            retry_after=retry_after,
        )


async def hit(bucket: str, limit: int, window_seconds: int) -> None:
    if not settings.rate_limit_enabled:
        return
    now = time.time()
    window = int(now // window_seconds)
    key = f"rl:{bucket}:{window}"
    retry_after = int(window_seconds - (now % window_seconds)) + 1
    r = get_redis()
    if r is not None:
        try:
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, window_seconds + 1)
            count, _ = await pipe.execute()
            if int(count) > limit:
                raise RateLimited(retry_after)
            return
        except RateLimited:
            raise
        except Exception:  # Redis 障害時はメモリにフォールバック
            log.warning("rate limiter: redis unavailable, falling back to memory")
    count, exp = _memory.get(key, (0, now + window_seconds))
    count += 1
    _memory[key] = (count, exp)
    if len(_memory) > 50_000:
        for k in [k for k, (_, e) in _memory.items() if e < now]:
            _memory.pop(k, None)
    if count > limit:
        raise RateLimited(retry_after)


def reset_memory() -> None:
    _memory.clear()
