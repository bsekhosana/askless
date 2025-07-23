#!/bin/bash

# Session Messenger Server Startup Script

echo "🚀 Starting Session Messenger Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

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

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create it with proper configuration."
    echo "Required variables: PORT, NODE_ENV, SSL_KEY_PATH, SSL_CERT_PATH"
    exit 1
fi

# Load environment variables
source .env

# Check if server is already running
if pm2 list | grep -q "askless-session-messenger.*online"; then
    echo "⚠️ Server is already running. Use restart-server.sh to restart."
    pm2 show askless-session-messenger
    exit 0
fi

# Start the server with PM2
echo "🔌 Starting WebSocket server with PM2..."
pm2 start server.js --name askless-session-messenger

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Check server health
echo "🔍 Checking server health..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" http://localhost:${PORT:-5000}/health)
HTTP_CODE=${HEALTH_RESPONSE: -3}
RESPONSE_BODY=${HEALTH_RESPONSE%???}

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Server started successfully!"
    echo "📊 Health check: http://localhost:${PORT:-5000}/health"
    echo "📈 Stats: http://localhost:${PORT:-5000}/stats"
    echo "📋 Logs: http://localhost:${PORT:-5000}/logs"
    echo "🖥️ Live Monitor: http://localhost:${PORT:-5000}/live-monitor"
    echo "🧪 Test Client: http://localhost:${PORT:-5000}/test-client.html"
    echo ""
    echo "🌐 External URLs:"
    echo "   - Health: https://askless.strapblaque.com/health"
    echo "   - Live Monitor: https://askless.strapblaque.com/live-monitor"
    echo ""
    echo "📋 PM2 Status:"
    pm2 show askless-session-messenger
else
    echo "❌ Server health check failed (HTTP $HTTP_CODE)"
    echo "Response: $RESPONSE_BODY"
    echo ""
    echo "📋 PM2 Logs:"
    pm2 logs askless-session-messenger --lines 10 --nostream
    exit 1
fi 