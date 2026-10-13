"""Per-IP rate limits (backend-spec §5, §7): 5 login attempts and 60 public requests a minute.

Counts live in this process's memory: right for the single free server, and they
reset when it restarts. Each app instance gets its own limiters (see create_app),
so tests never share counts.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Depends, Request

from app.config import settings
from app.errors import AppError

LOGIN_PER_MINUTE = 5
PUBLIC_PER_MINUTE = 60
WINDOW_SECONDS = 60.0
# Forget idle addresses once this many are tracked, so memory stays bounded.
PRUNE_AT = 10_000


class SlidingWindowLimiter:
    """At most `limit` hits per `window` seconds for each key."""

    def __init__(self, limit: int, window: float = WINDOW_SECONDS, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window
        self.clock = clock
        self._hits: dict[str, deque[float]] = {}
        # Endpoints are plain functions run in a thread pool, so guard the shared dict.
        self._lock = threading.Lock()

    def hit(self, key: str) -> float:
        """Records a hit. Returns 0 if allowed, else the seconds until the next hit is allowed."""
        now = self.clock()
        with self._lock:
            if len(self._hits) >= PRUNE_AT:
                self._prune(now)
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return hits[0] + self.window - now
            hits.append(now)
            return 0.0

    def _prune(self, now: float) -> None:
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= now - self.window]:
            del self._hits[key]


def client_ip(request: Request, hops: int | None = None) -> str:
    """The visitor's address, as seen by our outermost trusted proxy (see Settings.trusted_proxy_hops)."""
    hops = settings.trusted_proxy_hops if hops is None else hops
    socket_ip = request.client.host if request.client else "unknown"
    if hops == 0:
        return socket_ip
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if len(forwarded) < hops:
        return socket_ip
    return forwarded[-hops]


def create_limiters() -> dict[str, SlidingWindowLimiter]:
    return {
        "login": SlidingWindowLimiter(LOGIN_PER_MINUTE),
        "public": SlidingWindowLimiter(PUBLIC_PER_MINUTE),
    }


def rate_limited(name: str):
    """A dependency that counts this request against the named limiter, or refuses it with 429."""

    def check(request: Request) -> None:
        limiter: SlidingWindowLimiter = request.app.state.limiters[name]
        wait = limiter.hit(client_ip(request))
        if wait > 0:
            raise AppError(429, "rate_limited", headers={"Retry-After": str(math.ceil(wait))})

    return Depends(check)
