#!/bin/bash
# install_plugin.sh — Internal installation logic
# This script is called by install.sh and handles the core installation.
# For normal installation, use install.sh in the project root instead.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

exec bash "$ROOT_DIR/install.sh" "$@"
