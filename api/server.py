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
