"""プロセス内の短時間キャッシュ（アクセス集中時に、同じ公開情報の DB 読み込みを 1 秒に 1 回程度に抑える）。

- 値はワーカー（プロセス）ごとに持つ。期限切れまでの間は少し古い値を返すことがある（ガチャの残り口数なら最大 1 秒程度）
- 更新処理（抽選・設定変更など）の直後は、そのワーカーのキャッシュを消して新しい値を返す
"""

import time
from collections.abc import Awaitable, Callable
from typing import Any

_store: dict[str, tuple[float, Any]] = {}


async def cached(key: str, ttl: float, load: Callable[[], Awaitable[Any]]) -> Any:
    now = time.monotonic()
    hit = _store.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = await load()
    _store[key] = (now + ttl, value)
    return value


def invalidate(prefix: str = "") -> None:
    for k in [k for k in _store if k.startswith(prefix)]:
        _store.pop(k, None)


def clear() -> None:
    _store.clear()
