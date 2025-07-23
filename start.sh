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

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
PORT=8080
NODE_ENV=development
EOF
fi

# Start the server
echo "🔌 Starting WebSocket server on port 8080..."
echo "📊 Health check: http://localhost:8080/health"
echo "📈 Stats: http://localhost:8080/stats"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start 