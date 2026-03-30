"""
ecu_tune/reader.py

ECM calibration data reader for Volvo SPA.

Reads the ECM binary via UDS service 0x23 (ReadMemoryByAddress) in
programming session with level 1 security access.

STATUS: BLOCKED — requires security level 1 key (not yet known)

ECM on SPA XC90 T6 (2019): Denso/Bosch unit, Renesas R5F72546R chip
  Flash layout (approximate, needs verification):
    0x00000000 - 0x003FFFFF  Program flash (4MB)
    Calibration tables live within the program flash at known offsets
    EEPROM is separate and contains immobilizer sync data (do not touch)

TODO:
  - Obtain level 1 security key (see docs/security_research.md)
  - Map exact flash memory layout for XC90 T6 ECM
  - Implement chunked read with progress reporting
  - Add checksum verification on read binary
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from udsoncan.client import Client
from protocol.uds import read_memory, request_security_access
from protocol.session import SessionManager, SessionType

logger = logging.getLogger(__name__)

ECM_FLASH_START: int = 0x00000000
ECM_FLASH_SIZE: int = 0x00400000   # 4MB — verify against actual ECM
ECM_READ_CHUNK: int = 0x0100       # 256 bytes per request (conservative)


def dump_ecm(
    client: Client,
    session: SessionManager,
    output_path: Path,
    start: int = ECM_FLASH_START,
    length: int = ECM_FLASH_SIZE,
) -> bool:
    """
    Dump ECM flash memory to a binary file.

    THIS WILL FAIL until security level 1 key is implemented.

    Args:
        client:      Active udsoncan Client
        session:     Active SessionManager
        output_path: Path to save the binary dump (.bin)
        start:       Flash start address
        length:      Number of bytes to read

    Returns:
        True if dump completed successfully.
    """
    logger.warning(
        "ECM dump requires security level 1 access — NOT YET IMPLEMENTED.\n"
        "See docs/security_research.md for current progress."
    )

    session.switch(SessionType.PROGRAMMING)
    granted = request_security_access(client, level=0x01)
    if not granted:
        logger.error("Security access denied. Cannot proceed with ECM dump.")
        session.reset_to_default()
        return False

    logger.info(f"Reading ECM flash: {start:#010x} to {start + length:#010x}")
    session.start_keepalive()
    data = bytearray()

    try:
        offset = 0
        while offset < length:
            chunk_size = min(ECM_READ_CHUNK, length - offset)
            chunk = read_memory(client, start + offset, chunk_size)
            if chunk is None:
                logger.error(f"Read failed at offset {offset:#010x}")
                return False
            data.extend(chunk)
            offset += chunk_size
            if offset % 0x10000 == 0:
                logger.info(f"  Progress: {offset / length * 100:.1f}%")
    finally:
        session.stop_keepalive()
        session.reset_to_default()

    output_path.write_bytes(data)
    logger.info(f"ECM dump saved to {output_path} ({len(data)} bytes)")
    return True


def analyze_binary(bin_path: Path) -> dict:
    """
    Basic analysis of a dumped ECM binary.

    TODO:
        - Implement signature-based table detection
        - Cross-reference with known Volvo/Bosch calibration patterns
        - Add VIN/software version extraction from known offsets
    """
    logger.info(f"Analyzing {bin_path}...")
    data = bin_path.read_bytes()
    return {
        "size_bytes": len(data),
        "size_kb": len(data) // 1024,
        "note": "Deep analysis not yet implemented — see docs/security_research.md",
    }
