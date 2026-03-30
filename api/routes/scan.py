import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.state import app_state
from api.ws.manager import ws_manager

router = APIRouter(prefix="/api", tags=["scan"])


class ScanRequest(BaseModel):
    start: int = 0xDD00
    end: int = 0xDDFF


@router.post("/scan")
async def start_scan(req: ScanRequest) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if app_state.scan_running:
        raise HTTPException(400, "Scan already running")

    app_state.scan_running = True
    app_state.scan_results = {}

    # Run scan in background task
    asyncio.create_task(_run_scan(req.start, req.end))
    return {"status": "started", "start": f"0x{req.start:04X}", "end": f"0x{req.end:04X}"}


@router.delete("/scan")
async def stop_scan() -> dict:
    app_state.scan_running = False
    return {"status": "stopped"}


@router.get("/scan/results")
async def get_results() -> dict:
    return {
        "running": app_state.scan_running,
        "total_responsive": len(app_state.scan_results),
        "results": {
            f"0x{did:04X}": data.hex() for did, data in app_state.scan_results.items()
        },
    }


async def _run_scan(start: int, end: int):
    from protocol.uds import read_did
    total = end - start + 1
    for i, did in enumerate(range(start, end + 1)):
        if not app_state.scan_running:
            break
        try:
            result = read_did(app_state.uds_client, did)
            if result is not None:
                app_state.scan_results[did] = result
        except Exception:
            pass

        progress = {
            "current_did": f"0x{did:04X}",
            "percent": round((i + 1) / total * 100, 1),
            "found_count": len(app_state.scan_results),
        }
        await ws_manager.broadcast("scan-progress", progress)
        await asyncio.sleep(0.05)  # Yield to event loop

    app_state.scan_running = False
    await ws_manager.broadcast("scan-progress", {
        "current_did": f"0x{end:04X}",
        "percent": 100,
        "found_count": len(app_state.scan_results),
        "complete": True,
    })
