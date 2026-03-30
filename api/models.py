from pydantic import BaseModel
from typing import Optional


class ConnectRequest(BaseModel):
    ip: Optional[str] = None
    timeout: float = 5.0


class StatusResponse(BaseModel):
    connected: bool
    vcm_ip: Optional[str] = None
    vcm_logical_addr: Optional[str] = None
    tester_addr: str = "0x0E80"
    vehicle_vin: Optional[str] = None
    session_type: str = "DEFAULT"


class ModuleStatus(BaseModel):
    name: str
    full_name: str
    logical_address: Optional[str] = None
    dtc_count: int = 0
    responding: bool = False


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
