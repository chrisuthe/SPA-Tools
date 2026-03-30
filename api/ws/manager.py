from fastapi import WebSocket
from typing import Dict, Set
import json


class WSManager:
    """Manages WebSocket connections grouped by channel."""

    def __init__(self):
        self._channels: Dict[str, Set[WebSocket]] = {}

    async def connect(self, channel: str, ws: WebSocket):
        await ws.accept()
        if channel not in self._channels:
            self._channels[channel] = set()
        self._channels[channel].add(ws)

    def disconnect(self, channel: str, ws: WebSocket):
        if channel in self._channels:
            self._channels[channel].discard(ws)

    async def broadcast(self, channel: str, data: dict):
        if channel not in self._channels:
            return
        dead = []
        for ws in self._channels[channel]:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._channels[channel].discard(ws)


ws_manager = WSManager()
