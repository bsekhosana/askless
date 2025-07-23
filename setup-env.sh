#!/bin/bash

# Session Messenger Server Environment Setup
# Sets up the environment for the Session Messenger server

set -e

echo "🔧 Setting up Session Messenger Server Environment"
echo "=================================================="

# Configuration
SERVER_USER=laravel
SERVER_IP=41.76.111.100
SERVER_PORT=1337
SOCKET_PORT=5000
SERVER_PATH=/var/www/askless
DOMAIN=askless.strapblaque.com

echo "📋 Configuration:"
echo "   Server: $SERVER_USER@$SERVER_IP:$SERVER_PORT"
echo "   Path: $SERVER_PATH"
echo "   Socket Port: $SOCKET_PORT"
echo "   Domain: $DOMAIN"
echo ""

# Setup environment on server
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << EOF
    set -e
    
    echo "📁 Creating server directory..."
    mkdir -p $SERVER_PATH
    
    echo "📂 Navigating to server directory..."
    cd $SERVER_PATH
    
    echo "🔧 Creating environment file..."
    cat > .env << ENVEOF
# Session Messenger Server Environment
NODE_ENV=production
PORT=$SOCKET_PORT
SOCKET_PORT=$SOCKET_PORT

# Database Configuration
DB_HOST=localhost
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=sechat
DB_PORT=3306

# SSL Configuration
SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem

# Logging
LOG_LEVEL=info
LOG_FILE=logs/session-messenger.log

# Session Messenger Configuration
HEARTBEAT_INTERVAL=30000
INVITATION_EXPIRY=86400000
MAX_CONNECTIONS=10000
ENVEOF
    
    echo "📁 Creating logs directory..."
    mkdir -p logs
    
    echo "🔧 Setting up Node.js environment..."
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        echo "📦 Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo "📦 Installing PM2..."
        sudo npm install -g pm2
    fi
    
    echo "🔧 Setting up SSL certificates..."
    # Check if SSL certificates exist
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]; then
        echo "⚠️ SSL certificates not found for $DOMAIN"
        echo "   Please run: sudo certbot certonly --standalone -d $DOMAIN"
    else
        echo "✅ SSL certificates found"
    fi
    
    echo "🔧 Setting up nginx configuration..."
    # Create nginx configuration
    sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:$SOCKET_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:$SOCKET_PORT/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Statistics
    location /stats {
        proxy_pass http://localhost:$SOCKET_PORT/stats;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Socket logs
    location /logs {
        proxy_pass http://localhost:$SOCKET_PORT/logs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Test client
    location /test-client.html {
        proxy_pass http://localhost:$SOCKET_PORT/test-client.html;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # All other requests
    location / {
        proxy_pass http://localhost:$SOCKET_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    
    echo "🔗 Enabling nginx site..."
    sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    
    echo "🔧 Testing nginx configuration..."
    sudo nginx -t
    
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    
    echo "✅ Environment setup completed!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Deploy the application: ./deploy.sh"
    echo "   2. Test the server: curl https://$DOMAIN/health"
    echo "   3. Monitor logs: pm2 logs askless-session-messenger"
EOF

echo ""
echo "🎉 Environment setup completed!"
echo ""
echo "📱 Server endpoints will be available at:"
echo "   - Health: https://$DOMAIN/health"
echo "   - Stats: https://$DOMAIN/stats"
echo "   - Logs: https://$DOMAIN/logs"
echo "   - Test Client: https://$DOMAIN/test-client.html"
echo "   - WebSocket: wss://$DOMAIN/ws" 