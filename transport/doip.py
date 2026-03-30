"""
transport/doip.py

DoIP connection management for Volvo SPA platform.

Wraps python-doipclient to handle:
  - VCM discovery via UDP broadcast
  - TCP connection establishment
  - Clean disconnect

Known SPA values:
  TESTER_LOGICAL_ADDR = 0x0E80   (confirmed, community RE)
  VCM_LOGICAL_ADDR    = 0x0010   (verify via discovery - may vary)
  DoIP port           = 13400    (ISO-13400 standard)

NOTE on routing:
  The VCM acts as a DoIP gateway to all other modules (CEM, ECM, TCM, etc.).
  Reaching non-VCM modules may require DoIP routing activation — this is an
  active area of investigation. Initial work targets the VCM directly.

TODO:
  - Confirm VCM logical address via live discovery on test car
  - Map routing activation for sub-module access
  - Add retry logic for flaky USB-Ethernet adapters
  - Test with vehicle in different ignition states (ACC vs RUN vs engine on)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from doipclient import DoIPClient
from doipclient.connectors import DoIPClientUDSConnector

logger = logging.getLogger(__name__)

# ── Known SPA constants ────────────────────────────────────────────────────────

TESTER_LOGICAL_ADDR: int = 0x0E80
"""
Confirmed working tester address for Volvo SPA.
Source: github.com/jacobschaer/python-doipclient/issues/2
"I have tried your library on a Volvo SPA product, and it works a treat
 using python-udsoncan. Just had to change the tester address to 0x0E80"
"""

VCM_LOGICAL_ADDR: int = 0x0010
"""
VCM (Vehicle Communications Module) - the DoIP Ethernet gateway on SPA.
Routes diagnostic traffic to all sub-modules.
TODO: Verify via discover() on a live car - this is a best estimate.
"""

DOIP_PORT: int = 13400
"""Standard ISO-13400 port for both TCP (diagnostic) and UDP (discovery)."""


# ── Connection class ───────────────────────────────────────────────────────────

@dataclass
class SPAConnection:
    """
    Manages a DoIP connection to a Volvo SPA vehicle via the VOE adapter.

    Setup required:
      1. VOE adapter plugged into vehicle OBD-II port
      2. Laptop's dedicated Ethernet port connected to VOE adapter RJ45
         (this NIC must NOT be used for internet simultaneously)
      3. Vehicle ignition to ACC or RUN position

    IP setup:
      The VCM self-assigns an IP on its internal subnet. Your NIC should
      be set to DHCP or the same subnet. Run discover() to find the VCM IP.

    Usage:
        # Auto-discover VCM and connect
        with SPAConnection.discover() as conn:
            connector = conn.get_uds_connector()
            # pass connector to udsoncan.client.Client()

        # Manual IP if already known
        with SPAConnection(ecu_ip="169.254.x.x") as conn:
            ...
    """

    ecu_ip: Optional[str] = None
    tester_addr: int = TESTER_LOGICAL_ADDR
    vcm_addr: int = VCM_LOGICAL_ADDR
    port: int = DOIP_PORT

    _client: Optional[DoIPClient] = field(default=None, init=False, repr=False)

    # ── Discovery ──────────────────────────────────────────────────────────────

    @classmethod
    def discover(cls, timeout: float = 5.0) -> "SPAConnection":
        """
        Broadcast a DoIP VehicleIdentificationRequest and return a pre-configured
        SPAConnection with the discovered VCM IP and logical address.

        Args:
            timeout: Seconds to wait for a VehicleIdentificationResponse.

        Raises:
            ConnectionError: If no vehicle responds within the timeout.

        Example:
            conn = SPAConnection.discover()
            print(f"Found VCM at {conn.ecu_ip}, logical addr {conn.vcm_addr:#06x}")
        """
        logger.info("Broadcasting DoIP discovery request (UDP)...")
        try:
            address, announcement = DoIPClient.get_entity(timeout=timeout)
            logger.info(
                f"Discovered: IP={address}  "
                f"logical_addr={announcement.logical_address:#06x}  "
                f"VIN={getattr(announcement, 'vin', 'unknown')}"
            )
            return cls(ecu_ip=address, vcm_addr=announcement.logical_address)
        except Exception as e:
            raise ConnectionError(
                "No SPA vehicle found on network.\n"
                "Check: VOE adapter connected, vehicle ignition on, "
                "laptop NIC on same subnet, not sharing with internet.\n"
                f"Detail: {e}"
            )

    # ── Connection management ──────────────────────────────────────────────────

    def connect(self) -> None:
        """Open the DoIP TCP connection to the VCM."""
        if self.ecu_ip is None:
            raise RuntimeError(
                "No VCM IP address set. Call SPAConnection.discover() "
                "or pass ecu_ip= to the constructor."
            )
        logger.info(
            f"Connecting to VCM at {self.ecu_ip}:{self.port} "
            f"(tester={self.tester_addr:#06x}, vcm={self.vcm_addr:#06x})"
        )
        self._client = DoIPClient(
            ecu_ip_address=self.ecu_ip,
            ecu_logical_address=self.vcm_addr,
            tcp_port=self.port,
            client_logical_address=self.tester_addr,
        )
        logger.info("DoIP TCP connection established.")

    def disconnect(self) -> None:
        """Close the DoIP connection cleanly."""
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
            logger.info("DoIP connection closed.")

    def get_uds_connector(self, module_addr: Optional[int] = None) -> DoIPClientUDSConnector:
        """
        Return a udsoncan-compatible connector for a target module.

        Args:
            module_addr: Logical address of the target ECU. If None, uses VCM.
                         See module_map/spa_modules.yaml for known addresses.

        Returns:
            DoIPClientUDSConnector for use with udsoncan.client.Client()

        NOTE:
            Reaching non-VCM modules likely requires DoIP routing activation
            (DoIP service 0x0005). This is not yet implemented — currently we
            route all UDS through the VCM directly. Sub-module routing is a
            key area of investigation.
        """
        if self._client is None:
            raise RuntimeError("Not connected. Call connect() first.")
        return DoIPClientUDSConnector(self._client)

    def entity_status(self) -> dict:
        """
        Query DoIP entity status. Useful to verify the connection is alive
        without sending a full UDS request.

        Returns dict with: node_type, max_open_sockets, currently_open_sockets
        """
        if self._client is None:
            raise RuntimeError("Not connected.")
        s = self._client.request_entity_status()
        return {
            "node_type": s.node_type,
            "max_open_sockets": s.max_open_sockets,
            "currently_open_sockets": s.currently_open_sockets,
        }

    # ── Context manager ────────────────────────────────────────────────────────

    def __enter__(self) -> "SPAConnection":
        self.connect()
        return self

    def __exit__(self, *_) -> None:
        self.disconnect()
