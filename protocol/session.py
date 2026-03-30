"""
protocol/session.py

UDS session management for Volvo SPA.

Handles:
  - Session switching (default / extended / programming)
  - TesterPresent keepalive loop (0x3E) to prevent session timeout
  - Session teardown

SPA session notes:
  - Default session: basic OBD2, no write access
  - Extended diagnostic session (0x03): DTC read/clear, live data
  - Programming session (0x02): required for module writes and ECU flash
    (programming session requires security access first on SPA)

Timeout:
  Volvo SPA ECUs will drop the session if no activity for ~5 seconds.
  The keepalive loop sends 0x3E every 2 seconds to maintain the session.

TODO:
  - Confirm exact session timeout value for SPA via live testing
  - Confirm whether extended session requires security access on SPA or not
  - Test session behaviour across different modules (CEM vs ECM may differ)
"""

from __future__ import annotations

import logging
import threading
import time
from enum import IntEnum
from typing import Optional

from udsoncan.client import Client

logger = logging.getLogger(__name__)


class SessionType(IntEnum):
    DEFAULT = 0x01
    PROGRAMMING = 0x02
    EXTENDED = 0x03


class SessionManager:
    """
    Manages a UDS diagnostic session with keepalive.

    Usage:
        with SessionManager(uds_client) as session:
            session.switch(SessionType.EXTENDED)
            # do UDS work here
        # session is cleanly closed on exit
    """

    KEEPALIVE_INTERVAL: float = 2.0  # seconds between TesterPresent messages

    def __init__(self, client: Client) -> None:
        self._client = client
        self._current_session = SessionType.DEFAULT
        self._keepalive_thread: Optional[threading.Thread] = None
        self._stop_keepalive = threading.Event()

    def switch(self, session: SessionType) -> None:
        """
        Switch to the specified UDS diagnostic session.

        Args:
            session: Target session type (EXTENDED for most operations,
                     PROGRAMMING for write/flash — requires security access)
        """
        logger.info(f"Switching to {session.name} session ({session.value:#04x})")
        self._client.change_session(session.value)
        self._current_session = session
        logger.info(f"Now in {session.name} session.")

    def start_keepalive(self) -> None:
        """
        Start a background thread that sends TesterPresent (0x3E) every
        KEEPALIVE_INTERVAL seconds to prevent session timeout.

        Call this before any long-running operation (DID scan, flash, etc.)
        """
        if self._keepalive_thread and self._keepalive_thread.is_alive():
            return  # already running
        self._stop_keepalive.clear()
        self._keepalive_thread = threading.Thread(
            target=self._keepalive_loop,
            daemon=True,
            name="spa-keepalive"
        )
        self._keepalive_thread.start()
        logger.debug("Keepalive thread started.")

    def stop_keepalive(self) -> None:
        """Stop the TesterPresent keepalive thread."""
        self._stop_keepalive.set()
        if self._keepalive_thread:
            self._keepalive_thread.join(timeout=3.0)
            self._keepalive_thread = None
        logger.debug("Keepalive thread stopped.")

    def _keepalive_loop(self) -> None:
        while not self._stop_keepalive.wait(self.KEEPALIVE_INTERVAL):
            try:
                self._client.tester_present()
            except Exception as e:
                logger.warning(f"TesterPresent failed: {e}")

    def reset_to_default(self) -> None:
        """Return to default session (exits extended/programming)."""
        self.stop_keepalive()
        try:
            self.switch(SessionType.DEFAULT)
        except Exception as e:
            logger.warning(f"Failed to reset session: {e}")

    def __enter__(self) -> "SessionManager":
        return self

    def __exit__(self, *_) -> None:
        self.reset_to_default()
