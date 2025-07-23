# GitHub Actions Auto-Sync Setup Guide

This guide will help you set up automatic syncing between your local repository and the server using GitHub Actions.

## Overview

The auto-sync system includes:
- **Automatic deployment** when changes are pushed to GitHub
- **Bidirectional syncing** between local and server
- **Health monitoring** and automatic restarts
- **Manual sync controls** via GitHub Actions UI

## Prerequisites

1. **GitHub Repository**: Your code must be in a GitHub repository
2. **SSH Access**: SSH key-based access to your server
3. **Server Configuration**: PM2 and Node.js installed on server

## Step 1: Generate SSH Key Pair

If you don't have an SSH key pair, generate one:

```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "github-actions@your-domain.com"

# This creates:
# - ~/.ssh/id_rsa (private key)
# - ~/.ssh/id_rsa.pub (public key)
```

## Step 2: Add Public Key to Server

Add the public key to your server's authorized keys:

```bash
# Copy public key to server
ssh-copy-id -i ~/.ssh/id_rsa.pub laravel@41.76.111.100 -p 1337

# Or manually add to ~/.ssh/authorized_keys on server
cat ~/.ssh/id_rsa.pub | ssh -p 1337 laravel@41.76.111.100 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

## Step 3: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

### Required Secrets

1. **SSH_PRIVATE_KEY**
   - Name: `SSH_PRIVATE_KEY`
   - Value: Copy the entire content of your private key file (`~/.ssh/id_rsa`)
   - Example:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
   ... (rest of private key)
   -----END OPENSSH PRIVATE KEY-----
   ```

2. **ROOT_PASS** (if needed for sudo operations)
   - Name: `ROOT_PASS`
   - Value: Your server root password (if required)

### Optional Secrets

3. **SLACK_WEBHOOK_URL** (for notifications)
   - Name: `SLACK_WEBHOOK_URL`
   - Value: Slack webhook URL for deployment notifications

4. **DISCORD_WEBHOOK_URL** (for notifications)
   - Name: `DISCORD_WEBHOOK_URL`
   - Value: Discord webhook URL for deployment notifications

## Step 4: Configure Repository Settings

### Enable GitHub Actions

1. Go to your repository → Settings → Actions → General
2. Ensure "Allow all actions and reusable workflows" is selected
3. Enable "Read and write permissions" for Actions

### Configure Branch Protection (Recommended)

1. Go to Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - Require pull request reviews
   - Require status checks to pass
   - Include administrators

## Step 5: Test the Setup

### Test Local Sync Script

```bash
# Navigate to session-messenger-server directory
cd session-messenger-server

# Test the sync script
./sync-local.sh status

# Test pushing changes
./sync-local.sh push

# Test pulling changes
./sync-local.sh pull
```

### Test GitHub Actions

1. Make a small change to any file in `session-messenger-server/`
2. Commit and push to GitHub
3. Go to Actions tab to monitor the deployment

## Step 6: Manual Actions

You can trigger manual actions from the GitHub Actions tab:

1. Go to Actions → Auto Sync - Session Messenger Server
2. Click "Run workflow"
3. Choose sync direction:
   - **deploy**: Deploy current code to server
   - **pull**: Pull server changes to repository
   - **both**: Perform both operations

## Workflow Features

### Automatic Triggers

- **Push to main/master**: Automatically deploys to server
- **Pull Request**: Runs tests and checks
- **Scheduled (every 5 minutes)**: Monitors server health and syncs changes
- **Manual**: Trigger via GitHub Actions UI

### Jobs

1. **deploy-to-server**: Deploys code to server
2. **pull-from-server**: Pulls server changes to repository
3. **monitor-server**: Checks server health and status
4. **notify-status**: Sends notifications about deployment status

### Health Monitoring

The workflow automatically:
- Checks server health every 5 minutes
- Restarts failed processes
- Monitors disk and memory usage
- Sends notifications on failures

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**
   - Verify SSH key is correctly added to GitHub secrets
   - Check server SSH configuration
   - Test SSH connection manually

2. **Permission Denied**
   - Ensure server user has proper permissions
   - Check file ownership on server
   - Verify PM2 installation

3. **Deployment Fails**
   - Check server logs: `pm2 logs askless-session-messenger`
   - Verify environment variables
   - Check Node.js version compatibility

### Debug Commands

```bash
# Check server status
./sync-local.sh status

# View server logs
./sync-local.sh logs

# Check server health
./sync-local.sh health

# Restart server
./sync-local.sh restart
```

### GitHub Actions Debug

1. Go to Actions tab
2. Click on failed workflow
3. Check individual job logs
4. Look for error messages in red

## Security Considerations

1. **SSH Keys**: Never commit private keys to repository
2. **Secrets**: Use GitHub secrets for sensitive data
3. **Permissions**: Use least privilege principle
4. **Monitoring**: Regularly review access logs

## Monitoring and Alerts

### Health Check Endpoints

- **Health**: `https://askless.strapblaque.com/health`
- **Statistics**: `https://askless.strapblaque.com/stats`
- **Logs**: `https://askless.strapblaque.com/logs`

### Log Locations

- **PM2 Logs**: `~/.pm2/logs/`
- **Application Logs**: `logs/session-messenger.log`
- **Nginx Logs**: `/var/log/nginx/`

## Maintenance

### Regular Tasks

1. **Update Dependencies**: Monthly security updates
2. **Review Logs**: Weekly log analysis
3. **Backup Configuration**: Before major changes
4. **Test Restore**: Quarterly disaster recovery test

### Performance Monitoring

- Monitor memory usage
- Check disk space
- Review response times
- Analyze error rates

## Support

For issues or questions:
1. Check this documentation
2. Review GitHub Actions logs
3. Test with local sync script
4. Check server logs and status

---

**Note**: This setup provides a robust auto-sync system that keeps your local development and server deployment in sync automatically. The system is designed to be reliable and includes monitoring to ensure your server stays healthy. 