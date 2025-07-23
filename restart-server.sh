#!/bin/bash

# Session Messenger Server Restart Script
# Restarts the PM2 process and checks health

set -e

# Configuration
SERVER_USER=laravel
SERVER_IP=41.76.111.100
SERVER_PORT=1337
SOCKET_PORT=5000
SERVER_PATH=/var/www/askless
PM2_PROCESS_NAME=askless-session-messenger
DOMAIN=askless.strapblaque.com

echo "🔄 Session Messenger Server Restart"
echo "==================================="
echo "Server: $SERVER_USER@$SERVER_IP:$SERVER_PORT"
echo "PM2 Process: $PM2_PROCESS_NAME"
echo "Socket Port: $SOCKET_PORT"
echo ""

# Restart server
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << EOF
    set -e
    
    echo "📂 Navigating to server directory..."
    cd $SERVER_PATH
    
    echo "🔄 Restarting PM2 process..."
    pm2 restart $PM2_PROCESS_NAME
    
    echo "⏳ Waiting for server to start..."
    sleep 5
    
    echo "📊 PM2 Status:"
    pm2 show $PM2_PROCESS_NAME
    
    echo ""
    echo "🔍 Checking server health..."
    HEALTH_RESPONSE=\$(curl -s -w "%{http_code}" http://localhost:$SOCKET_PORT/health)
    HTTP_CODE=\${HEALTH_RESPONSE: -3}
    RESPONSE_BODY=\${HEALTH_RESPONSE%???}
    
    if [ "\$HTTP_CODE" = "200" ]; then
        echo "✅ Server is healthy (HTTP \$HTTP_CODE)"
        echo "Response: \$RESPONSE_BODY"
    else
        echo "❌ Server health check failed (HTTP \$HTTP_CODE)"
        echo "Response: \$RESPONSE_BODY"
        echo ""
        echo "📋 Recent logs:"
        pm2 logs $PM2_PROCESS_NAME --lines 10 --nostream
        exit 1
    fi
    
    echo ""
    echo "📋 Recent logs:"
    pm2 logs $PM2_PROCESS_NAME --lines 5 --nostream
    
    echo ""
    echo "🌐 Testing external access..."
    EXTERNAL_HEALTH=\$(curl -s -w "%{http_code}" https://$DOMAIN/health)
    EXTERNAL_HTTP_CODE=\${EXTERNAL_HEALTH: -3}
    
    if [ "\$EXTERNAL_HTTP_CODE" = "200" ]; then
        echo "✅ External access working (HTTP \$EXTERNAL_HTTP_CODE)"
    else
        echo "⚠️ External access failed (HTTP \$EXTERNAL_HTTP_CODE)"
    fi
EOF

echo ""
echo "🎉 Server restart completed!"
echo ""
echo "📱 Server endpoints:"
echo "   - Health: https://$DOMAIN/health"
echo "   - Stats: https://$DOMAIN/stats"
echo "   - Logs: https://$DOMAIN/logs"
echo "   - Test Client: https://$DOMAIN/test-client.html"
echo ""
echo "🔧 Management commands:"
echo "   - View logs: ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP 'pm2 logs $PM2_PROCESS_NAME'"
echo "   - Status: ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP 'pm2 show $PM2_PROCESS_NAME'"
echo "   - Stop: ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP 'pm2 stop $PM2_PROCESS_NAME'" 