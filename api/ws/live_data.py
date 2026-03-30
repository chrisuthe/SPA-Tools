import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.state import app_state
from api.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/live-data")
async def live_data_ws(ws: WebSocket):
    await ws_manager.connect("live-data", ws)
    try:
        while True:
            # Wait for messages from client (e.g., config changes)
            msg = await ws.receive_text()
            # Client can send "start" / "stop" to control polling
    except WebSocketDisconnect:
        ws_manager.disconnect("live-data", ws)


async def poll_live_data(pids: list[str], interval: float = 1.0):
    """Background task that polls DIDs and broadcasts readings.
    Called from a route or startup hook when streaming is requested."""
    from live_data.reader import LiveDataReader
    from live_data.pids import get_dids_by_names

    dids = get_dids_by_names(pids)
    reader = LiveDataReader(app_state.uds_client, dids)

    async for readings in reader.poll(interval=interval):
        if not app_state.connected:
            break
        data = []
        for r in readings:
            data.append({
                "name": r.did_def.name,
                "did": f"0x{r.did_def.did:04X}",
                "value": r.value,
                "unit": r.did_def.unit,
                "error": r.error,
                "timestamp": r.timestamp,
            })
        await ws_manager.broadcast("live-data", {"readings": data})
