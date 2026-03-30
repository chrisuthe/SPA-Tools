"""
dtc/reader.py

Reads DTCs from all known SPA modules.

TODO:
    - Implement per-module routing (currently only VCM is reachable directly)
    - Add filtering by status (confirmed / pending / historical)
    - Test on live car to verify which modules respond to 0x19
"""

from __future__ import annotations

import logging
import yaml
from pathlib import Path

from udsoncan.client import Client
from protocol.uds import read_dtcs
from dtc.decoder import format_dtc

logger = logging.getLogger(__name__)

MODULE_MAP_PATH = Path(__file__).parent.parent / "module_map" / "spa_modules.yaml"


def read_all_modules(client: Client) -> list[dict]:
    """
    Read DTCs from all modules listed in spa_modules.yaml.

    Returns list of enriched DTC dicts with module context.

    NOTE: Currently limited to modules reachable via the VCM gateway.
    Sub-module routing is a TODO — see transport/doip.py notes.
    """
    with open(MODULE_MAP_PATH) as f:
        module_map = yaml.safe_load(f)

    all_dtcs = []
    for module_name, module_info in module_map.get("modules", {}).items():
        addr = module_info.get("logical_address")
        if addr is None:
            logger.debug(f"Skipping {module_name} — no logical address mapped yet")
            continue
        logger.info(f"Reading DTCs from {module_name} (addr={addr})")
        # TODO: Switch client routing to module addr before reading
        raw_dtcs = read_dtcs(client)
        for raw in raw_dtcs:
            all_dtcs.append(format_dtc(module_name, raw))

    return all_dtcs
