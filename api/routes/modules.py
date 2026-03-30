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
