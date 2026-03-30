"""
live_data/
Area 1: Real-time data streaming from the vehicle.

Reads DID values continuously and displays parameters that the Volvo
instrument cluster and Sensus don't show natively.

Target parameters for XC90 T6 (2019):
  - Coolant temperature (actual, not the dash gauge)
  - Boost pressure (psi/bar)
  - Current gear (from TCM)
  - Oil temperature
  - Intake air temperature
  - Throttle position
  - Battery voltage
  - Torque output (if available)

These are read via UDS 0x22 (ReadDataByIdentifier).
Most do NOT require security access.
"""
