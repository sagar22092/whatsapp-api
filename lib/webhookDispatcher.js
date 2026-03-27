import axios from "axios";
import sessionModel from "../models/sessionModel.js";

// Webhook event constants
export const WEBHOOK_EVENTS = {
    MESSAGE_RECEIVED: "message.received",
    MESSAGE_SENT: "message.sent",
    MESSAGE_STATUS: "message.status",
    MESSAGE_REACTION: "message.reaction",
    SESSION_CONNECTED: "session.connected",
    SESSION_DISCONNECTED: "session.disconnected",
    SESSION_QR_READY: "session.qr_ready",
    SESSION_RECONNECTING: "session.reconnecting",
    SESSION_LOGGED_OUT: "session.logged_out",
    CONNECTION_STATUS: "connection.status",
};

/**
 * Send webhook event to configured webhook URL
 * @param {string} sessionId - Session ID
 * @param {string} eventType - Event type constant from WEBHOOK_EVENTS
 * @param {object} data - Event data payload
 */
export async function dispatchWebhook(sessionId, eventType, data = {}) {
    try {
        // Get session with webhook URL
        const session = await sessionModel.findById(sessionId).select("webhookUrl user");

        if (!session || !session.webhookUrl) {
            console.log(`No webhook configured for session ${sessionId}`);
            return;
        }

        const payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            sessionId: sessionId.toString(),
            userId: session.user.toString(),
            data: data,
            signature: generateSignature(sessionId, eventType),
        };

        // Send webhook with retry logic
        await sendWebhookWithRetry(session.webhookUrl, payload, 3);
    } catch (error) {
        console.error(`Webhook dispatch error for session ${sessionId}:`, error.message);
        // Don't throw - webhook failures should not break main flow
    }
}

/**
 * Send webhook with exponential backoff retry
 */
async function sendWebhookWithRetry(
    webhookUrl,
    payload,
    maxRetries = 3,
    retryCount = 0
) {
    try {
        const response = await axios.post(webhookUrl, payload, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "WhatsApp-API-Webhook/1.0",
                "X-Webhook-Signature": payload.signature,
                "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "webhook-secret-default",
            },
        });

        if (response.status >= 200 && response.status < 300) {
            // console.log(`✅ Webhook sent successfully to ${webhookUrl}`);
            return response.data;
        } else {
            throw new Error(`Webhook returned status ${response.status}`);
        }
    } catch (error) {
        if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.warn(
                `Webhook failed (attempt ${retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
            return sendWebhookWithRetry(webhookUrl, payload, maxRetries, retryCount + 1);
        } else {
            console.error(`❌ Webhook failed after ${maxRetries} retries:`, error.message);
            // Log failed webhook for debugging
            await logFailedWebhook(webhookUrl, payload, error.message);
        }
    }
}

/**
 * Generate webhook signature for verification
 */
function generateSignature(sessionId, eventType) {
    const timestamp = Date.now();
    const data = `${sessionId}.${eventType}.${timestamp}`;

    // Simple base64 encoding (actual verification done via X-Webhook-Secret header)
    return Buffer.from(data).toString("base64");
}

/**
 * Log failed webhook attempts for debugging
 */
async function logFailedWebhook(url, payload, error) {
    try {
        console.error(`Failed webhook - URL: ${url}, Error: ${error}`);
        // TODO: Store in database for manual retry/debugging
    } catch (e) {
        console.error("Error logging failed webhook:", e);
    }
}

/**
 * Dispatch message received event
 */
export async function onMessageReceived(sessionId, message, senderPhone, mediaUrl = undefined, location = undefined, contact = undefined) {
    const msgContent = message.message || {};
    // Extract text from standard conversation, extended text, or media captions
    const textMsg = 
        msgContent.conversation || 
        msgContent.extendedTextMessage?.text || 
        msgContent.imageMessage?.caption || 
        msgContent.videoMessage?.caption || 
        msgContent.documentMessage?.caption || 
        "";

    // Detect type of message (conversation, imageMessage, etc.)
    const msgType = Object.keys(msgContent)[0] || "text";

    // Extract reply contexts
    let quotedMessageId = null;
    if (msgContent[msgType] && msgContent[msgType].contextInfo) {
        quotedMessageId = msgContent[msgType].contextInfo.stanzaId || null;
    }

    const payload = {
        from: senderPhone,
        message: textMsg,
        messageId: message.key?.id,
        timestamp: message.messageTimestamp,
        type: msgType,
        quotedMessageId: quotedMessageId,
        participant: message.key?.participant || senderPhone,
    };

    if (mediaUrl) payload.mediaUrl = mediaUrl;
    if (location) payload.location = location;
    if (contact) payload.contact = contact;

    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.MESSAGE_RECEIVED, payload);
}

/**
 * Dispatch message sent event
 */
export async function onMessageSent(sessionId, message, recipientPhone) {
    const msgContent = message?.message || {};
    const textMsg = 
        msgContent.conversation || 
        msgContent.extendedTextMessage?.text || 
        msgContent.imageMessage?.caption || 
        msgContent.videoMessage?.caption || 
        msgContent.documentMessage?.caption || 
        "";

    const msgType = Object.keys(msgContent)[0] || "text";

    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.MESSAGE_SENT, {
        to: recipientPhone,
        message: textMsg,
        type: msgType,
        messageId: message?.key?.id || message?.id,
        timestamp: new Date().toISOString(),
        status: "sent",
    });
}

const statusCache = new Set();

/**
 * Dispatch message status update (sent/delivered/read)
 */
export async function onMessageStatusUpdate(sessionId, update) {
    // update.update.status corresponds to WAMessageStatus enum
    // 1=PENDING, 2=SERVER_ACK (sent), 3=DELIVERY_ACK (delivered), 4=READ, 5=PLAYED
    const statusMap = {
        0: "ERROR",
        1: "PENDING",
        2: "SENT",
        3: "DELIVERED",
        4: "READ",
        5: "PLAYED"
    };

    const statusText = statusMap[update.update?.status] || "UNKNOWN";
    const messageId = update.key?.id;

    // Clean device suffixes from numbers (e.g., 919330014767:46 -> 919330014767)
    const rawTo = update.key?.remoteJid?.replace(/@s.whatsapp.net|@g.us|@lid/, "") || "unknown";
    const to = rawTo.split(":")[0];

    // Build deduplication key to stop Multi-Device spam
    const cacheKey = `${sessionId}-${messageId}-${to}-${statusText}`;
    
    if (statusCache.has(cacheKey)) {
        return; // Ignore duplicate device receipt
    }
    statusCache.add(cacheKey);

    // Free memory after 15 mins
    setTimeout(() => statusCache.delete(cacheKey), 15 * 60 * 1000);

    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.MESSAGE_STATUS, {
        messageId: messageId,
        to: to,
        status: statusText,
        statusCode: update.update?.status,
    });
}

/**
 * Dispatch message reaction
 */
export async function onMessageReaction(sessionId, reactionData, senderPhone) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.MESSAGE_REACTION, {
        messageId: reactionData.key?.id, // ID of the message being reacted to
        from: senderPhone,
        reaction: reactionData.text || "", // Emoji string
        timestamp: reactionData.senderTimestampMs,
    });
}

/**
 * Dispatch session connection event
 */
export async function onSessionConnected(sessionId, userInfo) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.SESSION_CONNECTED, {
        phoneNumber: userInfo?.id,
        name: userInfo?.name,
        status: "connected",
    });
}

/**
 * Dispatch session disconnection event
 */
export async function onSessionDisconnected(sessionId, reason) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.SESSION_DISCONNECTED, {
        reason: reason || "unknown",
        timestamp: new Date().toISOString(),
    });
}

/**
 * Dispatch QR ready event
 */
export async function onQRReady(sessionId, qrCode) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.SESSION_QR_READY, {
        qrCode: qrCode ? "data available" : null,
        status: "qr_ready",
    });
}

/**
 * Dispatch reconnecting event
 */
export async function onReconnecting(sessionId, attempt) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.SESSION_RECONNECTING, {
        attempt: attempt || 1,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Dispatch logged out event
 */
export async function onLoggedOut(sessionId) {
    await dispatchWebhook(sessionId, WEBHOOK_EVENTS.SESSION_LOGGED_OUT, {
        reason: "user_logout",
        timestamp: new Date().toISOString(),
    });
}
