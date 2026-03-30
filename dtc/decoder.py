"""
dtc/decoder.py

Decodes raw Volvo SPA DTC codes into human-readable descriptions.

Volvo DTC format: <MODULE>-<4HEX>
  e.g. CEM-1A5C, ECM-7200, ABS-0094, TCM-2C10

Sources:
  - SwedeSpeed forum DTC threads
  - github.com/Tigo2000/Volvo-VIDA (ECU-commands.txt)
  - xemodex.com CEM DTC reference

TODO:
  - Source comprehensive DTC database (may require VIDA extraction)
  - Add DTC severity levels
  - Add recommended actions per DTC
"""

from __future__ import annotations

# Known DTC descriptions: { "MODULE-CODE": "description" }
KNOWN_DTCS: dict[str, str] = {
    # CEM (Central Electronic Module)
    "CEM-1A5C": "Communication with REM control module — signal missing",
    "CEM-1A64": "Communication with AOC control module — signal missing",
    "CEM-6C48": "Transponder type — invalid signal",
    "CEM-6C49": "Transponder communication — faulty signal",
    "CEM-8F04": "Turn signal lamp — faulty signal",
    "CEM-8F05": "Hazard warning signal switch — activated too long",
    "CEM-DF13": "CAN-H high speed network — signal too high",
    "CEM-DF16": "CAN-L high speed network — signal too low",
    "CEM-1D02": "Control module internal fault",
    "CEM-1D07": "Control module internal fault",
    "CEM-1D08": "Control module internal fault",
    "CEM-1D09": "Control module internal fault",
    "CEM-U110400": "Interrupted communication with Climate Control Module (CCM)",

    # ECM (Engine Control Module)
    "ECM-720A": "Communication with immobilizer — no signal",
    "ECM-7200": "Engine control module — general fault",

    # VCM (Vehicle Communications Module)
    "VCM-U105E00": "Internal fault",
    "VCM-U106000": "No communication over Ethernet to IHU",
    "VCM-U106600": "Internal fault",
    "VCM-U106B00": "Internal fault",
    "VCM-U122B11": "FlexRay BM (-) signal too low",
    "VCM-U122C11": "FlexRay BP (+) signal too low",

    # ABS/BCM
    "BCM-0094": "Communication between control units — DEM communication problem",

    # CCM (Climate Control Module)
    "CCM-B1A6996": "Humidity sensor — component internal failure",
}


def decode(module: str, code: str) -> str:
    """
    Return a human-readable description for a DTC.

    Args:
        module: Module abbreviation (e.g. "CEM", "ECM")
        code:   4-character hex code (e.g. "1A5C")

    Returns:
        Description string, or a generic message if not in database.

    Example:
        decode("CEM", "1A5C")
        -> "Communication with REM control module — signal missing"
    """
    key = f"{module.upper()}-{code.upper()}"
    return KNOWN_DTCS.get(key, f"Unknown fault code {key}")


def format_dtc(module: str, dtc_dict: dict) -> dict:
    """
    Enrich a raw DTC dict (from protocol/uds.read_dtcs) with decoded description.

    Args:
        module: Module name this DTC came from
        dtc_dict: Raw DTC dict from read_dtcs()

    Returns:
        Enriched dict with 'module', 'code', 'display', 'description', 'status'
    """
    code = dtc_dict["dtc"].replace("0x", "").upper()
    return {
        "module": module,
        "code": code,
        "display": f"{module}-{code}",
        "description": decode(module, code),
        "status": dtc_dict["status"],
    }
