#!/bin/bash

# Session Messenger Server Local Restart Script

echo "🔄 Restarting Session Messenger Server..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Please install PM2 first: npm install -g pm2"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the session-messenger-server directory."
    exit 1
fi

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "⚠️ .env file not found, using default port 5000"
fi

PORT=${PORT:-5000}

# Check if server is running
if pm2 list | grep -q "askless-session-messenger"; then
    echo "📋 Current server status:"
    pm2 show askless-session-messenger
    
    echo "🔄 Restarting PM2 process..."
    pm2 restart askless-session-messenger
else
    echo "⚠️ Server is not running. Starting it now..."
    pm2 start server.js --name askless-session-messenger
fi

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Check server health
echo "🔍 Checking server health..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" http://localhost:$PORT/health)
HTTP_CODE=${HEALTH_RESPONSE: -3}
RESPONSE_BODY=${HEALTH_RESPONSE%???}

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Server is healthy (HTTP $HTTP_CODE)"
    echo "Response: $RESPONSE_BODY"
else
    echo "❌ Server health check failed (HTTP $HTTP_CODE)"
    echo "Response: $RESPONSE_BODY"
    echo ""
    echo "📋 Recent logs:"
    pm2 logs askless-session-messenger --lines 10 --nostream
    exit 1
fi

# Test external access if possible
echo ""
echo "🌐 Testing external access..."
EXTERNAL_HEALTH=$(curl -s -w "%{http_code}" https://askless.strapblaque.com/health 2>/dev/null || echo "000")
EXTERNAL_HTTP_CODE=${EXTERNAL_HEALTH: -3}

if [ "$EXTERNAL_HTTP_CODE" = "200" ]; then
    echo "✅ External access working (HTTP $EXTERNAL_HTTP_CODE)"
else
    echo "⚠️ External access failed (HTTP $EXTERNAL_HTTP_CODE)"
fi

echo ""
echo "📋 Recent logs:"
pm2 logs askless-session-messenger --lines 5 --nostream

echo ""
echo "🎉 Server restart completed!"
echo ""
echo "📱 Server endpoints:"
echo "   - Health: http://localhost:$PORT/health"
echo "   - Stats: http://localhost:$PORT/stats"
echo "   - Logs: http://localhost:$PORT/logs"
echo "   - Live Monitor: http://localhost:$PORT/live-monitor"
echo "   - Test Client: http://localhost:$PORT/test-client.html"
echo ""
echo "🌐 External URLs:"
echo "   - Health: https://askless.strapblaque.com/health"
echo "   - Live Monitor: https://askless.strapblaque.com/live-monitor"
echo ""
echo "📋 PM2 Status:"
pm2 show askless-session-messenger 