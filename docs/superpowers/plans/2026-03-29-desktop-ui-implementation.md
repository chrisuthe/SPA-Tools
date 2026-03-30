# SPATools Desktop UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Tauri v2 desktop app with a React frontend and Python FastAPI backend that provides a visual interface for SPATools vehicle diagnostics.

**Architecture:** Tauri v2 shell launches a Python FastAPI process on startup. The React frontend communicates with the backend over localhost via REST (commands) and WebSocket (streaming). All vehicle logic stays in the existing Python modules.

**Tech Stack:** Tauri v2, React 18 + TypeScript + Vite, FastAPI + uvicorn, WebSocket

---

## File Structure

### New: `api/` — Python FastAPI Backend

```
api/
├── __init__.py
├── server.py              # FastAPI app, CORS, startup/shutdown, WS manager
├── models.py              # Pydantic response/request models
├── state.py               # App-level shared state (connection, session)
├── routes/
│   ├── __init__.py
│   ├── connection.py      # POST/DELETE/GET /api/connect, /api/status
│   ├── modules.py         # GET /api/modules
│   ├── dtc.py             # GET /api/dtc, DELETE /api/dtc/{module}
│   ├── config.py          # GET/PUT /api/config/*, POST/DELETE edit-mode
│   └── scan.py            # POST/DELETE /api/scan, GET /api/scan/results
└── ws/
    ├── __init__.py
    ├── manager.py          # WebSocket connection manager (broadcast)
    ├── live_data.py        # /ws/live-data endpoint
    └── scan_progress.py    # /ws/scan-progress endpoint
```

### New: `ui/` — Tauri + React Frontend

```
ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/              # App icons (generated)
│   └── src/
│       └── lib.rs          # Tauri setup, Python process management
├── src/
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Router + layout shell
│   ├── theme.css           # Design tokens as CSS variables
│   ├── app.css             # Global styles, sidebar, layout
│   ├── api.ts              # REST client (fetch wrappers)
│   ├── ws.ts               # WebSocket client + reconnect logic
│   ├── types.ts            # TypeScript types matching API models
│   ├── components/
│   │   ├── Sidebar.tsx     # Navigation sidebar with connection status
│   │   ├── Sparkline.tsx   # Inline SVG sparkline chart
│   │   ├── TimeChart.tsx   # Expanded time-series chart
│   │   ├── StatusBadge.tsx # ON/OFF and status badges
│   │   ├── Modal.tsx       # Confirmation/error modal
│   │   └── Toast.tsx       # Success/failure toast notification
│   └── views/
│       ├── Dashboard.tsx   # Vehicle overview, module grid
│       ├── LiveData.tsx    # Real-time sensor cards + charts
│       ├── Dtcs.tsx        # DTC list grouped by module
│       ├── Config.tsx      # Config table with edit mode
│       └── Scanner.tsx     # DID scanner with progress
```

### Modified Files

- `requirements.txt` — Add `fastapi`, `uvicorn[standard]`, `websockets`
- `pyproject.toml` — Add API dependencies
- `.gitignore` — Add `ui/node_modules/`, `ui/dist/`, `ui/src-tauri/target/`

---

## Task Breakdown

### Task 1: Python FastAPI Backend — Server + Connection + Modules

**Files:**
- Create: `api/__init__.py`, `api/server.py`, `api/models.py`, `api/state.py`
- Create: `api/routes/__init__.py`, `api/routes/connection.py`, `api/routes/modules.py`
- Create: `api/ws/__init__.py`, `api/ws/manager.py`
- Modify: `requirements.txt`, `pyproject.toml`

This task builds the FastAPI app scaffold, shared state management, and the connection/module endpoints. The server can be started standalone with `uvicorn api.server:app` for development.

- [ ] **Step 1: Add API dependencies**

Add to `requirements.txt`:
```
# API server
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
websockets>=14.0
```

Add to `pyproject.toml` dependencies:
```
"fastapi>=0.115.0",
"uvicorn[standard]>=0.34.0",
"websockets>=14.0",
```

- [ ] **Step 2: Create shared state module**

Create `api/state.py` — holds the app-level singleton for connection and session state:

```python
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AppState:
    """Mutable app-wide state shared across routes."""
    connected: bool = False
    vcm_ip: Optional[str] = None
    vcm_logical_addr: Optional[int] = None
    tester_addr: int = 0x0E80
    vehicle_vin: Optional[str] = None
    session_type: str = "DEFAULT"
    edit_mode: bool = False
    scan_running: bool = False
    scan_results: dict = field(default_factory=dict)
    # These hold the live objects when connected — typed as Any to
    # avoid importing transport/protocol at module level
    connection: Optional[object] = None
    uds_client: Optional[object] = None
    session_manager: Optional[object] = None


app_state = AppState()
```

- [ ] **Step 3: Create Pydantic models**

Create `api/models.py`:

```python
from pydantic import BaseModel
from typing import Optional


class ConnectRequest(BaseModel):
    ip: Optional[str] = None
    timeout: float = 5.0


class StatusResponse(BaseModel):
    connected: bool
    vcm_ip: Optional[str] = None
    vcm_logical_addr: Optional[str] = None
    tester_addr: str = "0x0E80"
    vehicle_vin: Optional[str] = None
    session_type: str = "DEFAULT"


class ModuleStatus(BaseModel):
    name: str
    full_name: str
    logical_address: Optional[str] = None
    dtc_count: int = 0
    responding: bool = False


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
```

- [ ] **Step 4: Create WebSocket connection manager**

Create `api/ws/__init__.py` (empty) and `api/ws/manager.py`:

```python
from fastapi import WebSocket
from typing import Dict, Set
import json


class WSManager:
    """Manages WebSocket connections grouped by channel."""

    def __init__(self):
        self._channels: Dict[str, Set[WebSocket]] = {}

    async def connect(self, channel: str, ws: WebSocket):
        await ws.accept()
        if channel not in self._channels:
            self._channels[channel] = set()
        self._channels[channel].add(ws)

    def disconnect(self, channel: str, ws: WebSocket):
        if channel in self._channels:
            self._channels[channel].discard(ws)

    async def broadcast(self, channel: str, data: dict):
        if channel not in self._channels:
            return
        dead = []
        for ws in self._channels[channel]:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._channels[channel].discard(ws)


ws_manager = WSManager()
```

- [ ] **Step 5: Create connection routes**

Create `api/routes/__init__.py` (empty) and `api/routes/connection.py`:

```python
from fastapi import APIRouter, HTTPException
from api.models import ConnectRequest, StatusResponse
from api.state import app_state

router = APIRouter(prefix="/api", tags=["connection"])


@router.post("/connect")
async def connect(req: ConnectRequest) -> StatusResponse:
    if app_state.connected:
        raise HTTPException(400, "Already connected")
    try:
        from transport.doip import SPAConnection
        if req.ip:
            conn = SPAConnection(req.ip)
        else:
            conn = SPAConnection.discover(timeout=req.timeout)
        conn.connect()
        app_state.connection = conn
        app_state.connected = True
        app_state.vcm_ip = conn.ip
        app_state.vcm_logical_addr = conn.logical_addr

        # Try to read VIN
        connector = conn.get_uds_connector()
        from udsoncan import Client
        client = Client(connector, request_timeout=2)
        client.open()
        app_state.uds_client = client

        from protocol.uds import read_did
        vin_bytes = read_did(client, 0xF190)
        if vin_bytes:
            app_state.vehicle_vin = vin_bytes.decode("ascii", errors="replace")

        return _status()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/connect")
async def disconnect() -> StatusResponse:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        if app_state.session_manager:
            app_state.session_manager.reset_to_default()
            app_state.session_manager = None
        if app_state.uds_client:
            app_state.uds_client.close()
            app_state.uds_client = None
        if app_state.connection:
            app_state.connection.disconnect()
            app_state.connection = None
        app_state.connected = False
        app_state.vcm_ip = None
        app_state.vcm_logical_addr = None
        app_state.vehicle_vin = None
        app_state.session_type = "DEFAULT"
        app_state.edit_mode = False
        return _status()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def status() -> StatusResponse:
    return _status()


def _status() -> StatusResponse:
    addr = None
    if app_state.vcm_logical_addr is not None:
        addr = f"0x{app_state.vcm_logical_addr:04X}"
    return StatusResponse(
        connected=app_state.connected,
        vcm_ip=app_state.vcm_ip,
        vcm_logical_addr=addr,
        tester_addr=f"0x{app_state.tester_addr:04X}",
        vehicle_vin=app_state.vehicle_vin,
        session_type=app_state.session_type,
    )
```

- [ ] **Step 6: Create modules route**

Create `api/routes/modules.py`:

```python
from fastapi import APIRouter
from api.models import ModuleStatus
from api.state import app_state
import yaml
from pathlib import Path

router = APIRouter(prefix="/api", tags=["modules"])

MODULES_YAML = Path(__file__).resolve().parent.parent.parent / "module_map" / "spa_modules.yaml"


@router.get("/modules")
async def list_modules() -> list[ModuleStatus]:
    with open(MODULES_YAML) as f:
        data = yaml.safe_load(f)

    modules = []
    for name, info in data.get("modules", {}).items():
        modules.append(ModuleStatus(
            name=name,
            full_name=info.get("full_name", name),
            logical_address=info.get("logical_address"),
            dtc_count=0,
            responding=app_state.connected,
        ))
    return modules
```

- [ ] **Step 7: Create FastAPI server**

Create `api/__init__.py` (empty) and `api/server.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import connection, modules, dtc, config, scan
from api.ws import live_data, scan_progress

app = FastAPI(title="SPATools API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(connection.router)
app.include_router(modules.router)
app.include_router(dtc.router)
app.include_router(config.router)
app.include_router(scan.router)

# WebSocket routes
app.include_router(live_data.router)
app.include_router(scan_progress.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 8: Install deps and verify server starts**

Run:
```bash
pip install -r requirements.txt
uvicorn api.server:app --host 127.0.0.1 --port 8384
```

Verify: `curl http://127.0.0.1:8384/api/health` returns `{"status":"ok"}`.

- [ ] **Step 9: Commit**

```bash
git add api/ requirements.txt pyproject.toml
git commit -m "feat: add FastAPI backend — server, connection, and module endpoints"
```

---

### Task 2: Python Backend — DTC, Config, Scan Routes + WebSocket Endpoints

**Files:**
- Create: `api/routes/dtc.py`, `api/routes/config.py`, `api/routes/scan.py`
- Create: `api/ws/live_data.py`, `api/ws/scan_progress.py`

This task completes all remaining API endpoints and WebSocket handlers.

- [ ] **Step 1: Create DTC routes**

Create `api/routes/dtc.py`:

```python
from fastapi import APIRouter, HTTPException
from api.state import app_state

router = APIRouter(prefix="/api", tags=["dtc"])


@router.get("/dtc")
async def read_dtcs() -> list[dict]:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from dtc.reader import read_all_modules
        dtcs = read_all_modules(app_state.uds_client)
        return dtcs
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/dtc/{module}")
async def clear_dtcs(module: str) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from dtc.clearer import clear_module
        success = clear_module(app_state.uds_client, module)
        if success:
            return {"status": "cleared", "module": module}
        raise HTTPException(500, f"Failed to clear DTCs for {module}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
```

- [ ] **Step 2: Create config routes**

Create `api/routes/config.py`:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Union
from api.state import app_state

router = APIRouter(prefix="/api", tags=["config"])


class ConfigWriteRequest(BaseModel):
    value: Union[int, bool, str]


@router.get("/config/{module}")
async def read_config(module: str) -> list[dict]:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    try:
        from config.reader import dump_all_config
        params = dump_all_config(app_state.uds_client)
        return params
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/config/{module}/{param}")
async def write_config(module: str, param: str, req: ConfigWriteRequest) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if not app_state.edit_mode:
        raise HTTPException(403, "Edit mode not active")
    try:
        from config.writer import write_param
        success = write_param(app_state.uds_client, param, req.value)
        if success:
            return {"status": "written", "param": param, "value": req.value}
        raise HTTPException(500, f"Failed to write {param}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/config/edit-mode")
async def enter_edit_mode() -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if app_state.edit_mode:
        return {"edit_mode": True}
    try:
        from protocol.session import SessionManager, SessionType
        if not app_state.session_manager:
            app_state.session_manager = SessionManager(app_state.uds_client)
        app_state.session_manager.switch(SessionType.EXTENDED)
        app_state.session_type = "EXTENDED"
        app_state.edit_mode = True
        return {"edit_mode": True}
    except Exception as e:
        raise HTTPException(500, f"Security access failed: {e}")


@router.delete("/config/edit-mode")
async def exit_edit_mode() -> dict:
    if app_state.session_manager:
        try:
            app_state.session_manager.reset_to_default()
        except Exception:
            pass
    app_state.session_type = "DEFAULT"
    app_state.edit_mode = False
    return {"edit_mode": False}
```

- [ ] **Step 3: Create scan routes**

Create `api/routes/scan.py`:

```python
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.state import app_state
from api.ws.manager import ws_manager

router = APIRouter(prefix="/api", tags=["scan"])


class ScanRequest(BaseModel):
    start: int = 0xDD00
    end: int = 0xDDFF


@router.post("/scan")
async def start_scan(req: ScanRequest) -> dict:
    if not app_state.connected:
        raise HTTPException(400, "Not connected")
    if app_state.scan_running:
        raise HTTPException(400, "Scan already running")

    app_state.scan_running = True
    app_state.scan_results = {}

    # Run scan in background task
    asyncio.create_task(_run_scan(req.start, req.end))
    return {"status": "started", "start": f"0x{req.start:04X}", "end": f"0x{req.end:04X}"}


@router.delete("/scan")
async def stop_scan() -> dict:
    app_state.scan_running = False
    return {"status": "stopped"}


@router.get("/scan/results")
async def get_results() -> dict:
    return {
        "running": app_state.scan_running,
        "total_responsive": len(app_state.scan_results),
        "results": {
            f"0x{did:04X}": data.hex() for did, data in app_state.scan_results.items()
        },
    }


async def _run_scan(start: int, end: int):
    from protocol.uds import read_did
    total = end - start + 1
    for i, did in enumerate(range(start, end + 1)):
        if not app_state.scan_running:
            break
        try:
            result = read_did(app_state.uds_client, did)
            if result is not None:
                app_state.scan_results[did] = result
        except Exception:
            pass

        progress = {
            "current_did": f"0x{did:04X}",
            "percent": round((i + 1) / total * 100, 1),
            "found_count": len(app_state.scan_results),
        }
        await ws_manager.broadcast("scan-progress", progress)
        await asyncio.sleep(0.05)  # Yield to event loop

    app_state.scan_running = False
    await ws_manager.broadcast("scan-progress", {
        "current_did": f"0x{end:04X}",
        "percent": 100,
        "found_count": len(app_state.scan_results),
        "complete": True,
    })
```

- [ ] **Step 4: Create live data WebSocket endpoint**

Create `api/ws/live_data.py`:

```python
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.state import app_state
from api.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/live-data")
async def live_data_ws(ws: WebSocket):
    await ws_manager.connect("live-data", ws)
    try:
        while True:
            # Wait for messages from client (e.g., config changes)
            msg = await ws.receive_text()
            # Client can send "start" / "stop" to control polling
    except WebSocketDisconnect:
        ws_manager.disconnect("live-data", ws)


async def poll_live_data(pids: list[str], interval: float = 1.0):
    """Background task that polls DIDs and broadcasts readings.
    Called from a route or startup hook when streaming is requested."""
    from live_data.reader import LiveDataReader
    from live_data.pids import get_dids_by_names

    dids = get_dids_by_names(pids)
    reader = LiveDataReader(app_state.uds_client, dids)

    async for readings in reader.poll(interval=interval):
        if not app_state.connected:
            break
        data = []
        for r in readings:
            data.append({
                "name": r.did_def.name,
                "did": f"0x{r.did_def.did:04X}",
                "value": r.value,
                "unit": r.did_def.unit,
                "error": r.error,
                "timestamp": r.timestamp,
            })
        await ws_manager.broadcast("live-data", {"readings": data})
```

- [ ] **Step 5: Create scan progress WebSocket endpoint**

Create `api/ws/scan_progress.py`:

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/scan-progress")
async def scan_progress_ws(ws: WebSocket):
    await ws_manager.connect("scan-progress", ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect("scan-progress", ws)
```

- [ ] **Step 6: Commit**

```bash
git add api/routes/dtc.py api/routes/config.py api/routes/scan.py
git add api/ws/live_data.py api/ws/scan_progress.py
git commit -m "feat: add DTC, config, scan REST routes and WebSocket endpoints"
```

---

### Task 3: Tauri + React Foundation — Project Scaffold, Theme, Shell Layout

**Files:**
- Create: `ui/` directory (Tauri v2 + React + TypeScript + Vite)
- Create: `ui/src/theme.css`, `ui/src/app.css`, `ui/src/App.tsx`, `ui/src/main.tsx`
- Create: `ui/src/types.ts`, `ui/src/api.ts`, `ui/src/ws.ts`
- Create: `ui/src/components/Sidebar.tsx`
- Create: `ui/src/views/` — placeholder files for all 5 views
- Create: `ui/src-tauri/src/lib.rs` — Python process management
- Modify: `.gitignore`

This task scaffolds the entire frontend project, establishes the visual theme, sidebar navigation, and routing shell. View components are created as placeholders so subsequent tasks can fill them in independently.

- [ ] **Step 1: Initialize Tauri v2 + React project**

From the project root, run:
```bash
npm create tauri-app@latest ui -- --template react-ts --manager npm
```

This creates `ui/` with Tauri v2 + React + TypeScript + Vite preconfigured.

Then install additional frontend dependencies:
```bash
cd ui && npm install react-router-dom
```

- [ ] **Step 2: Add to .gitignore**

Append to root `.gitignore`:
```
# Tauri + React frontend
ui/node_modules/
ui/dist/
ui/src-tauri/target/
```

- [ ] **Step 3: Create design tokens**

Create `ui/src/theme.css`:

```css
:root {
  /* Backgrounds */
  --bg-primary: #1e2a3a;
  --bg-sidebar: #141c28;
  --bg-card: #243447;
  --bg-recessed: #1a2533;

  /* Accent */
  --accent: #5b9bd5;
  --accent-light: #81b4d8;
  --accent-tint: #1a2640;

  /* Text */
  --text-primary: #e8f0f8;
  --text-secondary: #8aa8c7;
  --text-tertiary: #6b8299;
  --text-disabled: #4a5568;

  /* Status */
  --status-ok: #4caf50;
  --status-warn: #ffa726;
  --status-error: #ff5252;

  /* Typography */
  --font-sans: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'Consolas', 'Liberation Mono', monospace;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-6: 24px;
  --sp-8: 32px;

  /* Radii */
  --radius-sm: 3px;
  --radius-md: 6px;

  /* Sidebar */
  --sidebar-width: 200px;
  --sidebar-collapsed: 56px;
}
```

- [ ] **Step 4: Create global styles**

Create `ui/src/app.css`:

```css
@import './theme.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

#root {
  display: flex;
  height: 100vh;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4);
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-recessed); }
::-webkit-scrollbar-thumb { background: var(--text-disabled); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }

/* Utility classes */
.mono { font-family: var(--font-mono); }
.tabular { font-variant-numeric: tabular-nums; }
.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.text-disabled { color: var(--text-disabled); }
.text-ok { color: var(--status-ok); }
.text-warn { color: var(--status-warn); }
.text-error { color: var(--status-error); }
```

- [ ] **Step 5: Create TypeScript types**

Create `ui/src/types.ts`:

```typescript
export interface StatusResponse {
  connected: boolean;
  vcm_ip: string | null;
  vcm_logical_addr: string | null;
  tester_addr: string;
  vehicle_vin: string | null;
  session_type: string;
}

export interface ModuleStatus {
  name: string;
  full_name: string;
  logical_address: string | null;
  dtc_count: number;
  responding: boolean;
}

export interface DTC {
  module: string;
  code: string;
  display: string;
  description: string;
  status: number;
}

export interface ConfigParam {
  param: string;
  did: number;
  raw: string;
  value: number | boolean;
  unit: string;
}

export interface LiveReading {
  name: string;
  did: string;
  value: number | null;
  unit: string;
  error: string | null;
  timestamp: number;
}

export interface ScanProgress {
  current_did: string;
  percent: number;
  found_count: number;
  complete?: boolean;
}

export interface ScanResult {
  running: boolean;
  total_responsive: number;
  results: Record<string, string>;
}
```

- [ ] **Step 6: Create REST API client**

Create `ui/src/api.ts`:

```typescript
import type { StatusResponse, ModuleStatus, DTC, ConfigParam, ScanResult } from './types';

const BASE = 'http://127.0.0.1:8384';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  connect: (ip?: string) => request<StatusResponse>('POST', '/api/connect', { ip }),
  disconnect: () => request<StatusResponse>('DELETE', '/api/connect'),
  status: () => request<StatusResponse>('GET', '/api/status'),
  modules: () => request<ModuleStatus[]>('GET', '/api/modules'),
  dtcReadAll: () => request<DTC[]>('GET', '/api/dtc'),
  dtcClear: (module: string) => request<unknown>('DELETE', `/api/dtc/${module}`),
  configRead: (module: string) => request<ConfigParam[]>('GET', `/api/config/${module}`),
  configWrite: (module: string, param: string, value: unknown) =>
    request<unknown>('PUT', `/api/config/${module}/${param}`, { value }),
  enterEditMode: () => request<{ edit_mode: boolean }>('POST', '/api/config/edit-mode'),
  exitEditMode: () => request<{ edit_mode: boolean }>('DELETE', '/api/config/edit-mode'),
  startScan: (start: number, end: number) =>
    request<unknown>('POST', '/api/scan', { start, end }),
  stopScan: () => request<unknown>('DELETE', '/api/scan'),
  scanResults: () => request<ScanResult>('GET', '/api/scan/results'),
};
```

- [ ] **Step 7: Create WebSocket client**

Create `ui/src/ws.ts`:

```typescript
type MessageHandler = (data: unknown) => void;

export class WS {
  private socket: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(path: string) {
    this.url = `ws://127.0.0.1:8384${path}`;
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      this.handlers.forEach((h) => h(data));
    };
    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(data: unknown) {
    this.socket?.send(JSON.stringify(data));
  }
}
```

- [ ] **Step 8: Create Sidebar component**

Create `ui/src/components/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import type { StatusResponse } from '../types';

interface SidebarProps {
  status: StatusResponse | null;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⊞' },
  { to: '/live', label: 'Live Data', icon: '◉' },
  { to: '/dtc', label: 'DTCs', icon: '△' },
  { to: '/config', label: 'Config', icon: '⚙' },
  { to: '/scanner', label: 'DID Scanner', icon: '⊕' },
  { to: '/tune', label: 'ECU Tune', icon: '◈', disabled: true },
];

export default function Sidebar({ status }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">⬡ SPATools</span>
        {status?.vehicle_vin && (
          <span className="sidebar-vehicle">{status.vehicle_vin.slice(0, 11)}…</span>
        )}
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.disabled ? '#' : item.to}
            className={({ isActive }) =>
              `sidebar-link${isActive && !item.disabled ? ' active' : ''}${item.disabled ? ' disabled' : ''}`
            }
            onClick={(e) => item.disabled && e.preventDefault()}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className={`sidebar-status ${status?.connected ? 'connected' : ''}`}>
          <span className="status-dot">●</span>
          <span>{status?.connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {status?.connected && (
          <>
            <div className="sidebar-detail">{status.vcm_ip}</div>
            <div className="sidebar-detail">VCM {status.vcm_logical_addr}</div>
          </>
        )}
      </div>
    </nav>
  );
}
```

Add sidebar styles to `ui/src/app.css`:

```css
/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid var(--bg-recessed);
}

.sidebar-header {
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--bg-recessed);
}

.sidebar-logo {
  color: var(--accent);
  font-weight: 700;
  font-size: 15px;
  display: block;
}

.sidebar-vehicle {
  color: var(--text-disabled);
  font-size: 11px;
}

.sidebar-nav {
  flex: 1;
  padding: var(--sp-2) 0;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  color: var(--text-tertiary);
  text-decoration: none;
  font-size: 13px;
  border-left: 2px solid transparent;
  transition: all 0.15s;
}

.sidebar-link:hover:not(.disabled) {
  color: var(--text-secondary);
  background: var(--bg-recessed);
}

.sidebar-link.active {
  color: var(--accent);
  background: var(--accent-tint);
  border-left-color: var(--accent);
}

.sidebar-link.disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
  opacity: 0.5;
}

.sidebar-icon {
  width: 20px;
  text-align: center;
  font-size: 14px;
}

.sidebar-footer {
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--bg-recessed);
}

.sidebar-status {
  font-size: 11px;
  color: var(--text-disabled);
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

.sidebar-status.connected { color: var(--status-ok); }

.status-dot { font-size: 8px; }

.sidebar-detail {
  font-size: 10px;
  color: var(--text-disabled);
  padding-left: 14px;
}
```

- [ ] **Step 9: Create placeholder views**

Create each view as a minimal placeholder that subsequent tasks will replace:

`ui/src/views/Dashboard.tsx`:
```tsx
export default function Dashboard() {
  return <div className="view"><h2>Dashboard</h2><p className="text-secondary">Vehicle overview</p></div>;
}
```

`ui/src/views/LiveData.tsx`:
```tsx
export default function LiveData() {
  return <div className="view"><h2>Live Data</h2><p className="text-secondary">Real-time sensor streaming</p></div>;
}
```

`ui/src/views/Dtcs.tsx`:
```tsx
export default function Dtcs() {
  return <div className="view"><h2>Diagnostic Trouble Codes</h2><p className="text-secondary">Fault code management</p></div>;
}
```

`ui/src/views/Config.tsx`:
```tsx
export default function Config() {
  return <div className="view"><h2>Configuration</h2><p className="text-secondary">Module parameters</p></div>;
}
```

`ui/src/views/Scanner.tsx`:
```tsx
export default function Scanner() {
  return <div className="view"><h2>DID Scanner</h2><p className="text-secondary">Research DID discovery</p></div>;
}
```

- [ ] **Step 10: Create App shell with routing**

Replace `ui/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import LiveData from './views/LiveData';
import Dtcs from './views/Dtcs';
import Config from './views/Config';
import Scanner from './views/Scanner';
import { api } from './api';
import type { StatusResponse } from './types';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    const interval = setInterval(() => {
      api.status().then(setStatus).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <Sidebar status={status} />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveData />} />
          <Route path="/dtc" element={<Dtcs />} />
          <Route path="/config" element={<Config />} />
          <Route path="/scanner" element={<Scanner />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
```

Replace `ui/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 11: Configure Tauri for Python backend management**

Update `ui/src-tauri/src/lib.rs` to launch the Python backend on startup:

```rust
use tauri::Manager;
use std::process::{Command, Child};
use std::sync::Mutex;

struct PythonBackend(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Launch Python FastAPI server
            let child = Command::new("python")
                .args(["-m", "uvicorn", "api.server:app",
                       "--host", "127.0.0.1", "--port", "8384"])
                .current_dir(
                    app.path().resource_dir()
                        .unwrap_or_else(|_| std::env::current_dir().unwrap())
                )
                .spawn()
                .expect("Failed to start Python backend");

            app.manage(PythonBackend(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<PythonBackend>() {
                    if let Ok(mut child) = state.0.lock() {
                        if let Some(ref mut c) = *child {
                            let _ = c.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 12: Verify frontend builds and runs**

```bash
cd ui && npm run dev
```

Verify: Browser opens with sidebar navigation and placeholder views. Clicking nav items routes between views.

- [ ] **Step 13: Commit**

```bash
git add ui/ .gitignore
git commit -m "feat: scaffold Tauri + React frontend with sidebar, routing, and theme"
```

---

### Task 4: Dashboard View

**Files:**
- Modify: `ui/src/views/Dashboard.tsx`

Implements the full Dashboard view: vehicle info bar, status summary cards, and module health grid.

- [ ] **Step 1: Implement Dashboard component**

Replace `ui/src/views/Dashboard.tsx` with the full implementation. Component should:

1. Fetch `/api/status` and `/api/modules` on mount
2. Fetch `/api/dtc` to get DTC counts per module
3. Display vehicle info bar (VIN, session type)
4. Display 3 status cards: module count, DTC count, last scan time
5. Display module grid with color-coded borders (green OK, amber has DTCs)
6. Module cards link to `/dtc?module=CEM` when clicked

Use inline styles or CSS module following the Scandinavian theme variables.

- [ ] **Step 2: Verify it renders with mock/disconnected state**

Run `npm run dev`, navigate to Dashboard. Should show "Disconnected" state gracefully.

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/Dashboard.tsx
git commit -m "feat: implement Dashboard view with module health grid"
```

---

### Task 5: Live Data View

**Files:**
- Modify: `ui/src/views/LiveData.tsx`
- Create: `ui/src/components/Sparkline.tsx`
- Create: `ui/src/components/TimeChart.tsx`

Implements the live data view with pinned sensor cards, sparklines, expandable time-series chart, and subsystem filters.

- [ ] **Step 1: Create Sparkline component**

Create `ui/src/components/Sparkline.tsx` — an inline SVG sparkline that accepts an array of numbers and renders a polyline. Props: `data: number[]`, `width?: number`, `height?: number`, `color?: string`.

- [ ] **Step 2: Create TimeChart component**

Create `ui/src/components/TimeChart.tsx` — an expanded time-series chart with grid lines, area fill, and time axis labels. Props: `data: {time: number, value: number}[]`, `label: string`, `unit: string`, `color?: string`.

- [ ] **Step 3: Implement LiveData component**

Replace `ui/src/views/LiveData.tsx` with the full implementation:

1. Connect to `/ws/live-data` WebSocket on mount
2. Maintain a rolling 5-minute buffer of readings per PID
3. Header: view title, streaming status badge, subsystem filter toggles (Engine/Trans/Chassis)
4. Pinned cards row: one card per PID showing name, current value, unit, and Sparkline (last 60s)
5. Click a card → expand TimeChart below showing last 5 minutes
6. Card/Table view toggle in header
7. Color coding: values in range → white/blue, warning → amber, critical → red

- [ ] **Step 4: Verify with dev server**

Run `npm run dev`, navigate to Live Data. Should show the UI structure (will show empty state without a vehicle connection).

- [ ] **Step 5: Commit**

```bash
git add ui/src/views/LiveData.tsx ui/src/components/Sparkline.tsx ui/src/components/TimeChart.tsx
git commit -m "feat: implement Live Data view with sparklines and time charts"
```

---

### Task 6: DTCs View

**Files:**
- Modify: `ui/src/views/Dtcs.tsx`
- Create: `ui/src/components/Modal.tsx`
- Create: `ui/src/components/Toast.tsx`

Implements the DTC view with collapsible module groups and clear workflow.

- [ ] **Step 1: Create Modal component**

Create `ui/src/components/Modal.tsx` — a centered overlay modal with title, body text, and confirm/cancel buttons. Props: `open: boolean`, `title: string`, `message: string`, `onConfirm: () => void`, `onCancel: () => void`, `confirmLabel?: string`.

Style: semi-transparent backdrop, card-style modal box using theme variables.

- [ ] **Step 2: Create Toast component**

Create `ui/src/components/Toast.tsx` — a toast notification that appears at top-right and auto-dismisses. Props: `message: string`, `type: 'success' | 'error'`, `onDismiss: () => void`.

- [ ] **Step 3: Implement Dtcs component**

Replace `ui/src/views/Dtcs.tsx` with full implementation:

1. Fetch `/api/dtc` on mount and on refresh button click
2. Group DTCs by `module` field
3. Each module group: collapsible section with module name, full name, DTC count badge, Clear button
4. DTC rows: hex code (mono), description, status byte (hex)
5. Groups with DTCs expanded by default, clean modules hidden
6. "Show all modules" toggle to show modules with 0 DTCs
7. Clear button → opens Modal: "Clear all DTCs from {module}?"
8. On confirm → call `api.dtcClear(module)`, show Toast on success/failure, re-fetch DTCs
9. Refresh button in header to re-scan

- [ ] **Step 4: Verify the view renders**

Run `npm run dev`, navigate to DTCs. Should show empty state ("No DTCs found" or "Connect to vehicle").

- [ ] **Step 5: Commit**

```bash
git add ui/src/views/Dtcs.tsx ui/src/components/Modal.tsx ui/src/components/Toast.tsx
git commit -m "feat: implement DTCs view with module groups and clear workflow"
```

---

### Task 7: Config View

**Files:**
- Modify: `ui/src/views/Config.tsx`
- Create: `ui/src/components/StatusBadge.tsx`

Implements the config view with read-only/edit mode toggle and module tabs.

- [ ] **Step 1: Create StatusBadge component**

Create `ui/src/components/StatusBadge.tsx` — renders ON/OFF badges for booleans and value badges for enums. Props: `value: boolean | number | string`, `type: 'bool' | 'enum' | 'number'`.

Boolean: green "ON" badge or grey "OFF" badge. Number/enum: neutral styled badge.

- [ ] **Step 2: Implement Config component**

Replace `ui/src/views/Config.tsx` with full implementation:

1. Module tabs at top: CEM, ECM, IHU (from `/api/modules`). Active tab fetches `/api/config/{module}`.
2. Header: view title, mode indicator ("Read Only" / "Edit Mode"), lock toggle button
3. Config table: columns — Parameter, Value, Unit, DID (hex mono)
4. Read-only mode: values displayed with StatusBadge, not editable
5. "Enter Edit Mode" button → calls `api.enterEditMode()`. On success: fields become editable. On failure: error toast.
6. Edit mode: booleans → toggle/dropdown, numbers → input fields, enums → dropdown
7. Per-row save button → opens Modal: "Write {param} = {value} to {module} via DID {did}?"
8. On confirm → `api.configWrite(module, param, value)`, show Toast
9. "Exit Edit Mode" button → calls `api.exitEditMode()`, reverts to read-only

- [ ] **Step 3: Verify the view renders**

Run `npm run dev`, navigate to Config. Should show module tabs and empty/disconnected state.

- [ ] **Step 4: Commit**

```bash
git add ui/src/views/Config.tsx ui/src/components/StatusBadge.tsx
git commit -m "feat: implement Config view with read/edit mode toggle"
```

---

### Task 8: DID Scanner View

**Files:**
- Modify: `ui/src/views/Scanner.tsx`

Implements the DID scanner view with range inputs, progress bar, streaming results, and export.

- [ ] **Step 1: Implement Scanner component**

Replace `ui/src/views/Scanner.tsx` with full implementation:

1. Scan config panel: Start DID input (hex, default 0xDD00), End DID input (hex, default 0xDDFF), Start/Stop button
2. Start button → `api.startScan(start, end)`, connects to `/ws/scan-progress` WebSocket
3. Progress bar: current DID, percentage, found count, animated fill bar
4. Results table streams in during scan: columns — DID (hex), Raw Data (hex), Known? (label from registry or "Unknown")
5. Known DIDs show green checkmark + parameter name. Unknown show amber "?" marker.
6. After scan completes: "Export JSON" button downloads results as JSON file
7. Stop button available during scan → `api.stopScan()`
8. Results persist after scan so user can browse/filter them

For the "Known?" column: fetch `/api/modules` or embed a static mapping of known DID names from the registry. A simple lookup object is fine:

```typescript
const KNOWN_DIDS: Record<string, string> = {
  '0xDD01': 'coolant_temp', '0xDD02': 'intake_air_temp',
  '0xDD03': 'boost_pressure', '0xDD04': 'engine_rpm',
  '0xDD05': 'throttle_position', '0xDD10': 'oil_temp',
  '0xDE01': 'current_gear', '0xDE10': 'atf_temp',
  '0xDA01': 'battery_voltage', '0xDA02': 'vehicle_speed',
  '0xF190': 'vin', '0xF18C': 'ecu_serial',
  '0xF101': 'software_version', '0xF191': 'hardware_version',
};
```

- [ ] **Step 2: Verify the view renders**

Run `npm run dev`, navigate to DID Scanner. Should show scan config panel with inputs and Start button.

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/Scanner.tsx
git commit -m "feat: implement DID Scanner view with progress and results table"
```

---

## Dependency Graph

```
Task 1 (Backend API core)
  └──> Task 2 (Backend remaining routes) ──┐
                                            │
Task 3 (Tauri + React foundation) ─────────┤
  └──> Task 4 (Dashboard) ─────────────────┤
  └──> Task 5 (Live Data) ─────────────────┤ (all views can run in parallel)
  └──> Task 6 (DTCs) ──────────────────────┤
  └──> Task 7 (Config) ────────────────────┤
  └──> Task 8 (Scanner) ───────────────────┘
```

Tasks 1-2 (backend) and Task 3 (frontend foundation) can run in parallel.
Tasks 4-8 (views) can all run in parallel after Task 3 completes.
