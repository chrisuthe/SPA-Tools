from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/scan-progress")
async def scan_progress_ws(ws: WebSocket):
    await ws_manager.connect("scan-progress", ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect("scan-progress", ws)
