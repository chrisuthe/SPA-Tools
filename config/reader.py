"""
config/reader.py

Reads configuration parameters from SPA modules via UDS 0x22.
No security access required for reading.

TODO:
    - Populate did_registry.yaml with confirmed config DIDs
    - Test on live car — CEM is the primary config module
"""

from __future__ import annotations

import logging
import yaml
from pathlib import Path
from typing import Optional

from udsoncan.client import Client
from protocol.uds import read_did

logger = logging.getLogger(__name__)

DID_REGISTRY_PATH = Path(__file__).parent.parent / "module_map" / "did_registry.yaml"


def read_param(client: Client, param_name: str) -> Optional[dict]:
    """
    Read a named configuration parameter by looking it up in did_registry.yaml.

    Args:
        client: Active udsoncan Client
        param_name: Parameter name as defined in did_registry.yaml
                    e.g. "stop_start_enabled", "video_in_motion"

    Returns:
        Dict with raw bytes and decoded value, or None if not found/no response.
    """
    with open(DID_REGISTRY_PATH) as f:
        registry = yaml.safe_load(f)

    params = registry.get("config_params", {})
    if param_name not in params:
        logger.error(f"Unknown parameter '{param_name}'. Check did_registry.yaml.")
        return None

    param = params[param_name]
    did = param["did"]
    logger.info(f"Reading config param '{param_name}' (DID {did:#06x})")

    raw = read_did(client, did)
    if raw is None:
        return None

    value = int.from_bytes(raw, "big")
    return {
        "param": param_name,
        "did": did,
        "raw": raw.hex(),
        "value": value,
        "unit": param.get("unit", ""),
    }


def dump_all_config(client: Client) -> list[dict]:
    """
    Read all known config parameters. Useful for backup before making changes.
    """
    with open(DID_REGISTRY_PATH) as f:
        registry = yaml.safe_load(f)

    results = []
    for param_name in registry.get("config_params", {}):
        result = read_param(client, param_name)
        if result:
            results.append(result)
    return results
