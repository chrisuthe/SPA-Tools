from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AppState:
    """Mutable app-wide state shared across routes."""
    connected: bool = False
    vcm_ip: Optional[str] = None
    vcm_logical_addr: Optional[int] = None
    tester_addr: int = 0x0E80
    vehicle_vin: Optional[str] = None
    session_type: str = "DEFAULT"
    edit_mode: bool = False
    scan_running: bool = False
    scan_results: dict = field(default_factory=dict)
    # These hold the live objects when connected — typed as Any to
    # avoid importing transport/protocol at module level
    connection: Optional[object] = None
    uds_client: Optional[object] = None
    session_manager: Optional[object] = None


app_state = AppState()
