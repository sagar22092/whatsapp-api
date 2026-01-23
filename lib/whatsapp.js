import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import fs from "fs-extra";
import path from "path";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
fs.ensureDirSync(SESSIONS_DIR);

const sockets = {};    // userId -> socket
const qrCodes = {};    // userId -> QR string
const isConnected = {}; // userId -> boolean
// Remove session data
async function removeSession(userId) {
  const sessionFolder = path.join(SESSIONS_DIR, userId);
  try {
    await fs.remove(sessionFolder);
    console.log("Session removed ✅");
    // Clean up in-memory data
    delete sockets[userId];
    delete qrCodes[userId];
    delete isConnected[userId];
  } catch (err) {
    console.error("Failed to remove session:", err);
  }
}
// Connect WhatsApp for a user
export async function connectWhatsApp(userId) {
  if (sockets[userId]) return sockets[userId];

  const sessionFolder = path.join(SESSIONS_DIR, userId);
  fs.ensureDirSync(sessionFolder);

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrCodes[userId] = qr;

    if (connection === "open") {
      console.log(`${userId} WhatsApp Connected ✅`);
      qrCodes[userId] = null;
      isConnected[userId] = true;
    } else if (connection === "close") {
      console.log(`${userId} Connection closed`);
      isConnected[userId] = false;

      const reason = lastDisconnect?.error?.output?.statusCode;

       if (reason === DisconnectReason.loggedOut || reason === 515) {
        console.log("Logged out or stream error. Removing session...");
        removeSession(userId);
      } else {
        console.log("Reconnecting...");
        setTimeout(() => connectWhatsApp(userId), 3000); // retry after 3 sec
      }
    }
  });

  sockets[userId] = sock;
  isConnected[userId] = false;
  return sock;
}

// Get QR code
export function getQRCode(userId) {
  return qrCodes[userId] || null;
}

// Send message
export async function sendMessage(userId, number, message) {
  if (!isConnected[userId]) throw new Error("WhatsApp not connected yet");

  const sock = sockets[userId];
  const jid = number.includes("@s.whatsapp.net") ? number : `${number}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: message });
}
