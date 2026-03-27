import fs from "fs-extra";
import QRCode from "qrcode";
import Pino from "pino";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import sessionModel from "../models/sessionModel.js"; // ← DB
import Message from "../models/messageModel.js";
import AutoReply from "../models/autoReplyModel.js";
import { askChatGPT } from "./openai.js";
import {
  onMessageReceived,
  onMessageSent,
  onSessionConnected,
  onSessionDisconnected,
  onQRReady,
  onReconnecting,
  onLoggedOut,
  onMessageStatusUpdate,
  onMessageReaction,
} from "./webhookDispatcher.js";

const clients = {};

function sessionPath(userId, sessionId) {
  return `./sessions/${userId}/${sessionId}`;
}
function cleanNumber(number) {
  if (!number) throw new Error("Number is required");

  // remove everything except digits
  let cleaned = number.toString().replace(/\D/g, "");

  // basic length check (WhatsApp numbers are usually 8–15 digits)
  if (cleaned.length < 8 || cleaned.length > 20) {
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
  } catch (e) { }

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

const sessionLocks = {};

export async function initSession(userId, sessionId) {
  clients[userId] ??= {};

  if (clients[userId][sessionId]) {
    return clients[userId][sessionId];
  }

  // Prevent Race Condition: If already initializing, wait for that promise
  if (sessionLocks[sessionId]) {
    return await sessionLocks[sessionId];
  }

  sessionLocks[sessionId] = (async () => {
    const sessionDir = sessionPath(userId, sessionId);
    await fs.ensureDir(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const readyDef = deferred();
    const qrDef = deferred();

    const sock = makeWASocket({
      auth: state,
      logger: Pino({ level: "silent" }),
      printQRInTerminal: false,
      version: [2, 3000, 1033893291],
      browser: ["WaFastApi", "Chrome", "145.0.0"],
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

      if (qr) {
        client.qr = await QRCode.toDataURL(qr);
        client.resolveQR();
        await sessionModel.findByIdAndUpdate(sessionId, { status: "QR_READY" });
        await onQRReady(sessionId, qr);
      }

      if (connection === "open") {
        client.connected = true;
        client.qr = null;
        client.resolveReady();

        await sessionModel.findByIdAndUpdate(sessionId, { status: "CONNECTED" });
        await onSessionConnected(sessionId, sock.user);
      }

      if (connection === "close") {
        client.connected = false;

        const error = lastDisconnect?.error;
        const code = error?.output?.statusCode;
        
        console.error(`🔴 WhatsApp Disconnected [Session: ${sessionId}]:`, error?.message || "Unknown Error", "Code:", code);

        // Logged out manually or account banned/unauthorized
        if (code === DisconnectReason.loggedOut || code === 401 || code === 403) {
          console.log(`🚫 Session ${sessionId} logged out or unauthorized. Deleting session.`);
          await sessionModel.findByIdAndUpdate(sessionId, { status: "LOGGED_OUT" });
          await onLoggedOut(sessionId);
          await destroyClient(userId, sessionId, true);
        } 
        // Restart Required (515)
        else if (code === DisconnectReason.restartRequired) {
          console.log(`🔄 Restart required for session ${sessionId}. Reconnecting immediately...`);
          await destroyClient(userId, sessionId, false);
          await initSession(userId, sessionId);
        }
        // Conflict / Replaced (440) - Another session using same creds
        else if (code === 440) {
          console.log(`⚠️ Conflict detected for session ${sessionId} (Code 440). Halting auto-reconnect.`);
          await sessionModel.findByIdAndUpdate(sessionId, { status: "DISCONNECTED" });
          await onSessionDisconnected(sessionId, "conflict");
          await destroyClient(userId, sessionId, false);
        }
        // General Disconnect / Network Drop - Auto reconnect with 5s delay
        else {
          console.log(`⏳ Reconnecting session ${sessionId} in 5 seconds...`);
          await sessionModel.findByIdAndUpdate(sessionId, { status: "RECONNECTING" });
          await onReconnecting(sessionId);
          await destroyClient(userId, sessionId, false);
          
          setTimeout(async () => {
            await initSession(userId, sessionId);
          }, 5000);
        }
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const { messages, type } = m;
      if (!["notify", "append"].includes(type) || !Array.isArray(messages)) return;

      for (const msg of messages) {
        if (!msg?.message) continue;

        const isFromMe = msg?.key?.fromMe;
        // console.log(`🤖 [AutoReply Trace] Raw message arrived. fromMe: ${isFromMe}`);
        if (isFromMe) continue;

        try {
          const senderPhone =
            msg?.key?.participant?.replace(/@s.whatsapp.net|@g.us|@lid/, "") ||
            msg?.key?.remoteJid?.replace(/@s.whatsapp.net|@g.us|@lid/, "") ||
            "unknown";

          if (msg.message.reactionMessage) {
             await onMessageReaction(sessionId, msg.message.reactionMessage, senderPhone);
          } else {
             let mediaUrl = undefined;
             let location = undefined;
             let contact = undefined;
             
             // Recursively find the true message type (bypassing ephemeral wrappers)
             let msgType = Object.keys(msg.message)[0];
             let actualMessage = msg.message;
             
             if (msgType === 'ephemeralMessage' || msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
                 actualMessage = msg.message[msgType].message;
                 msgType = Object.keys(actualMessage)[0];
             }
             
             // Check Media
             if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(msgType)) {
                try {
                   const media = actualMessage[msgType];
                   const buffer = await downloadMediaMessage(
                      msg,
                      'buffer',
                      { },
                      { logger: Pino({ level: "silent" }) }
                   );
                   
                   let ext = "bin";
                   if (media.mimetype) {
                      ext = media.mimetype.split('/')[1].split(';')[0];
                   }
                   if (media.fileName) {
                      const parts = media.fileName.split('.');
                      if(parts.length > 1) ext = parts.pop();
                   }
                   
                   const randName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
                   const saveDir = path.join(process.cwd(), "public", "received_media");
                   await fs.ensureDir(saveDir);
                   await fs.writeFile(path.join(saveDir, randName), buffer);
                   
                   const hostUrl = process.env.BASE_URL || "http://localhost:3000";
                   mediaUrl = `${hostUrl}/received_media/${randName}`;
                } catch(err) {
                   console.error("Failed to download media:", err);
                   mediaUrl = `ERROR: ${err.message}`;
                }
             } else if (msgType === 'locationMessage') {
                location = {
                   lat: actualMessage.locationMessage.degreesLatitude,
                   lng: actualMessage.locationMessage.degreesLongitude,
                   name: actualMessage.locationMessage.name || "",
                   address: actualMessage.locationMessage.address || ""
                };
             } else if (msgType === 'contactMessage') {
                contact = {
                   displayName: actualMessage.contactMessage.displayName || "",
                   vcard: actualMessage.contactMessage.vcard || ""
                };
             }

             // Chatbot / Auto Responder Logic
             try {
                const textMsg = actualMessage.conversation || 
                                actualMessage.extendedTextMessage?.text || 
                                actualMessage.imageMessage?.caption || 
                                actualMessage.videoMessage?.caption || "";
                
                // console.log(`🤖 [AutoReply Trace] Incoming msg: "${textMsg}" for session: ${sessionId}`);

                if (textMsg) {
                    const rules = await AutoReply.find({ session: sessionId, isActive: true });
                    // console.log(`🤖 [AutoReply Trace] Found ${rules.length} active rules for this session.`);
                    let isMatchAny = false;
                    
                    for (const rule of rules) {
                        let isMatch = false;
                        const lowerInput = textMsg.trim().toLowerCase();
                        const lowerKeyword = rule.keyword.toLowerCase();

                        // console.log(`🤖 [AutoReply Trace] Evaluating rule ID: ${rule._id} | Type: ${rule.matchType} | Keyword: "${lowerKeyword}"`);

                        if (rule.matchType === "exact" && lowerInput === lowerKeyword) {
                            isMatch = true;
                        } else if (rule.matchType === "contains" && lowerInput.includes(lowerKeyword)) {
                            isMatch = true;
                        } else if (rule.matchType === "regex") {
                           try {
                             const regex = new RegExp(rule.keyword, "i");
                             if (regex.test(textMsg)) isMatch = true;
                           } catch(e) {}
                        }

                        if (isMatch) {
                            // console.log(`🤖 [AutoReply Trace] Rule matched! Replying to: ${senderPhone}`);
                            // 1. Initial short delay to "notice" the message
                            setTimeout(async () => {
                                try {
                                    const jid = msg.key.remoteJid;
                                    // console.log(`🤖 [AutoReply Trace] Activating typing status for: ${jid}`);
                                    
                                    // 2. Turn on 'composing' (Typing...) indicator
                                    await sock.sendPresenceUpdate('composing', jid);
                                    
                                    // 3. Dynamic typing delay based on message length (min 1.5s, max 4s)
                                    const typingDuration = Math.min(Math.max(rule.replyText.length * 40, 1500), 4000);
                                    
                                    setTimeout(async () => {
                                        // 4. Turn off composing
                                        await sock.sendPresenceUpdate('paused', jid);
                                        // 5. Send message with quote
                                        const payload = await buildMediaPayload(rule.replyText, rule.mediaUrl, rule.mediaType);
                                        await sock.sendMessage(jid, payload, { quoted: msg });
                                        // console.log(`🤖 [AutoReply Trace] Success! Sent reply after ${typingDuration}ms typing delay.`);
                                    }, typingDuration);

                                } catch(err) {
                                  console.error("AutoReply failed:", err);
                                }
                            }, 500); // 500ms delay before "typing" starts
                            
                            isMatchAny = true;
                            break; // Stop evaluating after first rule triggers
                        }
                    }

                    // Fallback message if no rules matched
                    if (!isMatchAny) {
                        const isGroup = msg.key.remoteJid.endsWith("@g.us");
                        
                        if (!isGroup) {
                            try {
                                const currentSession = await sessionModel.findById(sessionId);
                                
                                if (currentSession) {
                                    // 1) VIP ChatGPT AI Handling
                                    if (currentSession.aiEnabled && currentSession.openAiKey) {
                                        const jid = msg.key.remoteJid;
                                        await sock.sendPresenceUpdate('composing', jid);
                                        const aiResponse = await askChatGPT(currentSession.openAiKey, currentSession.aiPrompt, textMsg);
                                        await sock.sendPresenceUpdate('paused', jid);
                                        
                                        if (aiResponse) {
                                            await sock.sendMessage(jid, { text: aiResponse }, { quoted: msg });
                                            // Make sure to dispatch the webhook for AI replies too
                                            await onMessageSent(userId, sessionId, {
                                                sender: sock.user?.id.split(":")[0],
                                                recipient: senderPhone,
                                                message: aiResponse,
                                                timestamp: Date.now(),
                                                aiGenerated: true
                                            });
                                            return; // Stop here, AI handled it
                                        }
                                    }

                                    // 2) Static Fallback message if AI is disabled or fails
                                    if (currentSession.fallbackEnabled && currentSession.fallbackMessage) {
                                        const fallbackText = currentSession.fallbackMessage.trim();
                                        
                                        // Anti-Loop Check: Don't auto-reply if the user's message IS the fallback text
                                        if (textMsg.trim() !== fallbackText) {
                                            setTimeout(async () => {
                                                try {
                                                    const jid = msg.key.remoteJid;
                                                    await sock.sendPresenceUpdate('composing', jid);
                                                    
                                                    // Dynamic typing duration based on fallback message length
                                                    const typingDur = Math.min(Math.max(fallbackText.length * 40, 1500), 3000);
                                                    
                                                    setTimeout(async () => {
                                                        await sock.sendPresenceUpdate('paused', jid);
                                                        await sock.sendMessage(jid, { text: fallbackText }, { quoted: msg });
                                                        await onMessageSent(userId, sessionId, {
                                                            sender: sock.user?.id.split(":")[0],
                                                            recipient: senderPhone,
                                                            message: fallbackText,
                                                            timestamp: Date.now(),
                                                            isFallback: true
                                                        });
                                                    }, typingDur);
                                                } catch (e) {
                                                    console.error("Fallback failed:", e);
                                                }
                                            }, 500);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error("Error evaluating fallback settings:", err);
                            }
                        }
                    }
                }
             } catch(err) {
                console.error("AutoReply error:", err);
             }

             // ── Save incoming message to DB for inbox ──
             try {
               const textBody = actualMessage?.conversation ||
                 actualMessage?.extendedTextMessage?.text ||
                 actualMessage?.imageMessage?.caption ||
                 actualMessage?.videoMessage?.caption || "";
               
               const simpleMsgType = msgType.replace("Message", "");
               
               await Message.create({
                 user: userId,
                 session: sessionId,
                 message: msg,
                 direction: "received",
                 fromNumber: senderPhone,
                 msgType: simpleMsgType || "text",
                 body: textBody,
                 mediaUrl: mediaUrl || null,
               });
             } catch (saveErr) {
               console.error("[Inbox] Failed to save incoming message:", saveErr.message);
             }

             await onMessageReceived(sessionId, msg, senderPhone, mediaUrl, location, contact);
          }
        } catch (error) {
          console.error("Error dispatching message webhook:", error);
        }
      }
    });

    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        if (update.update?.status) {
          try {
            await onMessageStatusUpdate(sessionId, update);
          } catch (error) {
             console.error("Error dispatching status update webhook:", error);
          }
        }
      }
    });

    return client;
  })();

  try {
    return await sessionLocks[sessionId];
  } finally {
    // Only delete the lock once fully resolved and stabilized
    delete sessionLocks[sessionId];
  }
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

  const res = await client.sock.sendMessage(jid, message);

  await Message.create({
    user: userId,
    session: sessionId,
    message: res,
  });

  // Send webhook event for sent message
  try {
    await onMessageSent(sessionId, res, clean);
  } catch (error) {
    console.error("Error dispatching message sent webhook:", error);
  }

  return res;
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

/* ───────── HELPER: BUILD MEDIA PAYLOAD ───────── */
export async function buildMediaPayload(text, mediaUrl, mediaType) {
  if (!mediaUrl || !mediaType || mediaType === "none") {
    return { text: text || "" };
  }

  let mediaContent;

  // If it's a local path (e.g. /uploads/xxx.jpg), load from disk as buffer
  if (mediaUrl.startsWith("/")) {
    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      // Strip leading slash and join properly (important on Windows)
      const relativePath = mediaUrl.replace(/^\//, '');
      const localPath = path.join(__dirname, "..", "public", relativePath);
      console.log("[buildMediaPayload] Reading file from:", localPath);
      const buffer = await fs.readFile(localPath);
      mediaContent = buffer;
      console.log("[buildMediaPayload] Buffer size:", buffer.length, "bytes");
    } catch (e) {
      console.error("[buildMediaPayload] Failed to read local file:", e.message);
      // fallback to URL
      mediaContent = { url: (process.env.BASE_URL || "http://localhost:" + (process.env.PORT || 3000)) + mediaUrl };
    }
  } else {
    mediaContent = { url: mediaUrl };
  }

  if (mediaType === "image") {
    return { image: mediaContent, caption: text || "" };
  } else if (mediaType === "video") {
    return { video: mediaContent, caption: text || "" };
  } else if (mediaType === "document") {
    const fileName = (typeof mediaUrl === 'string' ? mediaUrl.split('/').pop() : "document") || "document";
    return { document: mediaContent, mimetype: "application/octet-stream", fileName, caption: text || "" };
  } else if (mediaType === "audio") {
    return { audio: mediaContent, mimetype: "audio/mp4" };
  }

  return { text: text || "" };
}
