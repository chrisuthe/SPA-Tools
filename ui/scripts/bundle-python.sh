#!/bin/bash
# Copy Python source files into src-tauri/python/ for Tauri resource bundling.
# Called by the Tauri build process via beforeBuildCommand.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$UI_DIR")"
TARGET="$UI_DIR/src-tauri/python"

# Clean and recreate
rm -rf "$TARGET"
mkdir -p "$TARGET/api/routes" "$TARGET/api/ws"
mkdir -p "$TARGET/cli"
mkdir -p "$TARGET/config"
mkdir -p "$TARGET/dtc"
mkdir -p "$TARGET/ecu_tune"
mkdir -p "$TARGET/live_data"
mkdir -p "$TARGET/module_map"
mkdir -p "$TARGET/protocol"
mkdir -p "$TARGET/transport"

# Copy Python files (excluding __pycache__)
cp "$PROJECT_ROOT"/api/*.py "$TARGET/api/"
cp "$PROJECT_ROOT"/api/routes/*.py "$TARGET/api/routes/"
cp "$PROJECT_ROOT"/api/ws/*.py "$TARGET/api/ws/"
cp "$PROJECT_ROOT"/cli/*.py "$TARGET/cli/"
cp "$PROJECT_ROOT"/config/*.py "$TARGET/config/"
cp "$PROJECT_ROOT"/dtc/*.py "$TARGET/dtc/"
cp "$PROJECT_ROOT"/ecu_tune/*.py "$TARGET/ecu_tune/"
cp "$PROJECT_ROOT"/live_data/*.py "$TARGET/live_data/"
cp "$PROJECT_ROOT"/module_map/*.yaml "$TARGET/module_map/"
cp "$PROJECT_ROOT"/protocol/*.py "$TARGET/protocol/"
cp "$PROJECT_ROOT"/transport/*.py "$TARGET/transport/"
cp "$PROJECT_ROOT"/requirements.txt "$TARGET/"

echo "Bundled Python files into $TARGET"
