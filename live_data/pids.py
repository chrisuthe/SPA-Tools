"""
live_data/pids.py

Known and candidate DIDs for live data on Volvo SPA platform.

STATUS LEGEND:
  CONFIRMED  - Tested on a live SPA vehicle, value verified
  CANDIDATE  - DID exists based on community reports or logical inference
  UNKNOWN    - Address is a guess; needs scanning to verify

Submit confirmed DIDs via a PR to module_map/did_registry.yaml.

Primary sources:
  - github.com/Alfaa123/Volvo-CAN-Gauge (older P2/P3, some overlap)
  - github.com/Tigo2000/Volvo-VIDA (reverse engineered VIDA protocol)
  - SwedeSpeed forum community reports
  - volvo-fix.com SPA config editor research

TODO:
  - Run scan_dids() on a live 2019 XC90 T6 across priority ranges
  - Cross-reference with VIDA live data screen captures
  - Add codec (scaling/offset) for each confirmed DID
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DIDDefinition:
    """
    Defines a known or candidate DID for SPA live data.

    Attributes:
        did:    Hex DID address
        name:   Human-readable parameter name
        module: Which module to query (see spa_modules.yaml)
        unit:   Physical unit string
        scale:  Multiply raw value by this (default 1.0)
        offset: Add this after scaling (default 0.0)
        length: Expected byte length of raw response
        status: CONFIRMED / CANDIDATE / UNKNOWN
        notes:  Research notes / caveats
    """
    did: int
    name: str
    module: str
    unit: str = ""
    scale: float = 1.0
    offset: float = 0.0
    length: int = 2
    status: str = "UNKNOWN"
    notes: str = ""


# ── Standard OBD-style DIDs ────────────────────────────────────────────────────

STANDARD_DIDS = [
    DIDDefinition(
        did=0xF190, name="VIN", module="CEM",
        unit="", length=17, status="CONFIRMED",
        notes="ISO 14229 standard DID. Returns 17-char ASCII VIN."
    ),
    DIDDefinition(
        did=0xF18C, name="ECU serial number", module="CEM",
        unit="", length=4, status="CANDIDATE",
        notes="Standard ISO DID for ECU serial."
    ),
    DIDDefinition(
        did=0xF101, name="Software version", module="ECM",
        unit="", length=4, status="CANDIDATE",
        notes="Standard ISO DID. Useful for identifying ECM software."
    ),
]

# ── Engine / ECM DIDs ──────────────────────────────────────────────────────────

ENGINE_DIDS = [
    DIDDefinition(
        did=0xDD01, name="Coolant temperature", module="ECM",
        unit="C", scale=1.0, offset=-40.0, length=1, status="CANDIDATE",
        notes=(
            "Common Volvo live data DID. Offset of -40 is typical for temp sensors. "
            "Verify scale/offset against a known coolant temp on live car. "
            "Raw 0x69 (105) = 65C coolant temp (105 - 40 = 65). "
            "Priority: HIGH — most requested feature."
        )
    ),
    DIDDefinition(
        did=0xDD02, name="Intake air temperature", module="ECM",
        unit="C", scale=1.0, offset=-40.0, length=1, status="CANDIDATE",
        notes="Adjacent to coolant DID — likely IAT. Verify."
    ),
    DIDDefinition(
        did=0xDD03, name="Boost pressure", module="ECM",
        unit="kPa", scale=0.1, offset=0.0, length=2, status="CANDIDATE",
        notes=(
            "Turbo boost. Scale/offset are guesses based on P2/P3 conventions. "
            "XC90 T6 runs ~220-240 kPa absolute at WOT. "
            "Verify against boost gauge or map sensor reading."
        )
    ),
    DIDDefinition(
        did=0xDD04, name="Engine RPM", module="ECM",
        unit="rpm", scale=0.25, offset=0.0, length=2, status="CANDIDATE",
        notes="0.25 scale matches SAE J1979 convention."
    ),
    DIDDefinition(
        did=0xDD05, name="Throttle position", module="ECM",
        unit="%", scale=100.0/255.0, offset=0.0, length=1, status="CANDIDATE",
        notes="0-100% throttle. Scale matches OBD2 convention."
    ),
    DIDDefinition(
        did=0xDD10, name="Oil temperature", module="ECM",
        unit="C", scale=1.0, offset=-40.0, length=1, status="CANDIDATE",
        notes="Engine oil temp. Not shown on dash. Useful for warm-up tracking."
    ),
    DIDDefinition(
        did=0xDD11, name="Lambda / AFR", module="ECM",
        unit="lambda", scale=0.0001, offset=0.0, length=2, status="UNKNOWN",
        notes="Air-fuel ratio. Scale is a guess. May not be available on all trims."
    ),
    DIDDefinition(
        did=0xDD20, name="Ignition timing advance", module="ECM",
        unit="degrees BTDC", scale=1.0, offset=-64.0, length=1, status="UNKNOWN",
        notes="Offset -64 matches OBD2 PID 0E convention."
    ),
]

# ── Transmission / TCM DIDs ────────────────────────────────────────────────────

TRANSMISSION_DIDS = [
    DIDDefinition(
        did=0xDE01, name="Current gear", module="TCM",
        unit="gear", scale=1.0, offset=0.0, length=1, status="CANDIDATE",
        notes=(
            "Engaged gear. 0=neutral, 1-8=forward gears, 9=reverse (typical). "
            "XC90 T6 uses Aisin 8HP75 8-speed. Verify encoding. "
            "Priority: HIGH."
        )
    ),
    DIDDefinition(
        did=0xDE10, name="Transmission fluid temperature", module="TCM",
        unit="C", scale=1.0, offset=-40.0, length=1, status="CANDIDATE",
        notes="ATF temperature. Not shown on dash. Useful for towing / track."
    ),
    DIDDefinition(
        did=0xDE11, name="Torque converter slip", module="TCM",
        unit="rpm", scale=1.0, offset=0.0, length=2, status="UNKNOWN",
        notes="Converter lockup slip speed."
    ),
]

# ── Chassis / CEM DIDs ────────────────────────────────────────────────────────

CHASSIS_DIDS = [
    DIDDefinition(
        did=0xDA01, name="Battery voltage", module="CEM",
        unit="V", scale=0.1, offset=0.0, length=2, status="CANDIDATE",
        notes="Main 12V battery voltage. Useful for monitoring alternator output."
    ),
    DIDDefinition(
        did=0xDA02, name="Vehicle speed", module="CEM",
        unit="km/h", scale=0.01, offset=0.0, length=2, status="CANDIDATE",
        notes="From ABS wheel speed sensors via CEM."
    ),
]

# ── Combined lists ────────────────────────────────────────────────────────────

ALL_CANDIDATE_DIDS = STANDARD_DIDS + ENGINE_DIDS + TRANSMISSION_DIDS + CHASSIS_DIDS

# Priority scan ranges for initial discovery:
PRIORITY_SCAN_RANGES = [
    (0xDD00, 0xDDFF, "ECM live data range"),
    (0xDE00, 0xDEFF, "TCM live data range"),
    (0xDA00, 0xDAFF, "CEM live data range"),
    (0xF100, 0xF1FF, "Standard ISO info DIDs"),
    (0xF400, 0xF4FF, "Configuration parameter range"),
]
