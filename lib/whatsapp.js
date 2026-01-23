import fs from "fs-extra";
import QRCode from "qrcode";
import Pino from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";

const clients = {}; // username -> { sock, qr, connected }
function hasSession(username) {
  return fs.existsSync(`./sessions/${username}/creds.json`);
}

/* ───────── INIT USER SESSION ───────── */
export async function initUser(username) {
  if (clients[username]) return clients[username];

  const sessionPath = `./sessions/${username}`;
  await fs.ensureDir(sessionPath);

  const authExists = hasSession(username);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const sock = makeWASocket({
    auth: state,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  clients[username] = {
    sock,
    qr: null,
    connected: false,
    ready,
    authExists,
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      clients[username].qr = await QRCode.toDataURL(qr);
      console.log(`📸 QR for ${username}`);
    }

    if (connection === "open") {
      clients[username].connected = true;
      clients[username].qr = null;
      resolveReady();
      console.log(`✅ ${username} connected`);
    }

    if (connection === "close") {
      clients[username].connected = false;

      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        delete clients[username];
        initUser(username);
      }
    }
  });

  return clients[username];
}

/* ───────── HELPERS ───────── */
export async function getClient(username) {
  if (!clients[username]) {
    await initUser(username);
  }

  const client = clients[username];

  // 🚫 user never logged in → return immediately
  if (!client.authExists && !client.connected) {
    return client;
  }

  // ⏳ wait only if session exists
  await Promise.race([
    client.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("WhatsApp connect timeout")), 15000),
    ),
  ]);

  return client;
}

export async function getQR(username) {
  const client = await getClient(username);
  return client.qr;
}

export async function getStatus(username) {
  const client = await getClient(username);
  return client.connected;
}

export async function sendMessage(username, number, message) {
  const client = await getClient(username);

  if (!client.connected) throw new Error("User not logged in to WhatsApp");

  const jid = number.includes("@s.whatsapp.net")
    ? number
    : `${number}@s.whatsapp.net`;

  return client.sock.sendMessage(jid, { text: message });
}

//My account info

export async function getMyInfo(username) {
  const client = await getClient(username);

  if (!client.connected) throw new Error("WhatsApp not connected");

  return client.sock.fetchMyInfo();
}

export async function logout(username) {
  const client = clients[username];
  if (!client) return;

  await client.sock.logout();
  await fs.remove(`./sessions/${username}`);
  delete clients[username];
}
