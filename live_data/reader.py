"""
live_data/reader.py

Real-time DID polling loop for Volvo SPA.

Polls a set of DIDs on a configurable interval and emits decoded values.
Designed to be used with rich for terminal display or piped to other consumers.

TODO:
    - Verify which DIDs work in default vs extended session
    - Handle per-module routing (ECM vs TCM are different logical addresses)
    - Add CSV logging output mode
    - Add async polling option for better performance
"""

from __future__ import annotations

import time
import logging
from typing import Generator, Optional

from udsoncan.client import Client
from protocol.uds import read_did
from live_data.pids import DIDDefinition

logger = logging.getLogger(__name__)


class LiveReading:
    """A single decoded DID value at a point in time."""

    def __init__(self, did_def: DIDDefinition, raw: Optional[bytes], timestamp: float):
        self.did_def = did_def
        self.raw = raw
        self.timestamp = timestamp
        self.value: Optional[float] = None
        self.error: Optional[str] = None

        if raw is not None:
            try:
                raw_int = int.from_bytes(raw, "big")
                self.value = raw_int * did_def.scale + did_def.offset
            except Exception as e:
                self.error = str(e)
        else:
            self.error = "No response"

    def __repr__(self) -> str:
        if self.value is not None:
            return (f"{self.did_def.name}: "
                    f"{self.value:.2f} {self.did_def.unit} "
                    f"[DID {self.did_def.did:#06x}]")
        return f"{self.did_def.name}: ERROR ({self.error})"


class LiveDataReader:
    """
    Polls a list of DIDs and yields LiveReading objects.

    Args:
        client:   Active udsoncan Client (extended session recommended)
        did_defs: List of DIDDefinition objects to poll
    """

    def __init__(self, client: Client, did_defs: list[DIDDefinition]) -> None:
        self._client = client
        self._dids = did_defs

    def poll_once(self) -> list[LiveReading]:
        """Read all configured DIDs once and return results."""
        ts = time.monotonic()
        return [
            LiveReading(did_def, read_did(self._client, did_def.did), ts)
            for did_def in self._dids
        ]

    def poll(self, interval: float = 1.0) -> Generator[list[LiveReading], None, None]:
        """
        Continuously poll DIDs and yield a list of readings each cycle.

        Args:
            interval: Seconds between poll cycles (default 1.0s)

        Yields:
            List[LiveReading] — one per DID per cycle
        """
        logger.info(f"Starting live data poll ({len(self._dids)} DIDs, {interval}s interval)")
        while True:
            yield self.poll_once()
            time.sleep(interval)
