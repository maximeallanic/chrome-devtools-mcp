#!/bin/bash
# Start Chrome DevTools MCP Server

cd "$(dirname "$0")"
LOG_FILE="/tmp/mcp-server.log"
PID_FILE="/tmp/mcp-server.pid"

# Kill existing server if running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Stopping existing server (PID: $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null
        sleep 1
    fi
fi

# Start new server
echo "Starting Chrome DevTools MCP Server..."
nohup node mcp-server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"

sleep 2

# Check if server started successfully
if ps -p "$NEW_PID" > /dev/null 2>&1; then
    echo "✓ Server started successfully (PID: $NEW_PID)"
    echo "✓ Log file: $LOG_FILE"
    echo ""
    tail -5 "$LOG_FILE"
else
    echo "✗ Server failed to start"
    echo "Check logs: $LOG_FILE"
    exit 1
fi
