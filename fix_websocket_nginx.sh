#!/bin/bash

echo "🔧 Fixing WebSocket nginx configuration..."

# Backup current nginx config
echo "📋 Backing up current nginx configuration..."
cp /etc/nginx/sites-available/askless.strapblaque.com /etc/nginx/sites-available/askless.strapblaque.com.backup.$(date +%Y%m%d_%H%M%S)

# Create new nginx configuration with proper WebSocket support
echo "📝 Creating new nginx configuration..."
cat > /etc/nginx/sites-available/askless.strapblaque.com << 'EOF'
server {
    server_name askless.strapblaque.com;
    
    root /var/www/askless;
    index index.php index.html index.htm;
    
    # Session Messenger WebSocket proxy
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    # Session Messenger Health check
    location /health {
        proxy_pass http://localhost:5000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Session Messenger Statistics
    location /stats {
        proxy_pass http://localhost:5000/stats;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Session Messenger Socket logs
    location /logs {
        proxy_pass http://localhost:5000/logs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Session Messenger Test client
    location /test-client.html {
        proxy_pass http://localhost:5000/test-client.html;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Session Messenger Live Monitor
    location /live-monitor {
        proxy_pass http://localhost:5000/live-monitor;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Original PHP handling
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/askless.strapblaque.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/askless.strapblaque.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = askless.strapblaque.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name askless.strapblaque.com;
    return 404; # managed by Certbot
}
EOF

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    
    # Restart Session Messenger server
    echo "🔄 Restarting Session Messenger server..."
    pm2 restart askless-session-messenger
    
    # Check if Session Messenger is running
    echo "📊 Checking Session Messenger status..."
    pm2 status askless-session-messenger
    
    echo "✅ WebSocket configuration updated successfully!"
    echo "🌐 Test the connection at: https://askless.strapblaque.com/test-client.html"
    
else
    echo "❌ nginx configuration test failed"
    echo "📋 Restoring backup..."
    cp /etc/nginx/sites-available/askless.strapblaque.com.backup.* /etc/nginx/sites-available/askless.strapblaque.com
    exit 1
fi 