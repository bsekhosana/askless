const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create Express app
const app = express();

// Configure helmet with CSP that allows inline scripts for live-monitor
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// In-memory storage (in production, use Redis or database)
const clients = new Map(); // sessionId -> WebSocket
const invitations = new Map(); // invitationId -> invitation
const messages = new Map(); // conversationId -> messages
const typingUsers = new Map(); // sessionId -> Set of typing indicators

// Logging
const logFile = process.env.LOG_FILE || 'logs/session-messenger.log';
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}`;
    console.log(logEntry);
    
    // Write to file
    fs.appendFileSync(logFile, logEntry + '\n');
}

// Heartbeat interval
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000; // 30 seconds
const INVITATION_EXPIRY = parseInt(process.env.INVITATION_EXPIRY) || 24 * 60 * 60 * 1000; // 24 hours

// Utility functions
function generateConversationId(sessionId1, sessionId2) {
  const sorted = [sessionId1, sessionId2].sort();
  return crypto.createHash('sha256').update(sorted.join('')).digest('hex');
}

function broadcastToUser(sessionId, message) {
  const client = clients.get(sessionId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function broadcastToUsers(sessionIds, message) {
  sessionIds.forEach(sessionId => broadcastToUser(sessionId, message));
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  let currentSessionId = null;
  let heartbeatTimer = null;

  log('New WebSocket connection', 'CONNECTION');

  // Set up heartbeat
  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  // Clean up heartbeat
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // Message handler
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      log(`Received message: ${message.type}`, 'MESSAGE');

      switch (message.type) {
        case 'auth':
          handleAuth(ws, message.data);
          break;
        case 'invitation_send':
          handleInvitationSend(ws, message.data);
          break;
        case 'invitation_accept':
          handleInvitationAccept(ws, message.data);
          break;
        case 'invitation_decline':
          handleInvitationDecline(ws, message.data);
          break;
        case 'message_send':
          handleMessageSend(ws, message.data);
          break;
        case 'typing_indicator':
          handleTypingIndicator(ws, message.data);
          break;
        case 'message_read':
          handleMessageRead(ws, message.data);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          log(`Unknown message type: ${message.type}`, 'WARNING');
      }
    } catch (error) {
      log(`Error processing message: ${error.message}`, 'ERROR');
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' }
      }));
    }
  });

  // Connection close handler
  ws.on('close', () => {
    log(`Connection closed for session: ${currentSessionId}`, 'CONNECTION');
    
    if (currentSessionId) {
      clients.delete(currentSessionId);
      
      // Notify contacts that user is offline
      const userContacts = Array.from(clients.keys()).filter(sessionId => {
        const conversationId = generateConversationId(currentSessionId, sessionId);
        return messages.has(conversationId);
      });

      broadcastToUsers(userContacts, {
        type: 'contact_offline',
        data: { sessionId: currentSessionId }
      });
    }

    stopHeartbeat();
  });

  // Error handler
  ws.on('error', (error) => {
    log(`WebSocket error: ${error.message}`, 'ERROR');
    stopHeartbeat();
  });

  // Authentication handler
  function handleAuth(ws, data) {
    const { sessionId, name, profilePicture } = data;
    
    if (!sessionId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Session ID is required' }
      }));
      return;
    }

    currentSessionId = sessionId;
    clients.set(sessionId, ws);

    // Start heartbeat
    startHeartbeat();

    // Notify contacts that user is online
    const userContacts = Array.from(clients.keys()).filter(sessionId => {
      const conversationId = generateConversationId(currentSessionId, sessionId);
      return messages.has(conversationId);
    });

    broadcastToUsers(userContacts, {
      type: 'contact_online',
      data: { sessionId: currentSessionId }
    });

    log(`User authenticated: ${sessionId}`, 'AUTH');
  }

  // Invitation send handler
  function handleInvitationSend(ws, data) {
    const invitation = {
      id: data.id,
      senderId: data.senderId,
      senderName: data.senderName,
      recipientId: data.recipientId,
      message: data.message,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY).toISOString(),
      metadata: data.metadata
    };

    invitations.set(invitation.id, invitation);

    // Send invitation to recipient
    broadcastToUser(invitation.recipientId, {
      type: 'invitation_received',
      data: invitation
    });

    log(`Invitation sent: ${invitation.id}`, 'INVITATION');
  }

  // Invitation accept handler
  function handleInvitationAccept(ws, data) {
    const { invitationId } = data;
    const invitation = invitations.get(invitationId);

    if (!invitation) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invitation not found' }
      }));
      return;
    }

    // Update invitation status
    invitation.status = 'accepted';
    invitations.set(invitationId, invitation);

    // Notify sender
    broadcastToUser(invitation.senderId, {
      type: 'invitation_response',
      data: invitation
    });

    log(`Invitation accepted: ${invitationId}`, 'INVITATION');
  }

  // Invitation decline handler
  function handleInvitationDecline(ws, data) {
    const { invitationId } = data;
    const invitation = invitations.get(invitationId);

    if (!invitation) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invitation not found' }
      }));
      return;
    }

    // Update invitation status
    invitation.status = 'declined';
    invitations.set(invitationId, invitation);

    // Notify sender
    broadcastToUser(invitation.senderId, {
      type: 'invitation_response',
      data: invitation
    });

    log(`Invitation declined: ${invitationId}`, 'INVITATION');
  }

  // Message send handler
  function handleMessageSend(ws, data) {
    const message = {
      id: data.id,
      senderId: data.senderId,
      recipientId: data.recipientId,
      content: data.content,
      messageType: data.messageType || 'text',
      timestamp: new Date().toISOString(),
      status: 'sent',
      isOutgoing: false,
      metadata: data.metadata,
      replyToId: data.replyToId,
      mentions: data.mentions
    };

    const conversationId = generateConversationId(message.senderId, message.recipientId);
    
    if (!messages.has(conversationId)) {
      messages.set(conversationId, []);
    }
    
    messages.get(conversationId).push(message);

    // Send message to recipient
    broadcastToUser(message.recipientId, {
      type: 'message_received',
      data: message
    });

    log(`Message sent: ${message.id}`, 'MESSAGE');
  }

  // Typing indicator handler
  function handleTypingIndicator(ws, data) {
    const { recipientId, isTyping } = data;

    // Send typing indicator to recipient
    broadcastToUser(recipientId, {
      type: 'typing_indicator',
      data: {
        sessionId: currentSessionId,
        isTyping: isTyping
      }
    });

    log(`Typing indicator: ${currentSessionId} ${isTyping}`, 'TYPING');
  }

  // Message read handler
  function handleMessageRead(ws, data) {
    const { messageId } = data;

    // Find message in conversations
    for (const [conversationId, conversationMessages] of messages.entries()) {
      const messageIndex = conversationMessages.findIndex(msg => msg.id === messageId);
      if (messageIndex !== -1) {
        conversationMessages[messageIndex].status = 'read';
        
        // Notify sender that message was read
        const message = conversationMessages[messageIndex];
        broadcastToUser(message.senderId, {
          type: 'message_status',
          data: {
            messageId: messageId,
            status: 'read'
          }
        });
        
        break;
      }
    }

    log(`Message marked as read: ${messageId}`, 'MESSAGE');
  }
});

// Clean up expired invitations periodically
setInterval(() => {
  const now = new Date();
  for (const [invitationId, invitation] of invitations.entries()) {
    if (invitation.expiresAt && new Date(invitation.expiresAt) < now) {
      invitation.status = 'expired';
      invitations.set(invitationId, invitation);
      
      // Notify both parties
      broadcastToUser(invitation.senderId, {
        type: 'invitation_response',
        data: invitation
      });
      
      broadcastToUser(invitation.recipientId, {
        type: 'invitation_response',
        data: invitation
      });
    }
  }
}, 60000); // Check every minute

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connections: clients.size,
    invitations: invitations.size,
    conversations: messages.size
  });
});

// Get server statistics
app.get('/stats', (req, res) => {
  res.json({
    activeConnections: clients.size,
    totalInvitations: invitations.size,
    totalConversations: messages.size,
    pendingInvitations: Array.from(invitations.values()).filter(inv => inv.status === 'pending').length,
    activeUsers: Array.from(clients.keys())
  });
});

// Socket logs endpoint
app.get('/logs', (req, res) => {
  try {
    if (fs.existsSync(logFile)) {
      const logs = fs.readFileSync(logFile, 'utf8');
      const lines = logs.split('\n').filter(line => line.trim());
      const recentLogs = lines.slice(-100); // Last 100 lines
      
      res.json({
        success: true,
        logs: recentLogs,
        totalLines: lines.length,
        logFile: logFile
      });
    } else {
      res.json({
        success: false,
        message: 'Log file not found',
        logFile: logFile
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reading logs',
      error: error.message
    });
  }
});

// Test client HTML
app.get('/test-client.html', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Messenger Test Client</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #ffffff;
        }
        .container {
            background-color: #2c2c2c;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .log {
            background-color: #000;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            max-height: 400px;
            overflow-y: auto;
            margin-top: 10px;
        }
        .log-entry {
            margin: 2px 0;
            padding: 2px 0;
        }
        .log-info { color: #4CAF50; }
        .log-error { color: #f44336; }
        .log-warning { color: #ff9800; }
        .log-message { color: #2196F3; }
        .log-connection { color: #9C27B0; }
        .log-auth { color: #FF5722; }
        .log-invitation { color: #00BCD4; }
        .log-typing { color: #FFEB3B; }
        input, button {
            padding: 8px 12px;
            margin: 5px;
            border: none;
            border-radius: 4px;
        }
        input {
            background-color: #404040;
            color: #fff;
        }
        button {
            background-color: #FF6B35;
            color: white;
            cursor: pointer;
        }
        button:hover {
            background-color: #e55a2b;
        }
        .status {
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .status.connected {
            background-color: #4CAF50;
        }
        .status.disconnected {
            background-color: #f44336;
        }
    </style>
</head>
<body>
    <h1>🔐 Session Messenger Test Client</h1>
    
    <div class="container">
        <h2>Connection</h2>
        <div id="status" class="status disconnected">Disconnected</div>
        <input type="text" id="sessionId" placeholder="Session ID" value="test-user-1">
        <input type="text" id="userName" placeholder="User Name" value="Test User">
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
    </div>

    <div class="container">
        <h2>Invitations</h2>
        <input type="text" id="inviteRecipient" placeholder="Recipient Session ID" value="test-user-2">
        <input type="text" id="inviteMessage" placeholder="Invitation Message" value="Would you like to connect?">
        <button onclick="sendInvitation()">Send Invitation</button>
        <button onclick="acceptInvitation()">Accept Last Invitation</button>
        <button onclick="declineInvitation()">Decline Last Invitation</button>
    </div>

    <div class="container">
        <h2>Messaging</h2>
        <input type="text" id="messageRecipient" placeholder="Recipient Session ID" value="test-user-2">
        <input type="text" id="messageContent" placeholder="Message Content" value="Hello from Session Messenger!">
        <button onclick="sendMessage()">Send Message</button>
        <button onclick="sendTyping(true)">Start Typing</button>
        <button onclick="sendTyping(false)">Stop Typing</button>
    </div>

    <div class="container">
        <h2>Real-time Logs</h2>
        <button onclick="refreshLogs()">Refresh Logs</button>
        <button onclick="clearLogs()">Clear Display</button>
        <div id="logs" class="log"></div>
    </div>

    <script>
        let socket = null;
        let lastInvitationId = null;
        let isConnected = false;

        function updateStatus(connected) {
            const status = document.getElementById('status');
            isConnected = connected;
            if (connected) {
                status.textContent = 'Connected';
                status.className = 'status connected';
            } else {
                status.textContent = 'Disconnected';
                status.className = 'status disconnected';
            }
        }

        function addLog(message, type = 'info') {
            const logs = document.getElementById('logs');
            const entry = document.createElement('div');
            entry.className = 'log-entry log-' + type;
            entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
            logs.appendChild(entry);
            logs.scrollTop = logs.scrollHeight;
        }

        function connect() {
            const sessionId = document.getElementById('sessionId').value;
            const userName = document.getElementById('userName').value;
            
            if (!sessionId) {
                alert('Please enter a Session ID');
                return;
            }

            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = protocol + '//' + window.location.host + '/ws';
                
                socket = new WebSocket(wsUrl);
                
                socket.onopen = function() {
                    addLog('WebSocket connected', 'connection');
                    updateStatus(true);
                    
                    // Send authentication
                    socket.send(JSON.stringify({
                        type: 'auth',
                        data: {
                            sessionId: sessionId,
                            name: userName,
                            profilePicture: null
                        }
                    }));
                };
                
                socket.onmessage = function(event) {
                    const message = JSON.parse(event.data);
                    addLog('Received: ' + message.type, 'message');
                    
                    if (message.type === 'invitation_received') {
                        lastInvitationId = message.data.id;
                        addLog('Invitation from: ' + message.data.senderName, 'invitation');
                    } else if (message.type === 'message_received') {
                        addLog('Message: ' + message.data.content, 'message');
                    } else if (message.type === 'typing_indicator') {
                        addLog('Typing: ' + message.data.sessionId + ' ' + message.data.isTyping, 'typing');
                    } else if (message.type === 'contact_online') {
                        addLog('Contact online: ' + message.data.sessionId, 'connection');
                    } else if (message.type === 'contact_offline') {
                        addLog('Contact offline: ' + message.data.sessionId, 'connection');
                    }
                };
                
                socket.onclose = function() {
                    addLog('WebSocket disconnected', 'connection');
                    updateStatus(false);
                };
                
                socket.onerror = function(error) {
                    addLog('WebSocket error: ' + error, 'error');
                    updateStatus(false);
                };
                
            } catch (error) {
                addLog('Connection error: ' + error.message, 'error');
            }
        }

        function disconnect() {
            if (socket) {
                socket.close();
                socket = null;
            }
        }

        function sendInvitation() {
            if (!isConnected) {
                alert('Please connect first');
                return;
            }
            
            const recipientId = document.getElementById('inviteRecipient').value;
            const message = document.getElementById('inviteMessage').value;
            
            if (!recipientId || !message) {
                alert('Please enter recipient ID and message');
                return;
            }
            
            const invitation = {
                id: Date.now().toString(),
                senderId: document.getElementById('sessionId').value,
                senderName: document.getElementById('userName').value,
                recipientId: recipientId,
                message: message,
                metadata: {
                    timestamp: new Date().toISOString()
                }
            };
            
            socket.send(JSON.stringify({
                type: 'invitation_send',
                data: invitation
            }));
            
            addLog('Invitation sent to: ' + recipientId, 'invitation');
        }

        function acceptInvitation() {
            if (!lastInvitationId) {
                alert('No invitation to accept');
                return;
            }
            
            socket.send(JSON.stringify({
                type: 'invitation_accept',
                data: { invitationId: lastInvitationId }
            }));
            
            addLog('Invitation accepted: ' + lastInvitationId, 'invitation');
        }

        function declineInvitation() {
            if (!lastInvitationId) {
                alert('No invitation to decline');
                return;
            }
            
            socket.send(JSON.stringify({
                type: 'invitation_decline',
                data: { invitationId: lastInvitationId }
            }));
            
            addLog('Invitation declined: ' + lastInvitationId, 'invitation');
        }

        function sendMessage() {
            if (!isConnected) {
                alert('Please connect first');
                return;
            }
            
            const recipientId = document.getElementById('messageRecipient').value;
            const content = document.getElementById('messageContent').value;
            
            if (!recipientId || !content) {
                alert('Please enter recipient ID and message content');
                return;
            }
            
            const message = {
                id: Date.now().toString(),
                senderId: document.getElementById('sessionId').value,
                recipientId: recipientId,
                content: content,
                messageType: 'text',
                metadata: {
                    timestamp: new Date().toISOString()
                }
            };
            
            socket.send(JSON.stringify({
                type: 'message_send',
                data: message
            }));
            
            addLog('Message sent to: ' + recipientId, 'message');
        }

        function sendTyping(isTyping) {
            if (!isConnected) {
                alert('Please connect first');
                return;
            }
            
            const recipientId = document.getElementById('messageRecipient').value;
            
            if (!recipientId) {
                alert('Please enter recipient ID');
                return;
            }
            
            socket.send(JSON.stringify({
                type: 'typing_indicator',
                data: {
                    recipientId: recipientId,
                    isTyping: isTyping
                }
            }));
            
            addLog('Typing indicator sent: ' + isTyping, 'typing');
        }

        function refreshLogs() {
            fetch('/logs')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const logs = document.getElementById('logs');
                        logs.innerHTML = '';
                        
                        data.logs.forEach(log => {
                            const entry = document.createElement('div');
                            entry.className = 'log-entry';
                            
                            if (log.includes('[ERROR]')) entry.className += ' log-error';
                            else if (log.includes('[WARNING]')) entry.className += ' log-warning';
                            else if (log.includes('[MESSAGE]')) entry.className += ' log-message';
                            else if (log.includes('[CONNECTION]')) entry.className += ' log-connection';
                            else if (log.includes('[AUTH]')) entry.className += ' log-auth';
                            else if (log.includes('[INVITATION]')) entry.className += ' log-invitation';
                            else if (log.includes('[TYPING]')) entry.className += ' log-typing';
                            else entry.className += ' log-info';
                            
                            entry.textContent = log;
                            logs.appendChild(entry);
                        });
                        
                        logs.scrollTop = logs.scrollHeight;
                    } else {
                        addLog('Failed to load logs: ' + data.message, 'error');
                    }
                })
                .catch(error => {
                    addLog('Error loading logs: ' + error.message, 'error');
                });
        }

        function clearLogs() {
            document.getElementById('logs').innerHTML = '';
        }

        // Auto-refresh logs every 5 seconds
        setInterval(refreshLogs, 5000);
        
        // Initial log load
        refreshLogs();
    </script>
</body>
</html>`;
  
  res.send(html);
});

// Live Monitor endpoint
app.get('/live-monitor', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Messenger - Live Monitor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .header h1 {
            color: #4a5568;
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .header .status {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
        }

        .status.online {
            background: #48bb78;
            color: white;
        }

        .status.offline {
            background: #f56565;
            color: white;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
        }

        .card h2 {
            color: #4a5568;
            margin-bottom: 15px;
            font-size: 1.3em;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }

        .stat-item {
            text-align: center;
            padding: 15px;
            background: #f7fafc;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }

        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #4a5568;
            display: block;
        }

        .stat-label {
            color: #718096;
            font-size: 0.9em;
            margin-top: 5px;
        }

        .connections-list {
            max-height: 300px;
            overflow-y: auto;
        }

        .connection-item {
            background: #f7fafc;
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 8px;
            border-left: 4px solid #48bb78;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .connection-item.disconnected {
            border-left-color: #f56565;
            opacity: 0.7;
        }

        .connection-info {
            flex: 1;
        }

        .connection-id {
            font-weight: bold;
            color: #4a5568;
        }

        .connection-time {
            font-size: 0.8em;
            color: #718096;
        }

        .connection-status {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .status-connected {
            background: #48bb78;
            color: white;
        }

        .status-disconnected {
            background: #f56565;
            color: white;
        }

        .messages-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .message-item {
            background: #f7fafc;
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 8px;
            border-left: 4px solid #4299e1;
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .message-type {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .type-text { background: #4299e1; color: white; }
        .type-invitation { background: #ed8936; color: white; }
        .type-system { background: #9f7aea; color: white; }
        .type-typing { background: #38b2ac; color: white; }

        .message-time {
            font-size: 0.8em;
            color: #718096;
        }

        .message-content {
            color: #4a5568;
            word-break: break-word;
        }

        .invitations-list {
            max-height: 300px;
            overflow-y: auto;
        }

        .invitation-item {
            background: #f7fafc;
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 8px;
            border-left: 4px solid #ed8936;
        }

        .invitation-status {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.8em;
            font-weight: bold;
            margin-left: 10px;
        }

        .status-pending { background: #ed8936; color: white; }
        .status-accepted { background: #48bb78; color: white; }
        .status-declined { background: #f56565; color: white; }
        .status-expired { background: #718096; color: white; }

        .logs-list {
            max-height: 300px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }

        .log-item {
            padding: 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            border-left: 3px solid #667eea;
        }

        .log-info { background: #ebf8ff; border-left-color: #4299e1; }
        .log-warn { background: #fef5e7; border-left-color: #ed8936; }
        .log-error { background: #fed7d7; border-left-color: #f56565; }

        .log-time {
            color: #718096;
            font-size: 0.8em;
        }

        .log-message {
            color: #4a5568;
            margin-left: 10px;
        }

        .refresh-info {
            text-align: center;
            color: #718096;
            font-size: 0.9em;
            margin-top: 10px;
        }

        .auto-refresh {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .auto-refresh label {
            margin-right: 10px;
            color: #4a5568;
        }

        .auto-refresh input[type="checkbox"] {
            margin-right: 5px;
        }

        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔌 Session Messenger Live Monitor</h1>
            <div class="status" id="serverStatus">Connecting...</div>
            <p>Real-time monitoring dashboard for Session Messenger server</p>
        </div>

        <div class="auto-refresh">
            <label>
                <input type="checkbox" id="autoRefresh" checked>
                Auto-refresh every 5 seconds
            </label>
            <span id="lastUpdate"></span>
        </div>

        <div class="grid">
            <!-- Server Statistics -->
            <div class="card">
                <h2>📊 Server Statistics</h2>
                <div class="stats-grid" id="serverStats">
                    <div class="stat-item">
                        <span class="stat-number" id="totalConnections">0</span>
                        <span class="stat-label">Total Connections</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="activeConnections">0</span>
                        <span class="stat-label">Active Connections</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="totalMessages">0</span>
                        <span class="stat-label">Total Messages</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="totalInvitations">0</span>
                        <span class="stat-label">Total Invitations</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="uptime">0s</span>
                        <span class="stat-label">Uptime</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="memoryUsage">0MB</span>
                        <span class="stat-label">Memory Usage</span>
                    </div>
                </div>
            </div>

            <!-- Active Connections -->
            <div class="card">
                <h2>🔗 Active Connections</h2>
                <div class="connections-list" id="connectionsList">
                    <p style="text-align: center; color: #718096;">No active connections</p>
                </div>
            </div>

            <!-- Recent Messages -->
            <div class="card">
                <h2>💬 Recent Messages</h2>
                <div class="messages-list" id="messagesList">
                    <p style="text-align: center; color: #718096;">No messages yet</p>
                </div>
            </div>

            <!-- Recent Invitations -->
            <div class="card">
                <h2>📨 Recent Invitations</h2>
                <div class="invitations-list" id="invitationsList">
                    <p style="text-align: center; color: #718096;">No invitations yet</p>
                </div>
            </div>

            <!-- Server Logs -->
            <div class="card">
                <h2>📝 Server Logs</h2>
                <div class="logs-list" id="logsList">
                    <p style="text-align: center; color: #718096;">Loading logs...</p>
                </div>
            </div>

            <!-- System Health -->
            <div class="card">
                <h2>❤️ System Health</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-number" id="cpuUsage">0%</span>
                        <span class="stat-label">CPU Usage</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="responseTime">0ms</span>
                        <span class="stat-label">Response Time</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="errorRate">0%</span>
                        <span class="stat-label">Error Rate</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="lastRestart">Never</span>
                        <span class="stat-label">Last Restart</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        class SessionMonitor {
            constructor() {
                this.baseUrl = window.location.origin;
                this.autoRefreshInterval = null;
                this.lastUpdate = new Date();
                this.connectionHistory = new Map();
                this.messageHistory = [];
                this.invitationHistory = [];
                this.logHistory = [];
                
                this.init();
            }

            init() {
                this.setupAutoRefresh();
                this.loadInitialData();
                this.startRealTimeUpdates();
            }

            setupAutoRefresh() {
                const checkbox = document.getElementById('autoRefresh');
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.startAutoRefresh();
                    } else {
                        this.stopAutoRefresh();
                    }
                });

                if (checkbox.checked) {
                    this.startAutoRefresh();
                }
            }

            startAutoRefresh() {
                this.autoRefreshInterval = setInterval(() => {
                    this.updateAllData();
                }, 5000);
            }

            stopAutoRefresh() {
                if (this.autoRefreshInterval) {
                    clearInterval(this.autoRefreshInterval);
                    this.autoRefreshInterval = null;
                }
            }

            async loadInitialData() {
                await Promise.all([
                    this.updateServerStats(),
                    this.updateConnections(),
                    this.updateMessages(),
                    this.updateInvitations(),
                    this.updateLogs(),
                    this.updateSystemHealth()
                ]);
            }

            async updateAllData() {
                this.lastUpdate = new Date();
                document.getElementById('lastUpdate').textContent = 
                    \`Last updated: \${this.lastUpdate.toLocaleTimeString()}\`;

                await Promise.all([
                    this.updateServerStats(),
                    this.updateConnections(),
                    this.updateMessages(),
                    this.updateInvitations(),
                    this.updateLogs(),
                    this.updateSystemHealth()
                ]);
            }

            async updateServerStats() {
                try {
                    const response = await fetch(\`\${this.baseUrl}/stats\`);
                    const data = await response.json();
                    
                    document.getElementById('totalConnections').textContent = data.totalConnections || 0;
                    document.getElementById('activeConnections').textContent = data.activeConnections || 0;
                    document.getElementById('totalMessages').textContent = data.totalMessages || 0;
                    document.getElementById('totalInvitations').textContent = data.totalInvitations || 0;
                    document.getElementById('uptime').textContent = this.formatUptime(data.uptime || 0);
                    document.getElementById('memoryUsage').textContent = this.formatBytes(data.memoryUsage || 0);
                    
                    // Update server status
                    const statusElement = document.getElementById('serverStatus');
                    statusElement.textContent = 'Online';
                    statusElement.className = 'status online';
                } catch (error) {
                    console.error('Error updating server stats:', error);
                    document.getElementById('serverStatus').textContent = 'Offline';
                    document.getElementById('serverStatus').className = 'status offline';
                }
            }

            async updateConnections() {
                try {
                    const response = await fetch(\`\${this.baseUrl}/stats\`);
                    const data = await response.json();
                    
                    const connectionsList = document.getElementById('connectionsList');
                    const connections = data.connections || [];
                    
                    if (connections.length === 0) {
                        connectionsList.innerHTML = '<p style="text-align: center; color: #718096;">No active connections</p>';
                        return;
                    }

                    connectionsList.innerHTML = connections.map(conn => \`
                        <div class="connection-item">
                            <div class="connection-info">
                                <div class="connection-id">\${conn.id}</div>
                                <div class="connection-time">Connected: \${new Date(conn.connectedAt).toLocaleTimeString()}</div>
                            </div>
                            <span class="connection-status status-connected">Connected</span>
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('Error updating connections:', error);
                }
            }

            async updateMessages() {
                try {
                    const response = await fetch(\`\${this.baseUrl}/stats\`);
                    const data = await response.json();
                    
                    const messagesList = document.getElementById('messagesList');
                    const messages = data.recentMessages || [];
                    
                    if (messages.length === 0) {
                        messagesList.innerHTML = '<p style="text-align: center; color: #718096;">No messages yet</p>';
                        return;
                    }

                    messagesList.innerHTML = messages.slice(0, 10).map(msg => \`
                        <div class="message-item">
                            <div class="message-header">
                                <span class="message-type type-\${msg.type || 'text'}">\${msg.type || 'text'}</span>
                                <span class="message-time">\${new Date(msg.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div class="message-content">
                                <strong>\${msg.senderId}</strong> → <strong>\${msg.recipientId}</strong>: \${msg.content}
                            </div>
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('Error updating messages:', error);
                }
            }

            async updateInvitations() {
                try {
                    const response = await fetch(\`\${this.baseUrl}/stats\`);
                    const data = await response.json();
                    
                    const invitationsList = document.getElementById('invitationsList');
                    const invitations = data.recentInvitations || [];
                    
                    if (invitations.length === 0) {
                        invitationsList.innerHTML = '<p style="text-align: center; color: #718096;">No invitations yet</p>';
                        return;
                    }

                    invitationsList.innerHTML = invitations.slice(0, 10).map(inv => \`
                        <div class="invitation-item">
                            <div class="message-header">
                                <span class="invitation-status status-\${inv.status}">\${inv.status}</span>
                                <span class="message-time">\${new Date(inv.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <div class="message-content">
                                <strong>\${inv.senderName}</strong> invited <strong>\${inv.recipientId}</strong>
                                <br><em>"\${inv.message}"</em>
                            </div>
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('Error updating invitations:', error);
                }
            }

            async updateLogs() {
                try {
                    const response = await fetch(\`\${this.baseUrl}/logs\`);
                    const data = await response.json();
                    
                    const logsList = document.getElementById('logsList');
                    const logs = data.logs || [];
                    
                    if (logs.length === 0) {
                        logsList.innerHTML = '<p style="text-align: center; color: #718096;">No logs available</p>';
                        return;
                    }

                    logsList.innerHTML = logs.slice(-20).map(log => \`
                        <div class="log-item log-\${log.level || 'info'}">
                            <span class="log-time">\${new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span class="log-message">\${log.message}</span>
                        </div>
                    \`).join('');
                    
                    // Auto-scroll to bottom
                    logsList.scrollTop = logsList.scrollHeight;
                } catch (error) {
                    console.error('Error updating logs:', error);
                }
            }

            async updateSystemHealth() {
                try {
                    const startTime = Date.now();
                    const response = await fetch(\`\${this.baseUrl}/health\`);
                    const responseTime = Date.now() - startTime;
                    const data = await response.json();
                    
                    document.getElementById('responseTime').textContent = \`\${responseTime}ms\`;
                    document.getElementById('cpuUsage').textContent = \`\${data.cpuUsage || 0}%\`;
                    document.getElementById('errorRate').textContent = \`\${data.errorRate || 0}%\`;
                    document.getElementById('lastRestart').textContent = data.lastRestart ? 
                        new Date(data.lastRestart).toLocaleTimeString() : 'Never';
                } catch (error) {
                    console.error('Error updating system health:', error);
                }
            }

            startRealTimeUpdates() {
                // WebSocket connection for real-time updates
                try {
                    const ws = new WebSocket(\`wss://\${window.location.host}/ws\`);
                    
                    ws.onopen = () => {
                        console.log('WebSocket connected for real-time updates');
                    };
                    
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        this.handleRealTimeUpdate(data);
                    };
                    
                    ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                    };
                    
                    ws.onclose = () => {
                        console.log('WebSocket disconnected');
                        // Try to reconnect after 5 seconds
                        setTimeout(() => this.startRealTimeUpdates(), 5000);
                    };
                } catch (error) {
                    console.error('Error setting up WebSocket:', error);
                }
            }

            handleRealTimeUpdate(data) {
                // Handle real-time updates from WebSocket
                if (data.type === 'connection') {
                    this.updateConnections();
                } else if (data.type === 'message') {
                    this.updateMessages();
                } else if (data.type === 'invitation') {
                    this.updateInvitations();
                } else if (data.type === 'log') {
                    this.updateLogs();
                }
            }

            formatUptime(seconds) {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                
                if (days > 0) return \`\${days}d \${hours}h \${minutes}m\`;
                if (hours > 0) return \`\${hours}h \${minutes}m\`;
                if (minutes > 0) return \`\${minutes}m \${secs}s\`;
                return \`\${secs}s\`;
            }

            formatBytes(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            }
        }

        // Initialize the monitor when the page loads
        document.addEventListener('DOMContentLoaded', () => {
            new SessionMonitor();
        });
    </script>
</body>
</html>`;
  
  res.send(html);
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  log(`Session Messenger Server running on port ${PORT}`, 'INFO');
  log(`Health check: http://localhost:${PORT}/health`, 'INFO');
  log(`Stats: http://localhost:${PORT}/stats`, 'INFO');
  log(`Logs: http://localhost:${PORT}/logs`, 'INFO');
  log(`Test Client: http://localhost:${PORT}/test-client.html`, 'INFO');
  log(`Live Monitor: http://localhost:${PORT}/live-monitor`, 'INFO');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Shutting down gracefully...', 'INFO');
  server.close(() => {
    log('Server closed', 'INFO');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('Shutting down gracefully...', 'INFO');
  server.close(() => {
    log('Server closed', 'INFO');
    process.exit(0);
  });
}); 