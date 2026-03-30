# SPATools Architecture

## Overview

SPATools is a layered Python toolkit for communicating with Volvo SPA platform
vehicles via the DoIP (Diagnostics over IP) protocol, exposed through the
OBD-II port using the Volvo VOE Ethernet adapter.

---

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       CLI / UI Layer                         │
│              cli/main.py  (argparse + rich)                  │
└────────────┬──────────┬──────────┬────────────────────────── ┘
             │          │          │          │
   ┌─────────▼──┐ ┌─────▼────┐ ┌──▼─────┐ ┌─▼──────────┐
   │ live_data  │ │   dtc    │ │ config │ │ ecu_tune   │
   │            │ │          │ │        │ │ (research) │
   │ reader.py  │ │ reader   │ │ reader │ │ reader     │
   │ pids.py    │ │ decoder  │ │ writer │ │ writer     │
   └─────────┬──┘ └─────┬────┘ └──┬─────┘ └─┬──────────┘
             │          │          │          │
┌────────────▼──────────▼──────────▼──────────▼────────────── ┐
│                        protocol/                             │
│   uds.py   (0x19, 0x14, 0x22, 0x2E, 0x27, 0x23)            │
│   session.py  (session mgmt + 0x3E TesterPresent keepalive) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                        transport/                            │
│   doip.py  (python-doipclient wrapper)                      │
│   SPAConnection: discover / connect / disconnect            │
└──────────────────────────────┬──────────────────────────────┘
                               │ Ethernet TCP:13400
┌──────────────────────────────▼──────────────────────────────┐
│                  VOE Ethernet Adapter                        │
│         Volvo 9513108 / 9513321 / 9513372                    │
│             OBD-II connector (pins 3/4/5/11/12)              │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│          VCM (Vehicle Communications Module)                 │
│         DoIP gateway — logical addr ~0x0010 (TBC)           │
│   ┌──────┬──────┬──────┬──────┬──────┬──────┬────────┐     │
│   │ CEM  │ ECM  │ TCM  │ ABS  │ CCM  │ IHU  │  ...   │     │
│   └──────┴──────┴──────┴──────┴──────┴──────┴────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Live Data Read

```
cli: live command
  → LiveDataReader.poll()
      → protocol/uds.read_did(client, 0xDD01)
          → udsoncan Client.read_data_by_identifier(0xDD01)
              → DoIPClientUDSConnector.send()
                  → DoIPClient TCP write to VCM:13400
                  ← VCM responds with raw bytes
              ← udsoncan parses UDS 0x62 response
          ← raw bytes returned
      ← DIDDefinition.scale / offset applied → float value
  ← rich live table updated in terminal
```

## Data Flow: DTC Read

```
cli: dtc read
  → dtc/reader.read_all_modules(client)
      for each module in spa_modules.yaml with a logical_address:
          → protocol/uds.read_dtcs(client)
              → udsoncan get_dtc_by_status_mask() [UDS 0x19 02 FF]
              ← list of raw DTC objects
          → dtc/decoder.format_dtc(module_name, raw_dtc)
              → KNOWN_DTCS dict lookup
              ← enriched dict with human description
  ← aggregated list → rich table in terminal
```

---

## module_map as Community Data

The `module_map/` directory contains YAML files — the crowdsourced knowledge
base for SPA module addresses and DID mappings. Kept as YAML so non-developers
can contribute without touching Python code.

```
module_map/
  spa_modules.yaml      ← logical addresses per module
  did_registry.yaml     ← DID addresses, scaling, units
  security_levels.yaml  ← security access research notes
```

---

## Security Access Tiers

```
Tier 0 — No security required:
  0x22 ReadDataByIdentifier  → live data, VIN, software versions
  0x19 ReadDTCInformation    → fault code reading

Tier 1 — Extended session (CEM PIN):
  0x14 ClearDTCInformation   → fault code clearing
  0x2E WriteDataByIdentifier → module configuration writes

Tier 2 — Programming session, level 1 key (UNKNOWN):
  0x23 ReadMemoryByAddress   → ECM binary dump
  0x34/0x36/0x37             → ECM flash write
```

---

## Key Design Decisions

1. **module_map is data, not code.** YAML files anyone can edit.
   The primary scaling mechanism for community knowledge.

2. **Security stubs are documented, not hidden.** Code explicitly logs
   what's blocked and why, pointing to security_research.md.

3. **ecu_tune is read-only scaffolding.** Writer remains a stub until
   full read pipeline is validated and bench flash is proven safe.

4. **Rich for output.** Live-updating terminal tables for streaming data
   without building a GUI.

5. **Context managers throughout.** Every connection and session ensures
   clean teardown even on error or KeyboardInterrupt.
