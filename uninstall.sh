#!/bin/bash
# uninstall.sh — Remove cockpit-pcloud plugin

set -e

PLUGIN_DIR="/usr/share/cockpit/cockpit-pcloud"
CONF_SYSTEM="/etc/cockpit/pcloud.conf"

echo "=== cockpit-pcloud uninstaller ==="
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)."
    exit 1
fi

if [ -d "$PLUGIN_DIR" ]; then
    echo "Removing plugin files..."
    rm -rf "$PLUGIN_DIR"
    echo "  Removed $PLUGIN_DIR"
else
    echo "  Plugin directory not found, skipping"
fi

echo ""
echo "Note: Configuration file preserved at $CONF_SYSTEM"
echo "  To remove it manually: sudo rm $CONF_SYSTEM"
echo ""
echo "cockpit-pcloud has been uninstalled."
