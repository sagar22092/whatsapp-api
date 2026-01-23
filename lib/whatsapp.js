import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import fs from "fs-extra";
import path from "path";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
fs.ensureDirSync(SESSIONS_DIR);

// Store sessions in memory
const sockets = {};
const qrCodes = {};
const connectionStates = {};
const pendingConnections = new Set();

// Get connection status
export function getConnectionStatus(userId) {
  return {
    isConnected: connectionStates[userId] === 'open',
    hasQR: !!qrCodes[userId],
    hasSocket: !!sockets[userId],
    isConnecting: pendingConnections.has(userId),
    state: connectionStates[userId] || 'disconnected'
  };
}

// Remove session data
async function removeSession(userId) {
  const sessionFolder = path.join(SESSIONS_DIR, userId);
  try {
    await fs.remove(sessionFolder);
    console.log(`Session removed for ${userId} ✅`);
    
    // Clean up in-memory data
    if (sockets[userId]) {
      try {
        await sockets[userId].end();
      } catch (e) {}
    }
    
    delete sockets[userId];
    delete qrCodes[userId];
    delete connectionStates[userId];
    pendingConnections.delete(userId);
  } catch (err) {
    console.error("Failed to remove session:", err);
  }
}

// Connect WhatsApp for a user
export async function connectWhatsApp(userId) {
  // Check if already connecting or connected
  const status = getConnectionStatus(userId);
  
  if (status.isConnecting) {
    console.log(`Already connecting for ${userId}`);
    return sockets[userId];
  }
  
  if (status.isConnected) {
    console.log(`Already connected for ${userId}`);
    return sockets[userId];
  }

  // Clear any existing connection
  if (sockets[userId]) {
    try {
      await sockets[userId].end();
    } catch (e) {}
  }

  pendingConnections.add(userId);
  connectionStates[userId] = 'connecting';

  try {
    const sessionFolder = path.join(SESSIONS_DIR, userId);
    fs.ensureDirSync(sessionFolder);

    console.log(`🚀 Connecting WhatsApp for ${userId}...`);
    
    // Get latest version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA version ${version.join('.')}, isLatest: ${isLatest}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: true,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 30000,
      // Disable automatic reconnects, we'll handle it manually
      shouldIgnoreJid: jid => jid?.endsWith('@g.us') || jid?.endsWith('@broadcast'),
      // Generate a unique mobile identifier to avoid conflicts
      mobile: false,
      // Add retry config
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      emitOwnEvents: true,
      fireInitQueries: true,
      txTimeout: 20000
    });

    // Save credentials
    sock.ev.on("creds.update", saveCreds);

    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`${userId} connection update:`, { connection, hasQR: !!qr });

      if (qr) {
        console.log(`📱 QR Code received for ${userId}`);
        qrCodes[userId] = qr;
        connectionStates[userId] = 'qr_received';
      }

      if (connection === "open") {
        console.log(`✅ ${userId} WhatsApp Connected!`);
        qrCodes[userId] = null;
        connectionStates[userId] = 'open';
        pendingConnections.delete(userId);
        
        // Get user info
        try {
          const user = sock.user;
          console.log(`👤 Connected as: ${user?.id || userId}`);
        } catch (e) {}
      }

      if (connection === "close") {
        console.log(`❌ ${userId} Connection closed`);
        connectionStates[userId] = 'closed';
        pendingConnections.delete(userId);
        
        // Check disconnect reason
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`Disconnect reason code: ${statusCode}`);
        
        if (statusCode === DisconnectReason.loggedOut || statusCode === 515) {
          console.log(`🚫 Logged out from WhatsApp for ${userId}. Removing session...`);
          await removeSession(userId);
          
          // Don't reconnect if logged out
          return;
        }
        
        if (shouldReconnect) {
          console.log(`🔄 Reconnecting ${userId} in 5 seconds...`);
          setTimeout(async () => {
            try {
              // Clean up before reconnecting
              delete sockets[userId];
              delete qrCodes[userId];
              delete connectionStates[userId];
              pendingConnections.delete(userId);
              
              await connectWhatsApp(userId);
            } catch (e) {
              console.error(`Failed to reconnect ${userId}:`, e);
            }
          }, 5000);
        }
      }
    });

    // Handle QR generation
    sock.ev.on("qr", (qr) => {
      console.log(`📱 QR event for ${userId}`);
      qrCodes[userId] = qr;
    });

    // Handle errors
    sock.ev.on("connection.error", (error) => {
      console.error(`${userId} connection error:`, error.message || error);
      connectionStates[userId] = 'error';
      pendingConnections.delete(userId);
    });

    // Handle messages
    sock.ev.on("messages.upsert", (m) => {
      console.log(`${userId} received message:`, m.messages?.length || 0, 'messages');
    });

    sockets[userId] = sock;
    return sock;
  } catch (error) {
    console.error(`❌ Failed to connect ${userId}:`, error.message || error);
    pendingConnections.delete(userId);
    delete connectionStates[userId];
    delete sockets[userId];
    throw error;
  }
}

// Get QR code
export function getQRCode(userId) {
  return qrCodes[userId] || null;
}

// Send message
export async function sendMessage(userId, number, message) {
  const status = getConnectionStatus(userId);
  
  if (!status.isConnected) {
    throw new Error(`WhatsApp not connected. Status: ${status.state}`);
  }

  const sock = sockets[userId];
  if (!sock) {
    throw new Error("Socket not found. Please reconnect.");
  }

  try {
    // Format phone number
    let jid = number;
    if (!jid.includes('@s.whatsapp.net')) {
      // Remove any non-digit characters except +
      const cleanNumber = number.replace(/[^\d+]/g, '');
      jid = `${cleanNumber}@s.whatsapp.net`;
    }
    
    console.log(`📤 Sending message from ${userId} to ${jid}`);
    
    const result = await sock.sendMessage(jid, { text: message });
    console.log(`✅ Message sent successfully from ${userId}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send message from ${userId}:`, error.message || error);
    
    // If message sending fails due to connection issues, update status
    if (error.message?.includes('not connected') || error.message?.includes('socket closed')) {
      connectionStates[userId] = 'closed';
      throw new Error('Connection lost. Please reconnect.');
    }
    
    throw error;
  }
}

// Disconnect user
export async function disconnectWhatsApp(userId) {
  const sock = sockets[userId];
  if (sock) {
    try {
      await sock.end();
      console.log(`🔌 Disconnected ${userId}`);
    } catch (error) {
      console.error(`Error disconnecting ${userId}:`, error);
    }
  }
  await removeSession(userId);
}

// Get all connected users
export function getConnectedUsers() {
  return Object.keys(sockets).filter(userId => connectionStates[userId] === 'open');
}

// Check if user exists
export function userExists(userId) {
  return !!sockets[userId];
}