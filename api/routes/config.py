from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Union
from api.state import app_state

router = APIRouter(prefix="/api", tags=["config"])


class ConfigWriteRequest(BaseModel):
    value: Union[int, bool, str]


@router.get("/config/{module}")
async def read_config(module: str) -> list[dict]:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from config.reader import dump_all_config
        params = dump_all_config(app_state.uds_client)
        return params
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/config/{module}/{param}")
async def write_config(module: str, param: str, req: ConfigWriteRequest) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if not app_state.edit_mode:
        raise HTTPException(403, "Edit mode not active")
    try:
        from config.writer import write_param
        success = write_param(app_state.uds_client, param, req.value)
        if success:
            return {"status": "written", "param": param, "value": req.value}
        raise HTTPException(500, f"Failed to write {param}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/config/edit-mode")
async def enter_edit_mode() -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if app_state.edit_mode:
        return {"edit_mode": True}
    try:
        from protocol.session import SessionManager, SessionType
        if not app_state.session_manager:
            app_state.session_manager = SessionManager(app_state.uds_client)
        app_state.session_manager.switch(SessionType.EXTENDED)
        app_state.session_type = "EXTENDED"
        app_state.edit_mode = True
        return {"edit_mode": True}
    except Exception as e:
        raise HTTPException(500, f"Security access failed: {e}")


@router.delete("/config/edit-mode")
async def exit_edit_mode() -> dict:
    if app_state.session_manager:
        try:
            app_state.session_manager.reset_to_default()
        except Exception:
            pass
    app_state.session_type = "DEFAULT"
    app_state.edit_mode = False
    return {"edit_mode": False}
