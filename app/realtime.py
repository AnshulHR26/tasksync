from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Keeps each user's open browser tabs so changes can be pushed to all of them."""

    def __init__(self) -> None:
        self.connections: dict[int, set[WebSocket]] = defaultdict(set)

    def add(self, user_id: int, ws: WebSocket) -> None:
        self.connections[user_id].add(ws)

    def remove(self, user_id: int, ws: WebSocket) -> None:
        self.connections[user_id].discard(ws)
        if not self.connections[user_id]:
            self.connections.pop(user_id, None)

    async def notify(self, user_id: int, event: str, task_id: int | None = None) -> None:
        for ws in list(self.connections.get(user_id, ())):
            try:
                await ws.send_json({"event": event, "task_id": task_id})
            except Exception:
                self.remove(user_id, ws)


manager = ConnectionManager()
