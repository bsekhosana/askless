# Sync Commands Quick Reference

## Local Sync Script Commands

```bash
# Navigate to session-messenger-server directory first
cd session-messenger-server

# Basic commands
./sync-local.sh push     # Push local changes to server and deploy
./sync-local.sh pull     # Pull changes from server to local
./sync-local.sh status   # Check status of local and server
./sync-local.sh deploy   # Deploy current local code to server
./sync-local.sh logs     # Show server logs
./sync-local.sh restart  # Restart server
./sync-local.sh health   # Check server health
./sync-local.sh help     # Show help message
```

## GitHub Actions Manual Triggers

1. Go to GitHub → Actions → "Auto Sync - Session Messenger Server"
2. Click "Run workflow"
3. Choose sync direction:
   - **deploy**: Deploy current code to server
   - **pull**: Pull server changes to repository
   - **both**: Perform both operations

## Automatic Triggers

- **Push to main/master**: Auto-deploys to server
- **Every 5 minutes**: Monitors health and syncs server changes
- **Pull Request**: Runs tests and checks

## Server Management Commands

```bash
# Direct server commands (via SSH)
ssh -p 1337 laravel@41.76.111.100

# PM2 Commands
pm2 status                           # Check all processes
pm2 show askless-session-messenger   # Show specific process
pm2 logs askless-session-messenger   # View logs
pm2 restart askless-session-messenger # Restart process
pm2 stop askless-session-messenger   # Stop process
pm2 start askless-session-messenger  # Start process

# Health Checks
curl http://localhost:5000/health    # Local health check
curl https://askless.strapblaque.com/health # External health check

# File Operations
cd /var/www/askless                  # Navigate to server directory
git status                          # Check git status
git log --oneline -5                # Recent commits
```

## Troubleshooting Commands

```bash
# Check server status
./sync-local.sh status

# View recent logs
./sync-local.sh logs

# Check server health
./sync-local.sh health

# Restart if needed
./sync-local.sh restart

# Manual deployment
./sync-local.sh deploy
```

## Common Workflows

### Daily Development
```bash
# 1. Check status
./sync-local.sh status

# 2. Pull any server changes
./sync-local.sh pull

# 3. Make your changes...

# 4. Push and deploy
./sync-local.sh push
```

### Emergency Server Fix
```bash
# 1. SSH to server
ssh -p 1337 laravel@41.76.111.100

# 2. Make quick fix
cd /var/www/askless
# Edit files...

# 3. Commit and push from server
git add .
git commit -m "Emergency fix: $(date)"
git push origin main

# 4. Restart if needed
pm2 restart askless-session-messenger
```

### Monitor Server Health
```bash
# Check health
./sync-local.sh health

# View logs
./sync-local.sh logs

# Check GitHub Actions status
# Go to: https://github.com/your-repo/actions
```

## Environment Variables

The sync system uses these environment variables:

```bash
SERVER_USER=laravel
SERVER_IP=41.76.111.100
SERVER_PORT=1337
SOCKET_PORT=5000
SERVER_PATH=/var/www/askless
GIT_REPO=git@github.com:bsekhosana/askless.git
PM2_PROCESS_NAME=askless-session-messenger
```

## Health Check Endpoints

- **Health**: `https://askless.strapblaque.com/health`
- **Statistics**: `https://askless.strapblaque.com/stats`
- **Logs**: `https://askless.strapblaque.com/logs`
- **Test Client**: `https://askless.strapblaque.com/test-client.html`

## Quick Status Check

```bash
# One-liner to check everything
echo "=== LOCAL STATUS ===" && git status --short && echo "=== SERVER STATUS ===" && ssh -p 1337 laravel@41.76.111.100 "cd /var/www/askless && git status --short && echo '=== PM2 STATUS ===' && pm2 show askless-session-messenger --no-daemon"
```

## Emergency Contacts

- **Server IP**: 41.76.111.100:1337
- **Domain**: askless.strapblaque.com
- **GitHub Actions**: Check Actions tab in repository
- **PM2 Process**: askless-session-messenger 