"""
protocol/uds.py

High-level UDS service wrappers for Volvo SPA.

Wraps udsoncan to provide a clean, SPA-specific API.
All methods expect an active udsoncan.client.Client passed in.

UDS Services covered:
  0x19 - ReadDTCInformation      -> read_dtcs()
  0x14 - ClearDiagnosticInfo     -> clear_dtcs()
  0x22 - ReadDataByIdentifier    -> read_did()
  0x2E - WriteDataByIdentifier   -> write_did()
  0x27 - SecurityAccess          -> request_security_access()
  0x23 - ReadMemoryByAddress     -> read_memory()  [ecu_tune only]

NOTE on security access:
  Volvo SPA uses a seed/key mechanism (UDS service 0x27).
  The key derivation algorithm is NOT yet known for SPA write-level access.
  read_did() and read_dtcs() work WITHOUT security access.
  write_did() and clear_dtcs() require extended session + security access.
  ECM flash requires programming session + level 1 security (research phase).

TODO:
  - Implement security access once seed/key algorithm is determined
  - Verify DTC format (Volvo uses custom DTC format: e.g. CEM-1A5C)
  - Test 0x22 DID scanning across module addresses
  - Determine if Volvo uses sub-function 0x06 or 0x02 for DTC reads
"""

from __future__ import annotations

import logging
from typing import Optional

from udsoncan.client import Client
from udsoncan.exceptions import NegativeResponseException, UnexpectedResponseException

logger = logging.getLogger(__name__)


# ── DTC reading ────────────────────────────────────────────────────────────────

def read_dtcs(client: Client, status_mask: int = 0xFF) -> list[dict]:
    """
    Read stored DTCs from the connected module using UDS service 0x19.

    Args:
        client: Active udsoncan Client connected to a specific module.
        status_mask: DTC status mask. 0xFF = all DTCs.

    Returns:
        List of dicts: [{"dtc": "0x1A5C", "status": 0x08, "raw": ...}, ...]

    TODO:
        - Confirm which 0x19 sub-function Volvo SPA ECUs respond to
        - Test against a real module to verify response parsing
    """
    logger.info(f"Reading DTCs (status_mask={status_mask:#04x})")
    try:
        response = client.get_dtc_by_status_mask(status_mask)
        dtcs = []
        for dtc in response.dtcs:
            dtcs.append({
                "dtc": f"0x{dtc.id:04X}",
                "status": dtc.status.get_byte_as_int(),
                "raw": dtc,
            })
        logger.info(f"Found {len(dtcs)} DTC(s)")
        return dtcs
    except NegativeResponseException as e:
        logger.warning(f"Module refused DTC read: {e}")
        return []


# ── DTC clearing ───────────────────────────────────────────────────────────────

def clear_dtcs(client: Client, group: int = 0xFFFFFF) -> bool:
    """
    Clear DTCs using UDS service 0x14.

    Args:
        client: Active udsoncan Client (must be in extended session).
        group: DTC group to clear. 0xFFFFFF = all DTCs.

    Returns:
        True if successful.

    TODO:
        - Verify that SPA modules accept 0x14 without security access
        - Some modules may require security level 3 (CEM PIN) for clear
    """
    logger.info(f"Clearing DTCs (group={group:#08x})")
    try:
        client.clear_dtc(group)
        logger.info("DTCs cleared successfully.")
        return True
    except NegativeResponseException as e:
        logger.error(f"DTC clear rejected: {e}")
        return False


# ── DID reading ────────────────────────────────────────────────────────────────

def read_did(client: Client, did: int) -> Optional[bytes]:
    """
    Read a Data Identifier (DID) using UDS service 0x22.

    This is the core of live data AND config reading.
    No security access required for most read DIDs on SPA.

    Args:
        client: Active udsoncan Client.
        did: DID number (e.g. 0xDD01 for coolant temp — verify in did_registry.yaml)

    Returns:
        Raw bytes response, or None if the module NACKs.

    TODO:
        - Populate did_registry.yaml with verified SPA DIDs
        - Build a codec layer to auto-decode common value types
    """
    logger.debug(f"Reading DID {did:#06x}")
    try:
        response = client.read_data_by_identifier(did)
        data = response.service_data.values.get(did)
        if data is None:
            logger.warning(f"DID {did:#06x}: no value in response")
            return None
        return bytes(data)
    except NegativeResponseException as e:
        logger.debug(f"DID {did:#06x} NACK: {e.response.code_name}")
        return None
    except Exception as e:
        logger.warning(f"DID {did:#06x} error: {e}")
        return None


# ── DID writing ────────────────────────────────────────────────────────────────

def write_did(client: Client, did: int, value: bytes) -> bool:
    """
    Write a Data Identifier value using UDS service 0x2E.

    REQUIRES: Extended or programming session + security access.
    This will fail without a valid security key for the target module.

    Args:
        client: Active udsoncan Client (must have security access granted).
        did: DID to write (must be writable — see did_registry.yaml).
        value: Raw bytes to write.

    Returns:
        True if the module responds positively.

    TODO:
        - Security access must be implemented before this can be used
        - Build value validation against did_registry.yaml schema
    """
    logger.info(f"Writing DID {did:#06x} = {value.hex()}")
    try:
        client.write_data_by_identifier(did, value)
        logger.info(f"DID {did:#06x} written successfully.")
        return True
    except NegativeResponseException as e:
        logger.error(f"DID write rejected ({e.response.code_name}). "
                     f"Security access may be required.")
        return False


# ── DID scanning ──────────────────────────────────────────────────────────────

def scan_dids(
    client: Client,
    start: int = 0x0000,
    end: int = 0xFFFF,
    progress_cb=None,
) -> dict[int, bytes]:
    """
    Scan a range of DIDs by brute-force 0x22 requests.
    Records all DIDs that return a positive response.

    This is a key tool for building module_map/did_registry.yaml.
    Run this on a live car and submit results to the project.

    Args:
        client: Active udsoncan Client.
        start: First DID to probe (default 0x0000).
        end: Last DID to probe (default 0xFFFF).
        progress_cb: Optional callable(current_did, total) for progress.

    Returns:
        Dict mapping DID -> raw bytes for all DIDs that responded.

    NOTE:
        Priority scan ranges for initial discovery:
          0xDD00-0xDDFF  (ECM live data range)
          0xDE00-0xDEFF  (TCM live data range)
          0xF100-0xF1FF  (Standard ISO info DIDs)
          0xF400-0xF4FF  (Configuration parameter range)

    TODO:
        - Add rate limiting if the VCM throttles rapid requests
        - Add parallel multi-DID requests (0x22 supports batching)
    """
    logger.info(f"Scanning DIDs {start:#06x} to {end:#06x}...")
    results: dict[int, bytes] = {}
    total = end - start + 1

    for i, did in enumerate(range(start, end + 1)):
        if progress_cb:
            progress_cb(did, total)
        data = read_did(client, did)
        if data is not None:
            results[did] = data
            logger.info(f"  DID {did:#06x} -> {data.hex()}")

    logger.info(f"Scan complete. Found {len(results)} responsive DIDs.")
    return results


# ── Security access (stub) ─────────────────────────────────────────────────────

def request_security_access(client: Client, level: int) -> bool:
    """
    Attempt UDS service 0x27 security access at the specified level.

    THIS IS A STUB — the seed/key algorithm for Volvo SPA is not yet known.

    Security levels on SPA (best guess from community research):
      Level 0x01: Programming session access (ECM flash) — UNKNOWN algorithm
      Level 0x03: Extended config access (CEM PIN) — UNKNOWN via OBD

    See docs/security_research.md for current RE progress.

    TODO:
        - Capture seed/key pairs via Wireshark during VIDA session
        - Reverse engineer key derivation from seed
        - Implement algorithm here once known
    """
    logger.warning(
        f"Security access level {level:#04x} requested. "
        f"Algorithm not yet implemented — this will fail."
    )
    try:
        # Request seed anyway — useful to capture for RE purposes
        result = client.request_seed(level)
        seed = result.service_data.seed
        logger.info(f"ECU seed received: {seed.hex()} (logging for RE — key unknown)")
        return False
    except NegativeResponseException as e:
        logger.warning(f"Security access refused: {e.response.code_name}")
        return False


# ── Memory read (ecu_tune) ────────────────────────────────────────────────────

def read_memory(client: Client, address: int, length: int) -> Optional[bytes]:
    """
    Read raw ECU memory using UDS service 0x23.
    Used by ecu_tune module to dump ECM calibration data.

    Requires security access level 1 (programming session).
    Currently blocked pending security key research.

    TODO:
        - Determine correct address format for SPA ECM (R5F72546R chip)
        - Implement once security access is solved
    """
    logger.warning("read_memory: requires security access level 1 (not yet implemented)")
    return None
