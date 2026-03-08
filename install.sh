#!/bin/bash
# install.sh — Install cockpit-pcloud plugin
# Usage: sudo bash install.sh

set -e

PLUGIN_DIR="/usr/share/cockpit/cockpit-pcloud"
CONF_SYSTEM="/etc/cockpit/pcloud.conf"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== cockpit-pcloud installer ==="
echo ""

# Check for root
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)."
    exit 1
fi

# Check dependencies
if ! command -v cockpit-bridge >/dev/null 2>&1; then
    echo "Error: Cockpit does not appear to be installed."
    echo "Install it first: sudo apt install cockpit (Debian/Ubuntu)"
    echo "                  sudo dnf install cockpit (Fedora/RHEL)"
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is not installed."
    exit 1
fi

echo "[1/4] Creating plugin directory..."
mkdir -p "$PLUGIN_DIR"

echo "[2/4] Copying plugin files..."
cp "$SCRIPT_DIR/src/manifest.json" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/src/index.html" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/src/pcloud.js" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/src/pcloud.css" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/src/pcloud-backend.py" "$PLUGIN_DIR/"

chmod 644 "$PLUGIN_DIR/manifest.json"
chmod 644 "$PLUGIN_DIR/index.html"
chmod 644 "$PLUGIN_DIR/pcloud.js"
chmod 644 "$PLUGIN_DIR/pcloud.css"
chmod 755 "$PLUGIN_DIR/pcloud-backend.py"

echo "[3/4] Setting up configuration..."
mkdir -p /etc/cockpit

if [ ! -f "$CONF_SYSTEM" ]; then
    cat > "$CONF_SYSTEM" <<'CONF'
[pcloud]
token =
region = eu
backup_path = /BACKUP_V2
CONF
    chmod 640 "$CONF_SYSTEM"
    chown root:root "$CONF_SYSTEM"
    echo "  Created $CONF_SYSTEM (token not yet configured)"
else
    echo "  Configuration file already exists, skipping"
fi

echo "[4/4] Done!"
echo ""
echo "============================================"
echo "  cockpit-pcloud installed successfully!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Add your pCloud token to: $CONF_SYSTEM"
echo "  2. Reload Cockpit or open it in your browser"
echo "  3. Find 'pCloud' under the Tools menu"
echo ""
echo "See docs/token-setup.md for how to get a pCloud access token."
