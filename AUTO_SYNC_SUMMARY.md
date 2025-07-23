# Auto-Sync System Summary

## What We've Built

A comprehensive auto-sync system for the Session Messenger Server that provides **bidirectional synchronization** between your local development environment and the production server.

## System Components

### 1. GitHub Actions Workflow (`.github/workflows/auto-sync.yml`)

**Features:**
- **Automatic deployment** when code is pushed to GitHub
- **Scheduled monitoring** every 5 minutes
- **Health checks** and automatic restarts
- **Manual trigger options** via GitHub UI
- **Bidirectional syncing** between local and server

**Triggers:**
- Push to main/master branch
- Pull requests (for testing)
- Scheduled runs (every 5 minutes)
- Manual workflow dispatch

**Jobs:**
- `deploy-to-server`: Deploys code to server
- `pull-from-server`: Pulls server changes to repository
- `monitor-server`: Health monitoring and maintenance
- `notify-status`: Status notifications

### 2. Local Sync Script (`sync-local.sh`)

**Commands:**
```bash
./sync-local.sh push     # Push and deploy
./sync-local.sh pull     # Pull from server
./sync-local.sh status   # Check status
./sync-local.sh deploy   # Deploy only
./sync-local.sh logs     # View logs
./sync-local.sh restart  # Restart server
./sync-local.sh health   # Health check
```

**Features:**
- Colored output for better readability
- Interactive prompts for uncommitted changes
- Comprehensive error handling
- Server health monitoring
- Git status checking

### 3. Documentation

- **`GITHUB_ACTIONS_SETUP.md`**: Complete setup guide
- **`SYNC_COMMANDS.md`**: Quick reference commands
- **`AUTO_SYNC_SUMMARY.md`**: This summary document

## How It Works

### Local → Server Sync
1. Developer makes changes locally
2. Commits and pushes to GitHub
3. GitHub Actions automatically:
   - Runs tests
   - Deploys to server
   - Performs health checks
   - Sends notifications

### Server → Local Sync
1. Every 5 minutes, GitHub Actions checks server for changes
2. If changes detected:
   - Commits server changes
   - Pushes to repository
   - Updates local repository
3. Manual pull also available

### Health Monitoring
- Checks server status every 5 minutes
- Restarts failed processes automatically
- Monitors disk and memory usage
- Sends alerts on failures

## Setup Requirements

### GitHub Secrets Required
- `SSH_PRIVATE_KEY`: SSH private key for server access
- `ROOT_PASS`: Server root password (if needed)

### Server Requirements
- SSH access with key authentication
- PM2 for process management
- Node.js and npm
- Git repository access

## Benefits

### For Development
- **Zero-deployment friction**: Push code, it's live
- **Automatic testing**: Tests run before deployment
- **Health monitoring**: Know when server is down
- **Easy rollbacks**: Git-based version control

### For Operations
- **Automatic restarts**: Failed processes restart themselves
- **Health monitoring**: Proactive issue detection
- **Bidirectional sync**: Server changes sync back to repo
- **Comprehensive logging**: Full audit trail

### For Team Collaboration
- **Consistent deployments**: Same process every time
- **Visibility**: GitHub Actions provides deployment history
- **Manual controls**: Can trigger actions manually
- **Status notifications**: Know when deployments succeed/fail

## Usage Scenarios

### Daily Development Workflow
```bash
# 1. Check current status
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

# 3. Commit and push
git add . && git commit -m "Emergency fix" && git push

# 4. Restart if needed
pm2 restart askless-session-messenger
```

### Monitoring and Maintenance
- Check GitHub Actions tab for deployment status
- Use `./sync-local.sh health` for quick health check
- Monitor logs with `./sync-local.sh logs`
- Set up notifications for failures

## Security Features

- **SSH key authentication**: No password-based access
- **GitHub secrets**: Sensitive data stored securely
- **Least privilege**: Minimal required permissions
- **Audit trail**: All actions logged

## Monitoring Endpoints

- **Health**: `https://askless.strapblaque.com/health`
- **Statistics**: `https://askless.strapblaque.com/stats`
- **Logs**: `https://askless.strapblaque.com/logs`
- **Test Client**: `https://askless.strapblaque.com/test-client.html`

## Troubleshooting

### Common Issues
1. **SSH connection fails**: Check SSH key in GitHub secrets
2. **Deployment fails**: Check server logs and PM2 status
3. **Health check fails**: Verify server is running and accessible

### Debug Commands
```bash
./sync-local.sh status    # Check overall status
./sync-local.sh health    # Check server health
./sync-local.sh logs      # View server logs
./sync-local.sh restart   # Restart server
```

## Next Steps

1. **Set up GitHub secrets** (SSH_PRIVATE_KEY, ROOT_PASS)
2. **Test the system** with a small change
3. **Configure notifications** (optional)
4. **Monitor first few deployments**
5. **Set up team access** if needed

## Support

- Check `GITHUB_ACTIONS_SETUP.md` for detailed setup instructions
- Use `SYNC_COMMANDS.md` for quick command reference
- Monitor GitHub Actions logs for detailed error information
- Use local sync script for immediate troubleshooting

---

**The auto-sync system is now ready to use!** It will automatically keep your local development and server deployment in sync, with comprehensive monitoring and health checks to ensure reliability. 