from fastapi import APIRouter, HTTPException
from api.models import ConnectRequest, StatusResponse
from api.state import app_state

router = APIRouter(prefix="/api", tags=["connection"])


@router.post("/connect")
async def connect(req: ConnectRequest) -> StatusResponse:
    if app_state.connected:
        raise HTTPException(400, "Already connected")
    try:
        from transport.doip import SPAConnection
        if req.ip:
            conn = SPAConnection(req.ip)
        else:
            conn = SPAConnection.discover(timeout=req.timeout)
        conn.connect()
        app_state.connection = conn
        app_state.connected = True
        app_state.vcm_ip = conn.ip
        app_state.vcm_logical_addr = conn.logical_addr

        # Try to read VIN
        connector = conn.get_uds_connector()
        from udsoncan import Client
        client = Client(connector, request_timeout=2)
        client.open()
        app_state.uds_client = client

        from protocol.uds import read_did
        vin_bytes = read_did(client, 0xF190)
        if vin_bytes:
            app_state.vehicle_vin = vin_bytes.decode("ascii", errors="replace")

        return _status()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/connect")
async def disconnect() -> StatusResponse:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        if app_state.session_manager:
            app_state.session_manager.reset_to_default()
            app_state.session_manager = None
        if app_state.uds_client:
            app_state.uds_client.close()
            app_state.uds_client = None
        if app_state.connection:
            app_state.connection.disconnect()
            app_state.connection = None
        app_state.connected = False
        app_state.vcm_ip = None
        app_state.vcm_logical_addr = None
        app_state.vehicle_vin = None
        app_state.session_type = "DEFAULT"
        app_state.edit_mode = False
        return _status()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def status() -> StatusResponse:
    return _status()


def _status() -> StatusResponse:
    addr = None
    if app_state.vcm_logical_addr is not None:
        addr = f"0x{app_state.vcm_logical_addr:04X}"
    return StatusResponse(
        connected=app_state.connected,
        vcm_ip=app_state.vcm_ip,
        vcm_logical_addr=addr,
        tester_addr=f"0x{app_state.tester_addr:04X}",
        vehicle_vin=app_state.vehicle_vin,
        session_type=app_state.session_type,
    )
