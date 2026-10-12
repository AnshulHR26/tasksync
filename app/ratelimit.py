import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request


class RateLimiter:
    """Allows at most `limit` hits per `window` seconds for each key (kept in memory)."""

    def __init__(self, limit: int, window: int) -> None:
        self.limit = limit
        self.window = window
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry = int(self.window - (now - q[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many attempts. Try again in {max(retry // 60, 1)} minute(s).",
                    headers={"Retry-After": str(retry)},
                )
            q.append(now)
            if len(self.hits) > 10_000:  # forget idle keys so memory stays small
                for k in [k for k, v in self.hits.items() if not v or now - v[-1] > self.window]:
                    del self.hits[k]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


login_per_ip = RateLimiter(limit=20, window=300)      # 20 tries / 5 min from one address
login_per_email = RateLimiter(limit=8, window=300)    # 8 tries / 5 min on one account
register_per_ip = RateLimiter(limit=5, window=3600)   # 5 new accounts / hour from one address
