"""
ecu_tune/writer.py

ECM flash writer for Volvo SPA.

STATUS: STUB — do not use.

Flashing an ECM with an invalid binary can permanently brick the module.
This will remain unimplemented until all prerequisite research is complete.

Requirements before this can work:
  1. Security level 1 key (not yet known — see docs/security_research.md)
  2. Verified flash memory map for target ECM
  3. Valid checksum algorithm for the binary
  4. Volvo VBF (Vehicle Binary File) format understanding

VBF Notes:
  Volvo packages flash data in encrypted .vbf containers delivered via VIDA.
  Third-party tools typically bypass VBF and write raw binary directly via
  UDS 0x34 (RequestDownload) / 0x36 (TransferData) / 0x37 (TransferExit).
  The VBF encryption keys were previously extractable from VIDA logs via 3DES
  (same hardcoded key used for seed/key capture) — Volvo patched this.
  See v-spa.net for the most current community knowledge.

DO NOT implement write functionality until:
  - The entire read pipeline is validated on a bench ECM
  - A checksum implementation is verified against a known-good binary
  - At least one successful bench ECM flash has been completed safely

TODO:
  - Understand Volvo SPA VBF format (header, data blocks, checksums)
  - Implement UDS 0x34 + 0x36 + 0x37 flash sequence
  - Add pre-flash validation (size, checksum, VIN match)
  - Add post-flash verification (read back and compare)
"""

from __future__ import annotations

import logging
from pathlib import Path

from udsoncan.client import Client
from protocol.session import SessionManager

logger = logging.getLogger(__name__)


def flash_ecm(
    client: Client,
    session: SessionManager,
    bin_path: Path,
) -> bool:
    """
    Flash a calibration binary to the ECM.

    !! THIS FUNCTION IS A STUB — NOT IMPLEMENTED !!

    Args:
        client:   Active udsoncan Client
        session:  Active SessionManager
        bin_path: Path to the calibration binary to flash

    Returns:
        Always False until implemented.
    """
    logger.error(
        "flash_ecm: NOT IMPLEMENTED.\n"
        "ECM flashing requires security level 1 key and VBF format research.\n"
        "See docs/security_research.md and ecu_tune/writer.py notes."
    )
    return False
