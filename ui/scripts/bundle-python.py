"""Copy Python source files into src-tauri/python/ for Tauri resource bundling.

Cross-platform — runs on Windows, macOS, and Linux with no dependencies.
"""
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
UI_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = UI_DIR.parent
TARGET = UI_DIR / "src-tauri" / "python"

# Directories to bundle: (source_relative_path, glob_pattern)
BUNDLES = [
    ("api", "*.py"),
    ("api/routes", "*.py"),
    ("api/ws", "*.py"),
    ("cli", "*.py"),
    ("config", "*.py"),
    ("dtc", "*.py"),
    ("ecu_tune", "*.py"),
    ("live_data", "*.py"),
    ("module_map", "*.yaml"),
    ("protocol", "*.py"),
    ("transport", "*.py"),
]

# Clean and recreate
if TARGET.exists():
    shutil.rmtree(TARGET)

for rel_dir, pattern in BUNDLES:
    src = PROJECT_ROOT / rel_dir
    dst = TARGET / rel_dir
    dst.mkdir(parents=True, exist_ok=True)
    for f in src.glob(pattern):
        shutil.copy2(f, dst / f.name)

# Copy requirements.txt
shutil.copy2(PROJECT_ROOT / "requirements.txt", TARGET / "requirements.txt")

print(f"Bundled Python files into {TARGET}")
