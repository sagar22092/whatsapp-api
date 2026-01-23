import express from "express";
import cors from "cors";
import path from "path";
import qrcode from "qrcode";
import { 
  connectWhatsApp, 
  getQRCode, 
  sendMessage, 
  getConnectionStatus,
  disconnectWhatsApp,
  getConnectedUsers,
  userExists
} from "./lib/whatsapp.js";

import fs from "fs-extra";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(path.resolve(), "public")));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.url}`);
  next();
});

// ========== API ENDPOINTS ==========

// 1. Initialize connection
app.post("/api/connect/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log(`🔗 Initializing connection for: ${userId}`);
  
  try {
    // Clean up any existing session folder first
    const sessionFolder = path.join(SESSIONS_DIR, userId);
    if (await fs.pathExists(sessionFolder)) {
      console.log(`🧹 Cleaning up old session for ${userId}`);
      await fs.remove(sessionFolder).catch(() => {});
    }
    
    const sock = await connectWhatsApp(userId);
    
    // Wait for QR generation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const status = getConnectionStatus(userId);
    const qr = getQRCode(userId);
    
    let response = {
      success: true,
      message: `Connection initialized for ${userId}`,
      status: status.state,
      hasQR: !!qr,
      userId
    };
    
    // If QR is available, include it
    if (qr) {
      try {
        const qrDataURL = await qrcode.toDataURL(qr);
        response.qr = qrDataURL;
      } catch (qrError) {
        console.error("QR generation error:", qrError);
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error(`❌ Connection error for ${userId}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: 'CONNECTION_FAILED'
    });
  }
});

// 2. Get status
app.get("/api/status/:userId", (req, res) => {
  const { userId } = req.params;
  const status = getConnectionStatus(userId);
  
  let message = '';
  let apiStatus = 'not_initialized';
  
  switch (status.state) {
    case 'open':
      message = 'WhatsApp is connected and ready';
      apiStatus = 'connected';
      break;
    case 'qr_received':
      message = 'Scan QR code to connect';
      apiStatus = 'waiting_for_scan';
      break;
    case 'connecting':
      message = 'Connecting to WhatsApp...';
      apiStatus = 'connecting';
      break;
    case 'closed':
      message = 'Connection closed. Reconnecting...';
      apiStatus = 'reconnecting';
      break;
    default:
      message = 'Not connected. Initialize connection first.';
  }
  
  res.json({
    success: true,
    status: apiStatus,
    message,
    details: status,
    timestamp: new Date().toISOString()
  });
});

// 3. Get QR code
app.get("/api/qr/:userId", async (req, res) => {
  const { userId } = req.params;
  const qr = getQRCode(userId);
  
  if (!qr) {
    const status = getConnectionStatus(userId);
    
    if (status.isConnecting) {
      return res.json({ 
        success: false,
        qr: null, 
        status: 'generating',
        message: 'QR code is being generated. Please wait...'
      });
    }
    
    return res.json({ 
      success: false,
      qr: null, 
      status: 'no_qr',
      message: 'No QR code available. Please initialize connection first.'
    });
  }

  try {
    const qrDataURL = await qrcode.toDataURL(qr);
    res.json({ 
      success: true,
      qr: qrDataURL, 
      status: 'available',
      message: 'QR code ready for scanning'
    });
  } catch (err) {
    console.error("QR generation error:", err);
    res.status(500).json({ 
      success: false,
      qr: null, 
      status: 'error',
      error: 'Failed to generate QR code'
    });
  }
});

// 4. Send message
app.post("/api/send", async (req, res) => {
  const { userId, number, message } = req.body;
  
  if (!userId || !number || !message) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: userId, number, message" 
    });
  }

  try {
    await sendMessage(userId, number, message);
    res.json({ 
      success: true,
      message: "Message sent successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const statusCode = err.message.includes('not connected') ? 400 : 500;
    res.status(statusCode).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 5. Check connection
app.get("/api/check/:userId", (req, res) => {
  const { userId } = req.params;
  const status = getConnectionStatus(userId);
  
  res.json({
    success: true,
    userId,
    connected: status.isConnected,
    hasQR: status.hasQR,
    state: status.state,
    isConnecting: status.isConnecting,
    exists: userExists(userId)
  });
});

// 6. Disconnect
app.post("/api/disconnect/:userId", async (req, res) => {
  const { userId } = req.params;
  
  try {
    await disconnectWhatsApp(userId);
    res.json({
      success: true,
      message: `Disconnected ${userId} successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 7. Connected users
app.get("/api/connected-users", (req, res) => {
  const users = getConnectedUsers();
  res.json({
    success: true,
    count: users.length,
    users: users,
    timestamp: new Date().toISOString()
  });
});

// 8. Force fresh connection (clears everything)
app.post("/api/fresh-connect/:userId", async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Clean everything
    const sessionFolder = path.join(SESSIONS_DIR, userId);
    await fs.remove(sessionFolder).catch(() => {});
    
    // Force fresh connection
    const sock = await connectWhatsApp(userId);
    
    // Wait for QR
    setTimeout(async () => {
      const qr = getQRCode(userId);
      const status = getConnectionStatus(userId);
      
      const response = {
        success: true,
        message: "Fresh connection initialized",
        status: status.state,
        hasQR: !!qr,
        userId
      };
      
      if (qr) {
        try {
          const qrDataURL = await qrcode.toDataURL(qr);
          response.qr = qrDataURL;
        } catch (e) {}
      }
      
      res.json(response);
    }, 2000);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 9. Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(path.resolve(), "public", "index.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: "Route not found",
    path: req.url 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    success: false, 
    error: "Internal server error"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`🚀 WhatsApp API Server started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📁 Sessions: ${SESSIONS_DIR}`);
  console.log(`===========================================`);
});