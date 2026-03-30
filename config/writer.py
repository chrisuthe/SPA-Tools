"""
config/writer.py

Writes configuration parameters to SPA modules via UDS 0x2E.

REQUIRES: Extended/programming session + security access (CEM PIN).
The security access algorithm for SPA is not yet implemented.

WARNING:
    Writing incorrect values to module configuration can cause serious
    vehicle malfunctions. ALWAYS read and back up current config first
    using config/reader.py dump_all_config().

TODO:
    - Implement security access (blocked on seed/key RE)
    - Add value validation against did_registry.yaml allowed_values
    - Add backup/restore workflow
"""

from __future__ import annotations

import logging
import yaml
from pathlib import Path
from typing import Union, Optional

from udsoncan.client import Client
from protocol.uds import write_did, request_security_access

logger = logging.getLogger(__name__)

DID_REGISTRY_PATH = Path(__file__).parent.parent / "module_map" / "did_registry.yaml"


def write_param(
    client: Client,
    param_name: str,
    value: Union[int, bool, bytes],
) -> bool:
    """
    Write a named configuration parameter.

    Args:
        client: Active udsoncan Client (must have security access granted)
        param_name: Parameter name as defined in did_registry.yaml
        value: New value — encoded per the param's type definition.

    Returns:
        True if successfully written.

    Example (future, once security is solved):
        write_param(client, "stop_start_enabled", False)
        write_param(client, "video_in_motion", True)
    """
    logger.warning(
        "write_param: security access not yet implemented. "
        "This will fail until seed/key algorithm is known."
    )

    with open(DID_REGISTRY_PATH) as f:
        registry = yaml.safe_load(f)

    params = registry.get("config_params", {})
    if param_name not in params:
        logger.error(f"Unknown parameter '{param_name}'")
        return False

    param = params[param_name]
    if not param.get("writable", False):
        logger.error(f"Parameter '{param_name}' is not marked as writable in registry")
        return False

    # Encode value to bytes
    if isinstance(value, bool):
        raw = bytes([1 if value else 0])
    elif isinstance(value, int):
        length = param.get("length", 1)
        raw = value.to_bytes(length, "big")
    elif isinstance(value, bytes):
        raw = value
    else:
        logger.error(f"Unsupported value type: {type(value)}")
        return False

    did = param["did"]
    logger.info(f"Writing '{param_name}' (DID {did:#06x}) = {raw.hex()}")
    return write_did(client, did, raw)
