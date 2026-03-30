"""
dtc/clearer.py

Clears DTCs from specific or all SPA modules.

Requires extended diagnostic session.
May require security access on some modules (CEM PIN level).

TODO:
    - Verify whether SPA CEM requires security access for DTC clear
    - Implement per-module routing
    - Add confirmation prompt to CLI before clearing
"""

from __future__ import annotations

import logging
from udsoncan.client import Client
from protocol.uds import clear_dtcs

logger = logging.getLogger(__name__)


def clear_module(client: Client, module_name: str) -> bool:
    """
    Clear all DTCs from a specific module.

    Args:
        client: Active udsoncan Client (must be in extended session)
        module_name: Human name for logging (e.g. "CEM")

    Returns:
        True if cleared successfully.
    """
    logger.info(f"Clearing DTCs from {module_name}...")
    return clear_dtcs(client)


def clear_all_modules(client: Client) -> dict[str, bool]:
    """
    Clear DTCs from all reachable modules.

    WARNING: Only call this after diagnosing the underlying faults.

    TODO: iterate spa_modules.yaml, route per module
    """
    logger.warning("clear_all_modules: per-module routing not yet implemented")
    return {}
