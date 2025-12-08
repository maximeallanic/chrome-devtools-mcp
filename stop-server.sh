#!/bin/bash
# Stop Chrome DevTools MCP Server

PID_FILE="/tmp/mcp-server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Stopping server (PID: $PID)..."
        kill "$PID"
        sleep 1
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Force killing server..."
            kill -9 "$PID"
        fi
        rm "$PID_FILE"
        echo "✓ Server stopped"
    else
        echo "Server not running (stale PID file)"
        rm "$PID_FILE"
    fi
else
    echo "Server not running (no PID file)"
fi

# Cleanup any remaining processes
pkill -f "node.*mcp-server.js" && echo "✓ Cleaned up stray processes"
