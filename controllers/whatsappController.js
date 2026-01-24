import { sendMessage } from "../lib/whatsapp.js";
import sessionModel from "../models/sessionModel.js";

/**
 * Send a text message via API key
 */
export async function sendText(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }


    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ error: "number and message are required" });
    }


    const result = await sendMessage(session.user, session._id, number, { text: message });

    return res.json({
      success: true,
      message: result.key|| null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function sendPhoto(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }


    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ error: "number and message are required" });
    }


    const result = await sendMessage(session.user, session._id, number, { text: message });

    return res.json({
      success: true,
      message: result.key|| null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}


