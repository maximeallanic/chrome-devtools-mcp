#!/bin/bash
# Install Chrome DevTools MCP Server as systemd service

SERVICE_FILE="chrome-devtools-mcp.service"
INSTALL_PATH="/etc/systemd/system/$SERVICE_FILE"

echo "Installing Chrome DevTools MCP Server as systemd service..."

# Stop any running instances
./stop-server.sh 2>/dev/null || true

# Copy service file
sudo cp "$SERVICE_FILE" "$INSTALL_PATH"
echo "✓ Service file copied to $INSTALL_PATH"

# Reload systemd
sudo systemctl daemon-reload
echo "✓ Systemd reloaded"

# Enable service (start on boot)
sudo systemctl enable chrome-devtools-mcp.service
echo "✓ Service enabled (will start on boot)"

# Start service now
sudo systemctl start chrome-devtools-mcp.service
echo "✓ Service started"

# Check status
echo ""
echo "Service status:"
sudo systemctl status chrome-devtools-mcp.service --no-pager

echo ""
echo "✓ Installation complete!"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status chrome-devtools-mcp    # Check status"
echo "  sudo systemctl stop chrome-devtools-mcp      # Stop service"
echo "  sudo systemctl start chrome-devtools-mcp     # Start service"
echo "  sudo systemctl restart chrome-devtools-mcp   # Restart service"
echo "  sudo journalctl -u chrome-devtools-mcp -f    # View logs"
