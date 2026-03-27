import sessionModel from "../models/sessionModel.js";
import {
  initSession,
  getQR as waGetQR,
  getPairCode as waGetPairCode,
  getStatus as waGetStatus,
  sendMessage as waSendMessage,
  getMyInfo as waGetMyInfo,
  logout as waLogout,
  clear as waClear,
} from "../lib/whatsapp.js";
import User from "../models/userModel.js";
import subscriptions from "../json/subscription.js";
import Message from "../models/messageModel.js";
import Campaign from "../models/campaignModel.js";

/* ───────────────── CREATE SESSION ───────────────── */
export async function newSession(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activeSubscription = subscriptions.plans.filter(
      (plan) => plan.id === user.subscription?.id,
    )[0];

    if (!activeSubscription) {
      return res.status(403).json({ error: "No active subscription" });
    }

    const activeSessions = await sessionModel.find({ user: userId }).lean();
    if (activeSessions.length >= activeSubscription.sessions) {
      return res
        .status(403)
        .json({ error: "You have reached the maximum number of sessions" });
    }

    const session = await sessionModel.create({
      user: userId,
      status: "CREATED",
    });

    await initSession(userId.toString(), session._id.toString());

    res.status(201).json({
      success: true,
      sessionId: session._id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/* ───────────────── GET QR ───────────────── */
export async function getQR(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const qr = await waGetQR(userId, sessionId);

    res.json({
      connected: !qr,
      qr,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPairCode(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;
    const { number } = req.body;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const pairCode = await waGetPairCode(userId, sessionId, number);

    res.json({
      connected: !pairCode,
      pairCode,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────── STATUS ───────────────── */
export async function getStatus(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const connected = await waGetStatus(userId, sessionId);

    res.json({ connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────── SEND MESSAGE ───────────────── */
export async function sendMessage(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({ error: "number and message required" });
    }

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await waSendMessage(userId, sessionId, number, {
      text: message,
    });

    res.json({
      success: true,
      message: result.key,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────── MY INFO ───────────────── */
export async function getMyInfo(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const info = await waGetMyInfo(userId, sessionId);

    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────── LOGOUT ───────────────── */
export async function logoutSession(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await waLogout(userId, sessionId);

    session.status = "LOGGED_OUT";
    await session.save();

    res.json({
      success: true,
      message: "Session logged out",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
/* ───────────────── DELETE ───────────────── */
export async function deleteSession(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userId = req.user._id.toString();
    const { sessionId } = req.params;

    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await waClear(userId, sessionId);

    res.json({
      success: true,
      message: "Session logged out",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────── SESSION LIST ───────────────── */

export async function getSessionList(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userId = req.user._id.toString();
    const sessions = await sessionModel
      .find({ user: userId })
      .select("_id status apiKey webhookUrl fallbackEnabled fallbackMessage")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function setWebhook(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  const { webhookUrl } = req.body;

  // Validate webhook URL if provided
  if (webhookUrl && webhookUrl.trim()) {
    try {
      new URL(webhookUrl);
    } catch (e) {
      return res.status(400).json({ error: "Invalid webhook URL format" });
    }
  }

  try {
    const userId = req.user._id.toString();
    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.webhookUrl = webhookUrl?.trim() || "";
    await session.save();

    return res.status(200).json({
      success: true,
      message: webhookUrl ? "Webhook URL updated successfully" : "Webhook URL cleared",
      webhookUrl: session.webhookUrl
    });
  } catch (error) {
    console.error("Webhook setup error:", error);
    return res.status(500).json({ error: "Failed to update webhook URL" });
  }
}

export async function setFallback(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  const { fallbackEnabled, fallbackMessage } = req.body;

  try {
    const userId = req.user._id.toString();
    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.fallbackEnabled = fallbackEnabled === true || fallbackEnabled === "true";
    session.fallbackMessage = fallbackMessage?.trim() || "";
    await session.save();

    return res.status(200).json({
      success: true,
      message: "Fallback settings updated successfully",
      fallbackEnabled: session.fallbackEnabled,
      fallbackMessage: session.fallbackMessage
    });
  } catch (error) {
    console.error("Fallback setup error:", error);
    return res.status(500).json({ error: "Failed to update fallback settings" });
  }
}

export async function setHistory(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { sessionId } = req.params;
  if (!sessionId) {
    res.status(404).json({ error: "Session not found" });
  }
  try {
    const userId = req.user._id.toString();
    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
    }
    if (session.user.toString() !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const messages = await Message.find({ session: sessionId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/* ───────────────── AI SETTINGS ───────────────── */
export async function setAiSettings(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  const { aiEnabled, openAiKey, aiPrompt } = req.body;

  try {
    const userId = req.user._id.toString();
    const session = await sessionModel.findOne({
      _id: sessionId,
      user: userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.aiEnabled = aiEnabled === true || aiEnabled === "true";
    session.openAiKey = openAiKey?.trim() || "";
    session.aiPrompt = aiPrompt?.trim() || "";
    await session.save();

    return res.status(200).json({
      success: true,
      message: "AI settings updated successfully",
      aiEnabled: session.aiEnabled,
      openAiKey: session.openAiKey,
      aiPrompt: session.aiPrompt
    });
  } catch (error) {
    console.error("AI setup error:", error);
    return res.status(500).json({ error: "Failed to update AI settings" });
  }
}

/* ───────────────── ANALYTICS ───────────────── */
export async function getAnalytics(req, res) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userId = req.user._id.toString();

    // Past 7 Days Graph
    const labels = [];
    const messageCounts = [];
    const campaignCounts = [];

    // Aggregate Messages
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    
    // Create an array mapping for the last 7 days natively
    for (let i = 6; i >= 0; i--) {
       const date = new Date(startOfToday);
       date.setDate(date.getDate() - i);
       
       const nextDate = new Date(date);
       nextDate.setDate(date.getDate() + 1);
       
       labels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
       
       // Count Messages exactly on this day
       const msgCount = await Message.countDocuments({
          user: userId,
          createdAt: { $gte: date, $lt: nextDate }
       });
       messageCounts.push(msgCount);
       
       // Count Campaigns activated this day
       const campCount = await Campaign.countDocuments({
          user: userId,
          createdAt: { $gte: date, $lt: nextDate }
       });
       campaignCounts.push(campCount);
    }

    res.json({
       success: true,
       labels,
       datasets: [
         { label: "Messages Sent", data: messageCounts, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)" },
         { label: "Campaigns Run", data: campaignCounts, borderColor: "#6366f1", backgroundColor: "rgba(99, 102, 241, 0.1)" }
       ]
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ───────────────── INBOX ───────────────── */
export async function getInbox(req, res) {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 30, session, msgType } = req.query;

    const filter = { user: userId, direction: "received" };
    if (session) filter.session = session;
    if (msgType) filter.msgType = msgType;

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate("session", "_id status");

    const total = await Message.countDocuments(filter);

    res.json({ success: true, messages, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
