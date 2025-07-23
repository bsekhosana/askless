#!/bin/bash

# Session Messenger Server Stop Script

echo "🛑 Stopping Session Messenger Server..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Please install PM2 first: npm install -g pm2"
    exit 1
fi

# Check if server is running
if ! pm2 list | grep -q "askless-session-messenger"; then
    echo "⚠️ Server is not running."
    exit 0
fi

# Get server status before stopping
echo "📋 Current server status:"
pm2 show askless-session-messenger

# Stop the server
echo "🛑 Stopping server..."
pm2 stop askless-session-messenger

# Wait a moment
sleep 2

# Check if server stopped successfully
if pm2 list | grep -q "askless-session-messenger.*stopped"; then
    echo "✅ Server stopped successfully!"
    echo ""
    echo "📋 Final PM2 Status:"
    pm2 show askless-session-messenger
else
    echo "❌ Failed to stop server."
    echo ""
    echo "📋 PM2 Status:"
    pm2 list
    exit 1
fi

echo ""
echo "💡 To start the server again, run: ./start.sh"
echo "💡 To restart the server, run: ./restart-server.sh" 