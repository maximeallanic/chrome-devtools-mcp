#!/bin/bash
# Uninstall Chrome DevTools MCP Server systemd service

SERVICE_NAME="chrome-devtools-mcp"
INSTALL_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

echo "Uninstalling Chrome DevTools MCP Server systemd service..."

# Stop service
sudo systemctl stop "$SERVICE_NAME.service" 2>/dev/null
echo "✓ Service stopped"

# Disable service
sudo systemctl disable "$SERVICE_NAME.service" 2>/dev/null
echo "✓ Service disabled"

# Remove service file
sudo rm -f "$INSTALL_PATH"
echo "✓ Service file removed"

# Reload systemd
sudo systemctl daemon-reload
echo "✓ Systemd reloaded"

echo ""
echo "✓ Uninstallation complete!"
echo ""
echo "Note: The server can still be run manually with ./start-server.sh"
