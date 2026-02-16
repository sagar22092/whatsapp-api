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
function cleanNumber(number) {
  if (!number) throw new Error("Number is required");

  // remove everything except digits
  let cleaned = number.toString().replace(/\D/g, "");

  // basic length check (WhatsApp numbers are usually 8–15 digits)
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new Error("Invalid phone number");
  }

  return cleaned;
}

function hasSession(userId, sessionId) {
  return fs.existsSync(`${sessionPath(userId, sessionId)}/creds.json`);
}

async function destroyClient(userId, sessionId, removeFiles = false) {
  const client = clients[userId]?.[sessionId];

  if (!client) return;

  try {
    client.sock.ev.removeAllListeners();
    client.sock.ws?.close();
  } catch (e) {}

  delete clients[userId][sessionId];

  if (removeFiles) {
    await fs.remove(sessionPath(userId, sessionId));
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
}

export async function initSession(userId, sessionId) {
  clients[userId] ??= {};

  if (clients[userId][sessionId]) {
    return clients[userId][sessionId];
  }

  const path = sessionPath(userId, sessionId);
  await fs.ensureDir(path);

  const { state, saveCreds } = await useMultiFileAuthState(path);

  const readyDef = deferred();
  const qrDef = deferred();

  const sock = makeWASocket({
    auth: state,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Chrome", "Windows", "10"], // important
    syncFullHistory: false,
  });

  const client = {
    sock,
    connected: false,
    qr: null,
    ready: readyDef.promise,
    qrReady: qrDef.promise,
    resolveReady: readyDef.resolve,
    resolveQR: qrDef.resolve,
  };

  clients[userId][sessionId] = client;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    // QR received
    if (qr) {
      client.qr = await QRCode.toDataURL(qr);
      client.resolveQR();
      await sessionModel.findByIdAndUpdate(sessionId, {
        status: "QR_READY",
      });
    }

    // Connected
    if (connection === "open") {
      client.connected = true;
      client.qr = null;
      client.resolveReady();

      await sessionModel.findByIdAndUpdate(sessionId, {
        status: "CONNECTED",
      });
    }

    // Disconnected
    if (connection === "close") {
      client.connected = false;

      const code = lastDisconnect?.error?.output?.statusCode;

      // Logged out manually
      if (code === DisconnectReason.loggedOut) {
        await sessionModel.findByIdAndUpdate(sessionId, {
          status: "LOGGED_OUT",
        });

        await destroyClient(userId, sessionId, true);
      } else {
        // Auto reconnect
        await sessionModel.findByIdAndUpdate(sessionId, {
          status: "RECONNECTING",
        });

        await destroyClient(userId, sessionId, false);
        await initSession(userId, sessionId);
      }
    }
  });

  return client;
}

/* ───────── GET CLIENT ───────── */
export async function getClient(userId, sessionId) {
  clients[userId] ??= {};

  if (!clients[userId][sessionId]) {
    await initSession(userId, sessionId);
  }

  return clients[userId][sessionId];
}

/* ───────── GET QR ───────── */
export async function getQR(userId, sessionId, timeout = 20000) {
  const client = await getClient(userId, sessionId);

  if (client.connected) return null;

  if (client.qr) return client.qr;

  await Promise.race([
    client.qrReady,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QR timeout")), timeout),
    ),
  ]);

  return client.qr;
}

/* ───────── PAIR CODE ───────── */
export async function getPairCode(
  userId,
  sessionId,
  phoneNumber,
  timeout = 20000,
) {
  const client = await getClient(userId, sessionId);

  if (client.connected) {
    throw new Error("Already connected");
  }

  const clean = cleanNumber(phoneNumber);

  const code = await Promise.race([
    client.sock.requestPairingCode(clean),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Pair code timeout")), timeout),
    ),
  ]);

  await sessionModel.findByIdAndUpdate(sessionId, {
    status: "PAIR_CODE",
  });

  return code;
}

/* ───────── STATUS ───────── */
export async function getStatus(userId, sessionId, timeout = 15000) {
  const session = await sessionModel.findById(sessionId);
  return session?.status === "CONNECTED";
}

export async function getClientForMsg(userId, sessionId) {
  clients[userId] ??= {};

  // 1️⃣ Restore client if missing
  if (!clients[userId][sessionId]) {
    if (!hasSession(userId, sessionId)) {
      throw new Error("Session not found. Please login first.");
    }
    await initSession(userId, sessionId);
  }

  const client = clients[userId][sessionId];

  // 2️⃣ Socket already usable → return immediately
  if (client.connected && client.sock?.ws?.readyState === 1) {
    return client;
  }

  // 3️⃣ Wait ONLY if not connected
  await Promise.race([
    client.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("WhatsApp connect timeout")), 5000),
    ),
  ]);

  return client;
}

/* ───────── SEND MESSAGE ───────── */
export async function sendMessage(
  userId,
  sessionId,
  number,
  message,
  isGroup = false,
) {
  const client = await getClientForMsg(userId, sessionId);
  if (!client.connected) throw new Error("WhatsApp not connected");

  const clean = cleanNumber(number);

  const jid = isGroup ? `${clean}@g.us` : `${clean}@s.whatsapp.net`;

  return client.sock.sendMessage(jid, message);
}

/* ───────── MY INFO ───────── */
export async function getMyInfo(userId, sessionId, timeout = 10000) {
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

  //reinit
  await initSession(userId, sessionId);
}

export async function clear(userId, sessionId) {
  const client = clients[userId]?.[sessionId];
  if (client?.connected) await client.sock.logout();

  await fs.remove(sessionPath(userId, sessionId));
  delete clients[userId]?.[sessionId];

  await sessionModel.findByIdAndDelete(sessionId);
}

/* ───────── GROUP LIST ───────── */

export async function getGroupList(userId, sessionId) {
  const client = await getClient(userId, sessionId);

  if (!client.connected) {
    await Promise.race([
      client.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Not connected")), 15000),
      ),
    ]);
  }
  return client.sock.groupFetchAllParticipating();
}
