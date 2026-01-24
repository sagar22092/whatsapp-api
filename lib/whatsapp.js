import fs from "fs-extra";
import QRCode from "qrcode";
import Pino from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import sessionModel from "../models/sessionModel.js"; // ← DB

const clients = {};

function sessionPath(userId, sessionId) {
  return `./sessions/${userId}/${sessionId}`;
}

function hasSession(userId, sessionId) {
  return fs.existsSync(`${sessionPath(userId, sessionId)}/creds.json`);
}

export async function initSession(userId, sessionId) {
  clients[userId] ??= {};

  if (clients[userId][sessionId]) return clients[userId][sessionId];

  const path = sessionPath(userId, sessionId);
  await fs.ensureDir(path);

  const { state, saveCreds } = await useMultiFileAuthState(path);
  let resolveReady, resolveQR;
  const ready = new Promise((res) => (resolveReady = res));
  const qrReady = new Promise((res) => (resolveQR = res));

  const sock = makeWASocket({
    auth: state,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  clients[userId][sessionId] = {
    sock,
    qr: null,
    connected: false,
    ready,
    qrReady,
    resolveReady,
    resolveQR,
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;
    const client = clients[userId][sessionId];
    if (!client) return;

    if (qr) {
      client.qr = await QRCode.toDataURL(qr);
      client.resolveQR();
      console.log(`📸 QR generated: ${userId}/${sessionId}`);
      // Update DB status
      await sessionModel.findByIdAndUpdate(sessionId, { status: "CREATED" });
    }

    if (connection === "open") {
      client.connected = true;
      client.qr = null;
      client.resolveReady();
      console.log(`✅ Connected: ${userId}/${sessionId}`);
      await sessionModel.findByIdAndUpdate(sessionId, { status: "CONNECTED" });
    }

    if (connection === "close") {
      client.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        console.log(`🔄 Reconnecting: ${userId}/${sessionId}`);
        await sessionModel.findByIdAndUpdate(sessionId, {
          status: "DISCONNECTED",
        });
        delete clients[userId][sessionId];
        initSession(userId, sessionId);
      } else {
        console.log(`❌ Logged out: ${userId}/${sessionId}`);
        await sessionModel.findByIdAndUpdate(sessionId, {
          status: "LOGGED_OUT",
        });
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    console.log(`📨 Message received: ${userId}/${sessionId}`, messages);
  });

  return clients[userId][sessionId];
}

/* ───────── GET CLIENT ───────── */
export async function getClient(userId, sessionId) {
  clients[userId] ??= {};
  if (!clients[userId][sessionId]) {
    await initSession(userId, sessionId);
  }
  const client = clients[userId][sessionId];
  if (!hasSession(userId, sessionId) && !client.connected) return client;

  await Promise.race([
    client.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("WhatsApp connect timeout")), 15000),
    ),
  ]);

  return client;
}

/* ───────── GET QR ───────── */
export async function getQR(userId, sessionId, timeout = 15000) {
  const client = await getClient(userId, sessionId);
  if (client.connected) return null;

  await Promise.race([
    client.qrReady,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QR timeout")), timeout),
    ),
  ]);

  return client.qr;
}
/* ───────── PAIR CODE ───────── */
export async function getPairCode(userId, sessionId, phoneNumber, timeout = 15000) {
  const client = await getClient(userId, sessionId);

  if (client.connected) {
    throw new Error("WhatsApp already connected");
  }

  // Phone must be in international format without +
  // Example: "8801XXXXXXXXX"
  const cleanNumber = phoneNumber.replace(/\D/g, "");

  const code = await Promise.race([
    client.sock.requestPairingCode(cleanNumber),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Pair code timeout")), timeout)
    ),
  ]);

  console.log(`🔑 Pair code generated: ${userId}/${sessionId}`);

  // Optional: save status in DB
  await sessionModel.findByIdAndUpdate(sessionId, {
    status: "PAIR_CODE",
  });

  return code; // example: "ABCD-EFGH"
}
/* ───────── STATUS ───────── */
export async function getStatus(userId, sessionId, timeout = 15000) {
  const session = await sessionModel.findById(sessionId);
  return session?.status === "CONNECTED";
}

/* ───────── SEND MESSAGE ───────── */
export async function sendMessage(userId, sessionId, number, message) {
  const client = await getClient(userId, sessionId);
  if (!client.connected) throw new Error("WhatsApp not connected");

  const jid = number.includes("@s.whatsapp.net")
    ? number
    : `${number}@s.whatsapp.net`;

  return client.sock.sendMessage(jid, message);
}

/* ───────── MY INFO ───────── */
export async function getMyInfo(userId, sessionId, timeout = 15000) {
  const client = await getClient(userId, sessionId);
  if (!client.connected) {
    await Promise.race([
      client.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Not connected")), timeout),
      ),
    ]);
  }
  return client.sock.user;
}

/* ───────── LOGOUT ───────── */
export async function logout(userId, sessionId) {
  const client = clients[userId]?.[sessionId];
  if (client?.connected) await client.sock.logout();

  await fs.remove(sessionPath(userId, sessionId));
  delete clients[userId]?.[sessionId];

  await sessionModel.findByIdAndDelete(sessionId);
  console.log(`🚪 Logged out: ${userId}/${sessionId}`);
}
