# SPATools

Open-source Python toolkit for Volvo SPA platform diagnostics, live data, module configuration, and ECU tuning — with a desktop GUI built on Tauri + React.

**Target vehicle:** Volvo SPA platform (XC90, XC60, S90, V90, S60, V60 — 2016+)
**Connection:** Volvo VOE adapter (part 9513108 / 9513321 / 9513372) via Ethernet OBD-II
**Protocol:** DoIP (ISO-13400) + UDS (ISO-14229)
**Backend:** Python 3.10+
**Frontend:** Tauri v2 + React + TypeScript

---

## Desktop App

SPATools includes a desktop GUI with five views:

| View | Description |
|------|-------------|
| **Dashboard** | Vehicle info, module health grid, DTC summary |
| **Live Data** | Real-time sensor streaming with sparklines and time-series charts |
| **DTCs** | Read/clear fault codes grouped by module |
| **Config** | Read/write module parameters with explicit edit mode safety |
| **DID Scanner** | Brute-force DID discovery for research, with JSON export |

### Running the App

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd ui && npm install && cd ..

# Terminal 1: Start the backend API
uvicorn api.server:app --host 127.0.0.1 --port 8384

# Terminal 2: Start the frontend dev server
cd ui && npm run dev
```

Open http://localhost:1420 in your browser.

### Building for Desktop

```bash
cd ui && npm run tauri build
```

This produces a native desktop binary that bundles the frontend and launches the Python backend automatically.

---

## CLI

The original CLI is still available for headless / scripted use:

```bash
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

## Architecture

```
ui/                          # Tauri v2 + React desktop app
  ├── src/                   #   React components and views
  ├── src-tauri/             #   Rust shell, Python process management
  └── package.json

api/                         # FastAPI backend (REST + WebSocket)
  ├── server.py              #   App entry point
  ├── routes/                #   REST endpoints
  └── ws/                    #   WebSocket endpoints (live data, scan progress)

cli/                         # Original CLI entry point
  └── main.py

live_data/                   # Real-time sensor data
  ├── reader.py              #   Poll loop over UDS 0x22
  └── pids.py                #   DID map: coolant, boost, gear, oil temp, etc.

dtc/                         # Fault code management
  ├── reader.py              #   Read DTCs from all modules (0x19)
  ├── decoder.py             #   DTC code -> human description
  └── clearer.py             #   Clear DTCs per module (0x14)

config/                      # Module configuration
  ├── reader.py              #   Read config params via 0x22
  └── writer.py              #   Write config params via 0x2E (security gated)

ecu_tune/                    # ECU read/write/flash (research phase)
  ├── reader.py              #   Read ECM memory (0x23)
  └── writer.py              #   Flash write — requires security level 1 key

protocol/                    # Shared UDS layer
  ├── uds.py                 #   Service implementations
  └── session.py             #   Session management + 0x3E keepalive

transport/                   # Shared DoIP layer
  └── doip.py                #   VOE connection, entity discovery

module_map/                  # Community data files (YAML)
  ├── spa_modules.yaml       #   Logical addresses per module
  ├── did_registry.yaml      #   Known DIDs, types, units
  └── security_levels.yaml   #   Security access levels per module
```

---

## Protocol Stack

```
Desktop App / CLI
  └── FastAPI backend (api/)
        └── SPATools core (protocol/, live_data/, dtc/, config/)
              └── python-doipclient (ISO-13400 DoIP transport)
                    └── udsoncan (ISO-14229 UDS services)
                          └── VOE Ethernet adapter
                                └── Volvo VCM (gateway, tester addr 0x0E80)
                                      ├── CEM   (Central Electronic Module)
                                      ├── ECM   (Engine Control Module)
                                      ├── TCM   (Transmission Control Module)
                                      ├── ABS/BCM
                                      └── ... (30+ modules)
```

---

## Hardware Required

| Item | Part / Source | Est. Cost |
|------|--------------|-----------|
| VOE Ethernet adapter | Volvo 9513321 / 9513372 (OEM) | ~$80 |
| USB-to-Ethernet adapter | Any Realtek-based | ~$20 |
| Windows, Linux, or macOS laptop | Dedicated NIC for car connection | — |

> **Important:** The Ethernet port connected to the car must not be used for internet simultaneously.
> The car's VCM assigns itself an IP — your laptop NIC needs to be on the same subnet.

---

## Security Model

SPATools uses a tiered access model:

| Tier | Operations | Security Access |
|------|------------|-----------------|
| Read-only | Live data, DTC read, config read | None required |
| Diagnostic | DTC clear, service resets | Extended session |
| Config | Module parameter writes | Security level 3 (CEM PIN) |
| Tune | ECM flash read/write | Security level 1 (ECM PIN — research) |

> **Warning:** Writing to modules can cause serious damage if done incorrectly.
> Always back up existing configuration before writing. Use at your own risk.

---

## Project Status

| Module | Status | Notes |
|--------|--------|-------|
| transport | In progress | DoIP connection, module discovery |
| protocol | In progress | UDS service layer |
| api | Working | FastAPI REST + WebSocket backend |
| ui | Working | Tauri + React desktop app |
| live_data | Planned | Real-time PIDs |
| dtc | Planned | Read/clear fault codes |
| config | Planned | Module parameter read/write |
| ecu_tune | Research | Requires security key RE |
| module_map | In progress | Community DID registry |

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
