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
app.use(helmet());
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

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  log(`Session Messenger Server running on port ${PORT}`, 'INFO');
  log(`Health check: http://localhost:${PORT}/health`, 'INFO');
  log(`Stats: http://localhost:${PORT}/stats`, 'INFO');
  log(`Logs: http://localhost:${PORT}/logs`, 'INFO');
  log(`Test Client: http://localhost:${PORT}/test-client.html`, 'INFO');
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