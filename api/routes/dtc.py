from fastapi import APIRouter, HTTPException
from api.state import app_state

router = APIRouter(prefix="/api", tags=["dtc"])


@router.get("/dtc")
async def read_dtcs() -> list[dict]:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from dtc.reader import read_all_modules
        dtcs = read_all_modules(app_state.uds_client)
        return dtcs
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/dtc/{module}")
async def clear_dtcs(module: str) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from dtc.clearer import clear_module
        success = clear_module(app_state.uds_client, module)
        if success:
            return {"status": "cleared", "module": module}
        raise HTTPException(500, f"Failed to clear DTCs for {module}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
