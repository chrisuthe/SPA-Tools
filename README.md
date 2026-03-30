# SPATools

Open-source Python toolkit for Volvo SPA platform diagnostics, live data, module configuration, and ECU tuning.

**Target vehicle:** Volvo SPA platform (XC90, XC60, S90, V90, S60, V60 — 2016+)
**Connection:** Volvo VOE adapter (part 9513108 / 9513321 / 9513372) via Ethernet OBD-II
**Protocol:** DoIP (ISO-13400) + UDS (ISO-14229)
**Language:** Python 3.10+

---

## Project Status

| Module | Status | Notes |
|---|---|---|
| transport | 🔨 In progress | DoIP connection, module discovery |
| protocol | 🔨 In progress | UDS service layer |
| live_data | 📋 Planned | Real-time PIDs |
| dtc | 📋 Planned | Read/clear fault codes |
| config | 📋 Planned | Module parameter read/write |
| ecu_tune | 🔒 Research | Requires security key RE |
| module_map | 🔨 In progress | Community DID registry |

---

## Architecture

```
cli/
  └── main.py              # Entry point — subcommands: live / dtc / config / tune

live_data/                 # Area 1: Real-time data the dash doesn't show
  ├── reader.py            # Poll loop over UDS 0x22
  └── pids.py              # DID map: coolant, boost, gear, oil temp, etc.

dtc/                       # Area 2: Fault code management
  ├── reader.py            # Read DTCs from all modules (0x19)
  ├── decoder.py           # DTC code -> human description
  └── clearer.py           # Clear DTCs per module (0x14)

config/                    # Area 3: Module configuration
  ├── reader.py            # Read config params via 0x22
  └── writer.py            # Write config params via 0x2E (security gated)

ecu_tune/                  # Area 4: ECU read/write/flash (phase 4 — research)
  ├── reader.py            # Read ECM memory (0x23)
  └── writer.py            # Flash write — requires security level 1 key

protocol/                  # Shared UDS layer
  ├── uds.py               # Service implementations
  └── session.py           # Session management + 0x3E keepalive

transport/                 # Shared DoIP layer
  └── doip.py              # VOE connection, entity discovery

module_map/                # Community data files (YAML) — no Python
  ├── spa_modules.yaml     # Logical addresses per module
  ├── did_registry.yaml    # Known DIDs, types, units
  └── security_levels.yaml # Security access levels per module
```

---

## Hardware Required

| Item | Part / Source | Est. Cost |
|---|---|---|
| VOE Ethernet adapter | Volvo 9513321 / 9513372 (OEM) | ~$80 |
| USB-to-Ethernet adapter | Any Realtek-based | ~$20 |
| Windows or Linux laptop | Dedicated NIC for car connection | — |

> **Important:** The Ethernet port connected to the car must not be used for internet simultaneously.
> The car's VCM assigns itself an IP — your laptop NIC needs to be on the same subnet.

---

## Quick Start

```bash
pip install -r requirements.txt

# Discover all modules on the car
python -m cli.main discover

# Stream live data
python -m cli.main live --pids coolant_temp boost_pressure current_gear

# Read DTCs from all modules
python -m cli.main dtc read --all-modules

# Clear DTCs from a specific module
python -m cli.main dtc clear --module CEM

# Read a config parameter
python -m cli.main config read --module CEM --param stop_start_enabled

# Scan DIDs for research (saves to did_scan_results.json)
python -m cli.main scan-dids --start 0xDD00 --end 0xDDFF
```

---

## Protocol Stack

```
Your Laptop
  └── python-doipclient  (ISO-13400 DoIP transport)
        └── udsoncan       (ISO-14229 UDS services)
              └── VOE Ethernet adapter
                    └── Volvo VCM (gateway, tester addr 0x0E80)
                          ├── CEM   (Central Electronic Module)
                          ├── ECM   (Engine Control Module)
                          ├── TCM   (Transmission Control Module)
                          ├── ABS/BCM
                          └── ... (30+ modules)
```

---

## Security Model

SPATools uses a tiered access model:

| Tier | Operations | Security Access |
|---|---|---|
| Read-only | Live data, DTC read | None required |
| Diagnostic | DTC clear, service resets | Extended session |
| Config | Module parameter writes | Security level 3 (CEM PIN) |
| Tune | ECM flash read/write | Security level 1 (ECM PIN — research) |

> ⚠️ **Warning:** Writing to modules can cause serious damage if done incorrectly.
> Always back up existing configuration before writing. Use at your own risk.

---

## Contributing

The most valuable contribution right now is **DID discovery** — connecting your SPA vehicle,
running a DID scan, and submitting results to `module_map/did_registry.yaml`.

See `docs/contributing_dids.md` for the process.

---

## Legal

This project is for personal use on vehicles you own. Reverse engineering for
interoperability purposes is generally permitted under applicable law, but
check your local regulations. This tool is not affiliated with or endorsed by Volvo Cars.
