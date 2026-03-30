"""
ecu_tune/
Area 4: ECU binary read, write, and flash operations.

THIS AREA IS IN RESEARCH PHASE.

Requires:
  1. UDS programming session (0x10 subfunction 0x02)
  2. Security access level 0x01 (level 1 programming key)
  3. The seed->key algorithm for the SPA ECM — NOT YET KNOWN

ECM chip on SPA: Renesas R5F72546R (RH850 family)
See docs/security_research.md
"""
