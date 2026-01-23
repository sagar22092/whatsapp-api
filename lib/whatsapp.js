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

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  let resolveQR;
  const qrReady = new Promise((resolve) => {
    resolveQR = resolve;
  });

  const sock = makeWASocket({
    auth: state,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false
  });

  clients[username] = {
    sock,
    qr: null,
    connected: false,
    ready,
    qrReady,
    resolveReady,
    resolveQR
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      clients[username].qr = await QRCode.toDataURL(qr);
      clients[username].resolveQR(); // 🔥 signal QR ready
      console.log(`📸 QR for ${username}`);
    }

    if (connection === "open") {
      clients[username].connected = true;
      clients[username].qr = null;
      clients[username].resolveReady(); // 🔥 signal ready
      console.log(`✅ ${username} connected`);
    }

    if (connection === "close") {
      clients[username].connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log(`🔄 Reconnecting ${username}`);
        delete clients[username];
        initUser(username);
      } else {
        console.log(`❌ ${username} logged out`);
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

// wait until QR exists or session connected
export async function getQR(username, timeout = 15000) {
  const client = await getClient(username);

  // Already connected → no QR
  if (client.connected) return null;

  // Wait until QR is generated
  await Promise.race([
    client.qrReady,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QR not generated yet")), timeout)
    )
  ]);

  return client.qr;
}



export async function getStatus(username, timeout = 15000) {
    if (!hasSession(username)) {
    // Create a dummy client object to avoid crashes
    return false;
  }
  const client = await getClient(username);
  
  // Wait until connected or timeout
  if (!client.connected) {
    try {
      await Promise.race([
        client.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("WhatsApp connect timeout")), timeout)
        )
      ]);
    } catch (e) {
      // Timeout, do nothing
      return false;
    }
  }

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

export async function getMyInfo(username, timeout = 15000) {
  const client = await getClient(username);

  // Wait until connected
  if (!client.connected) {
    try {
      await Promise.race([
        client.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("WhatsApp not connected")), timeout)
        )
      ]);
    } catch (e) {
      throw new Error("WhatsApp not connected");
    }
  }

  // Return the user info from the socket
  return client.sock.user; 
}

// Get all chats of a connected user
export async function getChatList(username) {
  const client = await getClient(username);

  if (!client.connected) {
    throw new Error("WhatsApp not connected");
  }

  // client.sock.store is automatically initialized
  // You can access all chats saved in the store
  const store = client.sock.store; // key-value store
  if (!store) return [];

  // Get all chats from the store
  const chats = [];
  for (const [jid, chat] of store.chats) {
    chats.push({
      id: jid,
      name: chat.name || chat.contact?.name || chat.formattedTitle,
      unreadCount: chat.unreadCount || 0,
      isGroup: jid.endsWith("@g.us"),
    });
  }

  return chats;
}




export async function logout(username) {
  const client = clients[username];

  if (!client) {
    // user never logged in, return silently
    return;
  }

  try {
    if (client.connected) {
      // logout only if connected
      await client.sock.logout();
    }
  } catch (e) {
    console.log(`❌ Error logging out ${username}: ${e.message}`);
  }

  // remove session folder
  await fs.remove(`./sessions/${username}`);

  // remove from memory
  delete clients[username];
}

