# SPATools Desktop UI — Design Spec

## Overview

Desktop application for the SPATools Volvo SPA platform diagnostic toolkit. Replaces the CLI with a visual interface for live data streaming, DTC management, module configuration, and DID scanning. Session-based usage model: plug in, diagnose, change, unplug.

**Target:** Volvo SPA platform (XC90, XC60, S90, V90, S60, V60 — 2016+)
**Connection:** VOE Ethernet adapter → DoIP/UDS
**Platforms:** Windows, Linux, macOS

---

## Technology Stack

### Frontend: Tauri v2
- Rust-based desktop shell using each OS's native webview (WebView2/WebKitGTK/WebKit)
- Small binary (~5MB), cross-platform, proven
- UI built in HTML/CSS/JS (framework TBD — likely React or Svelte)
- Chosen for: cross-platform reliability, small footprint, large contributor pool

### Backend: Python (existing SPATools codebase)
- Runs as a local process that Tauri launches and manages
- Exposes a local API for the frontend to consume
- Reuses all existing modules: `transport/`, `protocol/`, `live_data/`, `dtc/`, `config/`, `module_map/`

### Communication: Hybrid REST + WebSocket
- **REST API** (FastAPI) for request/response operations:
  - Vehicle discovery and connection management
  - DTC read/clear
  - Config read/write
  - DID scan start/stop
  - Module enumeration
- **WebSocket** for real-time streaming:
  - Live sensor data push (configurable poll interval)
  - DID scan progress updates
  - Connection status changes

**Why hybrid:** Most operations are naturally request/response (read DTCs, write config). Live data streaming and scan progress are push-based and would require awkward polling over REST. The hybrid keeps commands clean and debuggable while giving streaming a proper channel.

---

## Application Layout

### Structure: Sidebar Navigation

Persistent left sidebar with:
- App logo and vehicle identifier at top (model, year)
- Navigation links to each view
- Connection status section at bottom (connected/disconnected, VCM IP, logical address)

Sidebar is collapsible to icon-only mode for more content space.

Content area fills the right side of the window.

### Navigation Items

| Item | Icon | Description | Status |
|------|------|-------------|--------|
| Dashboard | Home | Landing page, vehicle overview | Active |
| Live Data | Activity/pulse | Real-time sensor streaming | Active |
| DTCs | Alert triangle | Fault code management | Active |
| Config | Settings/sliders | Module configuration | Active |
| DID Scanner | Search/scan | Research DID discovery | Active |
| ECU Tune | Chip/flash | ECU read/write/flash | Greyed out — blocked on security research |

---

## Visual Style: Volvo Scandinavian

Steel blue palette with cool grey tones. Inspired by Volvo's Sensus UI and Scandinavian design principles: calm, confident, premium, understated.

### Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Background (primary) | Dark navy | `#1e2a3a` |
| Background (sidebar) | Deeper navy | `#141c28` |
| Background (cards/panels) | Blue-grey | `#243447` |
| Background (recessed) | Dark blue | `#1a2533` |
| Accent (primary) | Steel blue | `#5b9bd5` |
| Accent (secondary) | Light blue | `#81b4d8` |
| Text (primary) | Near-white blue | `#e8f0f8` |
| Text (secondary) | Muted blue | `#8aa8c7` |
| Text (tertiary) | Grey blue | `#6b8299` |
| Text (disabled) | Dark grey | `#4a5568` |
| Status: OK/connected | Green | `#4caf50` |
| Status: Warning | Amber | `#ffa726` |
| Status: Error/danger | Red | `#ff5252` |

### Typography
- System font stack: `'Segoe UI', system-ui, -apple-system, sans-serif`
- Monospace for hex values, DIDs, raw data: `'SF Mono', 'Consolas', monospace`
- Tabular numerals (`font-variant-numeric: tabular-nums`) for all data values so columns stay aligned during updates

### Design Tokens
- Border radius (cards): `6px`
- Border radius (buttons, badges): `3-4px`
- Spacing scale: `4px` base unit
- Active nav indicator: `2px` left border in accent color with tinted background

---

## View Specifications

### 1. Dashboard

**Purpose:** Landing page after connecting. At-a-glance vehicle health.

**Sections:**

1. **Vehicle info bar** — Model, VIN (truncated with hover for full), current UDS session type
2. **Status cards row** (3 cards):
   - Module count + "All responding" or count of unresponsive
   - Active DTC count + affected module count
   - Last scan timestamp
3. **Module status grid** — One small card per module (15+), each showing:
   - Module abbreviation (CEM, ECM, TCM, etc.)
   - Left border color: green (OK), amber (has DTCs), red (not responding)
   - DTC count or "OK"

**Interactions:**
- Click a module card → navigates to DTCs view filtered to that module
- Click DTC count card → navigates to DTCs view

### 2. Live Data

**Purpose:** Real-time sensor streaming with trend visualization.

**Layout: Hybrid pinned cards + expandable charts**

**Header bar:**
- View title + streaming status indicator ("● Streaming 1.0s")
- Subsystem filter toggles: Engine, Transmission, Chassis (multi-select)
- Card/Table view toggle

**Pinned cards row (top):**
- Horizontal row of sensor cards, one per active PID
- Each card shows: label, current value + unit, inline sparkline (last 60 seconds)
- Values update in real-time via WebSocket
- Color coding: normal values in white/blue, warning values in amber, critical in red (based on `range` from `did_registry.yaml`)

**Expanded chart area (below cards):**
- Click any pinned card to expand a full time-series chart
- Chart shows last 5 minutes of data with grid lines
- Area fill under the line for visual weight
- X-axis: relative time labels (-5:00, -2:30, Now)
- Y-axis: auto-scaled to data range

**Table view (toggle):**
- Structured table with columns: Parameter, Value, Unit, Trend (sparkline), Status
- Sortable by any column
- Warning indicators (▲ amber, ● blue) when values leave normal range

**Data source:** WebSocket stream from `LiveDataReader.poll()` — each cycle pushes a `list[LiveReading]` to the frontend.

### 3. DTCs (Diagnostic Trouble Codes)

**Purpose:** Read and clear fault codes, grouped by module.

**Header bar:**
- View title + active DTC count
- Refresh button to re-scan all modules

**Content: Collapsible module groups**

Each module with active DTCs gets a group:
- **Group header:** Expand/collapse arrow, module abbreviation, full module name, DTC count badge, "Clear" button
- **DTC rows (inside group):** Hex code (monospace), human description, status byte
- Groups with DTCs are expanded by default, clean modules are hidden (with a "Show all modules" toggle)

**Clear workflow:**
1. Click "Clear ×" on a module group header
2. Confirmation modal: "Clear all DTCs from CEM? This requires an extended diagnostic session."
3. On confirm: sends UDS 0x14, refreshes DTC list
4. Success/failure toast notification

**Data source:** REST endpoint wrapping `dtc.reader.read_all_modules()` + `dtc.decoder.format_dtc()`

### 4. Config (Module Configuration)

**Purpose:** Read and write module parameters with explicit safety model.

**Header bar:**
- View title + current mode indicator ("Read Only" or "Edit Mode")
- "Enter Edit Mode" / "Exit Edit Mode" toggle button with lock icon

**Module tabs:** Horizontal tab bar to switch between modules (CEM, ECM, IHU, etc.)

**Config table:**
- Columns: Parameter (human name), Value, Unit, DID (hex, monospace)
- Boolean values displayed as ON/OFF badges (green/grey)
- Numeric values displayed with units
- Enum values displayed as human labels

**Read-only mode (default):**
- All values displayed but not editable
- "Enter Edit Mode" button prominent

**Edit mode:**
- Triggered by clicking "Enter Edit Mode"
- Backend initiates: session switch to Extended → security access handshake (Level 3)
- If security access fails: error message, stays in read-only
- If successful: values become editable (inline dropdowns for bools/enums, input fields for numbers)
- Visual indicator: edit mode banner, editable fields have visible input borders
- "Save" button per-row or a global "Save Changes" button
- Confirmation modal before any write: "Write `stop_start_enabled = OFF` to CEM via DID 0xF401?"
- "Exit Edit Mode" returns to read-only and resets session

**Data source:** REST endpoints wrapping `config.reader` and `config.writer`

### 5. DID Scanner

**Purpose:** Research tool for brute-force DID discovery. Community contribution feature.

**Scan configuration panel:**
- Start DID input (hex, default `0xDD00`)
- End DID input (hex, default `0xDDFF`)
- "Start Scan" button (becomes "Stop Scan" during scan)

**Progress bar:**
- Current DID being scanned
- Percentage complete
- Count of responsive DIDs found so far
- Animated progress bar

**Results table (streams in during scan):**
- Columns: DID (hex), Raw Data (hex), Known? (label from registry or "Unknown")
- Known DIDs highlighted with green checkmark and parameter name from `did_registry.yaml`
- Unknown DIDs flagged with amber "?" marker
- Sortable, filterable after scan completes

**Export:**
- "Export JSON" button — saves results to `did_scan_results.json` (matches existing CLI format)
- "Copy for submission" — formats results for pasting into a GitHub issue / `did_registry.yaml` PR

**Data source:** REST to start/stop scan, WebSocket for progress updates and result streaming from `protocol.uds.scan_dids()`

---

## Architecture

### Process Model

```
┌─────────────────────────────┐
│        Tauri Shell          │
│  ┌───────────────────────��  │
│  │   WebView (UI)        │  │
│  │   HTML/CSS/JS         │  │
│  │   ↕ fetch / ws        │  │
│  └───���───────────────────┘  │
│            ↕                │
│  ┌───────────────────────┐  │
│  │   Tauri Rust Core     │  │
│  │   - Launch Python     │  │
│  │   - Manage lifecycle  │  │
│  │   - OS integration    │  │
│  └───────��───────────────┘  │
└─────────────────────────────┘
            ↕ HTTP + WS (localhost)
┌─────────────────────────────┐
│     Python Backend          │
│  ┌───────────────────────┐  │
│  │  FastAPI Server       │  │
��  │  - REST endpoints     │  │
│  │  - WebSocket hub      │  │
│  └───────────────────────┘  │
│            ↕                │
│  ┌───────���───────────────┐  │
│  │  SPATools Core        │  │
│  │  transport/ protocol/ │  │
│  │  live_data/ dtc/      │  │
│  │  config/ module_map/  │  │
│  └───────────────────────┘  │
│            ↕ DoIP (TCP)     │
│         VOE Adapter         │
│            ↕                │
│        Vehicle VCM          │
└─────────────────────────────┘
```

### Tauri Responsibilities
- Launch Python backend process on app start
- Monitor backend health (restart if crashed)
- Kill backend on app close
- Provide native window chrome, menus, tray icon
- Handle OS-level concerns: file dialogs (JSON export), auto-update

### Python Backend Responsibilities
- All vehicle communication (DoIP/UDS)
- All business logic (DID decoding, DTC formatting, config encoding)
- Serve REST API and WebSocket endpoints
- Manage UDS session lifecycle and keepalive

### REST API Endpoints (preliminary)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/connect` | Discover or connect to vehicle |
| DELETE | `/api/connect` | Disconnect |
| GET | `/api/status` | Connection status, vehicle info |
| GET | `/api/modules` | List all modules with health |
| GET | `/api/dtc` | Read DTCs from all modules |
| DELETE | `/api/dtc/{module}` | Clear DTCs for a module |
| GET | `/api/config/{module}` | Read config params for a module |
| PUT | `/api/config/{module}/{param}` | Write a config param |
| POST | `/api/config/edit-mode` | Enter edit mode (security access) |
| DELETE | `/api/config/edit-mode` | Exit edit mode |
| POST | `/api/scan` | Start DID scan |
| DELETE | `/api/scan` | Stop DID scan |
| GET | `/api/scan/results` | Get scan results |

### WebSocket Channels

| Channel | Direction | Data |
|---------|-----------|------|
| `live-data` | Server → Client | `LiveReading[]` per poll cycle |
| `scan-progress` | Server → Client | `{current_did, percent, found_count, result?}` |
| `connection-status` | Server → Client | `{connected, ip, module_count}` |

---

## Error Handling

### Connection Errors
- Vehicle not found on network → Dashboard shows "No vehicle found" with retry button
- Connection lost mid-session → All views show disconnected banner, auto-retry with backoff
- Session timeout (idle >5s without keepalive) → Backend auto-recovers with session re-establishment

### Operation Errors
- DTC clear fails → Toast notification with error details, DTC list unchanged
- Config write fails → Modal with error, value reverts to original
- Security access denied → "Edit Mode" fails with explanation ("CEM PIN required" or "Security level not implemented")
- DID scan interrupted → Partial results preserved, can resume or export what was found

### Backend Crashes
- Tauri monitors Python process, auto-restarts
- Frontend shows "Reconnecting to backend..." overlay
- All state is re-fetched on reconnection

---

## Scope Boundaries

### In scope for v1
- All five views as described above
- REST + WebSocket communication layer
- Tauri shell with Python backend lifecycle management
- Cross-platform build (Windows, Linux, macOS)
- JSON export from DID scanner
- Dark theme only (Scandinavian palette)

### Out of scope for v1
- ECU Tune view (greyed out, blocked on security research)
- Light theme
- Data logging to file during live streaming
- Remote/networked access
- Auto-update mechanism
- User preferences / settings persistence
- Internationalization
