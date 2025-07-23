#!/bin/bash

# Local Sync Script for Session Messenger Server
# This script helps sync changes between local and server

set -e

# Configuration
SERVER_USER=laravel
SERVER_IP=41.76.111.100
SERVER_PORT=1337
SERVER_PATH=/var/www/askless
GIT_REPO=git@github.com:bsekhosana/askless.git
PM2_PROCESS_NAME=askless-session-messenger

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  push     - Push local changes to server and deploy"
    echo "  pull     - Pull changes from server to local"
    echo "  status   - Check status of local and server"
    echo "  deploy   - Deploy current local code to server"
    echo "  logs     - Show server logs"
    echo "  restart  - Restart server"
    echo "  health   - Check server health"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 push     # Push and deploy local changes"
    echo "  $0 pull     # Pull server changes to local"
    echo "  $0 status   # Check both local and server status"
}

# Function to check if we're in the right directory
check_directory() {
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the session-messenger-server directory."
        exit 1
    fi
}

# Function to check git status
check_git_status() {
    if [ -n "$(git status --porcelain)" ]; then
        print_warning "You have uncommitted changes:"
        git status --short
        read -p "Do you want to commit these changes? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add .
            git commit -m "Local changes: $(date)"
            print_success "Changes committed"
        fi
    fi
}

# Function to push changes to server
push_to_server() {
    print_status "Pushing changes to server..."
    
    # Check git status and commit if needed
    check_git_status
    
    # Push to git repository
    print_status "Pushing to git repository..."
    git push origin main
    
    # Deploy to server
    print_status "Deploying to server..."
    ./deploy.sh
    
    print_success "Push and deploy completed!"
}

# Function to pull changes from server
pull_from_server() {
    print_status "Pulling changes from server..."
    
    # Check for server changes
    print_status "Checking for server changes..."
    SERVER_STATUS=$(ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && git status --porcelain")
    
    if [ -n "$SERVER_STATUS" ]; then
        print_status "Server has changes, pulling them..."
        
        # Commit server changes and push to repository
        ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << EOF
            cd $SERVER_PATH
            
            # Commit any uncommitted changes
            if [ -n "\$(git status --porcelain)" ]; then
                echo "Committing server changes..."
                git add .
                git commit -m "Server changes: \$(date)"
            fi
            
            # Push to remote repository
            echo "Pushing server changes to repository..."
            git push origin main
EOF
        
        # Pull changes to local
        print_status "Pulling changes to local repository..."
        git pull origin main
        
        print_success "Pull completed!"
    else
        print_success "No changes detected on server"
    fi
}

# Function to check status
check_status() {
    print_status "Checking local status..."
    
    # Local git status
    echo "Local Git Status:"
    git status --short
    
    # Local branch
    echo "Current branch: $(git branch --show-current)"
    
    # Last commit
    echo "Last commit: $(git log -1 --oneline)"
    
    echo ""
    print_status "Checking server status..."
    
    # Server git status
    echo "Server Git Status:"
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && git status --short"
    
    # Server branch
    echo "Server branch: $(ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && git branch --show-current")"
    
    # Server last commit
    echo "Server last commit: $(ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && git log -1 --oneline")"
    
    # PM2 status
    echo ""
    echo "PM2 Status:"
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "pm2 show $PM2_PROCESS_NAME --no-daemon" || echo "Process not found"
}

# Function to deploy
deploy() {
    print_status "Deploying to server..."
    ./deploy.sh
    print_success "Deploy completed!"
}

# Function to show logs
show_logs() {
    print_status "Showing server logs..."
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "pm2 logs $PM2_PROCESS_NAME --lines 50"
}

# Function to restart server
restart_server() {
    print_status "Restarting server..."
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "pm2 restart $PM2_PROCESS_NAME"
    print_success "Server restarted!"
}

# Function to check health
check_health() {
    print_status "Checking server health..."
    
    # Local health check
    echo "Local health check:"
    LOCAL_HEALTH=$(ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "curl -s -w '%{http_code}' http://localhost:5000/health")
    LOCAL_HTTP_CODE=${LOCAL_HEALTH: -3}
    LOCAL_RESPONSE=${LOCAL_HEALTH%???}
    
    if [ "$LOCAL_HTTP_CODE" = "200" ]; then
        print_success "Local server is healthy (HTTP $LOCAL_HTTP_CODE)"
        echo "Response: $LOCAL_RESPONSE"
    else
        print_error "Local health check failed (HTTP $LOCAL_HTTP_CODE)"
        echo "Response: $LOCAL_RESPONSE"
    fi
    
    echo ""
    echo "External health check:"
    EXTERNAL_HEALTH=$(curl -s -w "%{http_code}" https://askless.strapblaque.com/health)
    EXTERNAL_HTTP_CODE=${EXTERNAL_HEALTH: -3}
    
    if [ "$EXTERNAL_HTTP_CODE" = "200" ]; then
        print_success "External access working (HTTP $EXTERNAL_HTTP_CODE)"
    else
        print_error "External access failed (HTTP $EXTERNAL_HTTP_CODE)"
    fi
}

# Main script logic
main() {
    # Check if we're in the right directory
    check_directory
    
    # Parse command
    case "${1:-help}" in
        push)
            push_to_server
            ;;
        pull)
            pull_from_server
            ;;
        status)
            check_status
            ;;
        deploy)
            deploy
            ;;
        logs)
            show_logs
            ;;
        restart)
            restart_server
            ;;
        health)
            check_health
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@" 