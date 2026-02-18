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
      .select("_id status apiKey webhookUrl")
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
    const { webhookUrl } = req.body;
    session.webhookUrl = webhookUrl;
    await session.save();
    res.json({ success: true });
  } catch (error) {}
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
    const messages = await Message.find({ session: sessionId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
