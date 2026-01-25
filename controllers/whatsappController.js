import { sendMessage, getGroupList } from "../lib/whatsapp.js";
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

    const { number, message, group } = req.body;
    if ((!number && !group) || !message) {
      return res.status(400).json({ error: "number and message are required" });
    }

    const isGroup = group ? true : false;

    const result = await sendMessage(
      session.user,
      session._id,
      number || group,
      {
        text: message,
      },
      isGroup,
    );

    return res.json({
      success: true,
      message: result || null,
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

    const { number, group, caption, viewOnce = false } = req.body;

    if (!number && !group) {
      return res.status(400).json({ error: "number or group is required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const jid = number || group;
    const isGroup = Boolean(group);

    const results = [];

    // send all images

    for (const file of req.files) {
      //check if the file is an image
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "File is not an image" });
      }
      const result = await sendMessage(
        session.user,
        session._id,
        jid,
        {
          image: file.buffer,
          caption: caption || "",
          viewOnce,
        },
        isGroup,
      );

      results.push(result);

      // small delay to avoid WhatsApp rate limits / bans
      await new Promise((r) => setTimeout(r, 500));
    }

    return res.json({
      success: true,
      sent: req.files.length,
      messages: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function sendVideo(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }

    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { number, group, caption, gif = false, viewOnce = false } = req.body;

    if (!number && !group) {
      return res.status(400).json({ error: "number or group is required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No videos uploaded" });
    }

    const jid = number || group;
    const isGroup = Boolean(group);
    const results = [];

    for (const file of req.files) {
      // Optional: validate video mimetype
      if (!file.mimetype.startsWith("video/")) continue;

      const result = await sendMessage(
        session.user,
        session._id,
        jid,
        {
          video: file.buffer,
          caption: caption || "",
          gifPlayback: gif, // true if you want to send as GIF
          viewOnce,
        },
        isGroup,
      );

      results.push(result);

      // anti-ban delay
      await new Promise((r) => setTimeout(r, 500));
    }

    return res.json({
      success: true,
      sent: results.length,
      messages: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function sendAudio(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }

    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { number, group, voice = false } = req.body;

    if (!number && !group) {
      return res.status(400).json({ error: "number or group is required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No audio files uploaded" });
    }

    const jid = number || group;
    const isGroup = Boolean(group);
    const results = [];

    for (const file of req.files) {
      // optional: validate audio MIME type
      if (!file.mimetype.startsWith("audio/")) continue;

      const result = await sendMessage(
        session.user,
        session._id,
        jid,
        {
          audio: file.buffer,
          mimetype: file.mimetype,
          ptt: voice === true, // true = WhatsApp voice note
        },
        isGroup,
      );

      results.push(result);

      // small delay to avoid WhatsApp temporary ban
      await new Promise((r) => setTimeout(r, 500));
    }

    return res.json({
      success: true,
      sent: results.length,
      messages: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function sendFile(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }

    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { number, group, caption } = req.body;

    if (!number && !group) {
      return res.status(400).json({ error: "number or group is required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const jid = number || group;
    const isGroup = Boolean(group);
    const results = [];

    for (const file of req.files) {
      const result = await sendMessage(
        session.user,
        session._id,
        jid,
        {
          document: file.buffer, // send any file
          mimetype: file.mimetype, // MIME type
          fileName: file.originalname, // original filename
          caption: caption || "",
        },
        isGroup,
      );

      results.push(result);

      // small delay to avoid WhatsApp temporary ban
      await new Promise((r) => setTimeout(r, 500));
    }

    return res.json({
      success: true,
      sent: results.length,
      messages: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function giveReaction(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    const { number, group, messageKey, emoji } = req.body;

    if (!apiKey) return res.status(400).json({ error: "x-api-key required" });
    if (!messageKey || !emoji)
      return res.status(400).json({ error: "messageKey and emoji required" });
    if (!number && !group)
      return res.status(400).json({ error: "number or group required" });

    const session = await sessionModel.findOne({ apiKey });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const jid = number || group;
    const isGroup = Boolean(group);

    await sendMessage(
      session.user,
      session._id,
      jid,
      {
        reaction: {
          text: emoji,
          key: messageKey,
        },
      },
      isGroup,
    );

    return res.json({ success: true, message: "Reaction sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
export async function sendPoll(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    const {
      number,
      group,
      name,
      values,
      selectableCount = 1,
      toAnnouncementGroup = false,
    } = req.body;

    if (!apiKey) return res.status(400).json({ error: "x-api-key required" });
    if (
      (!number && !group) ||
      !name ||
      !values ||
      !Array.isArray(values) ||
      values.length < 2
    ) {
      return res.status(400).json({
        error: "number/group, name, and at least 2 values are required",
      });
    }

    const session = await sessionModel.findOne({ apiKey });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const jid = number || group;
    const isGroup = Boolean(group);

    const result = await sendMessage(
      session.user,
      session._id,
      jid,
      {
        poll: {
          name,
          values,
          selectableCount,
          toAnnouncementGroup,
        },
      },
      isGroup,
    );

    return res.json({ success: true, message: "Poll sent", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

// {
//     "group":"120363403108780726",
//      "messageKey":{
//                 "remoteJid": "120363403108780726@g.us",
//                 "fromMe": true,
//                 "id": "3EB0A5EF77EAFADBEFF2D6"
//             }
// }
export async function deleteMessage(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    const { number, group, messageKey } = req.body;

    if (!apiKey) return res.status(400).json({ error: "x-api-key required" });
    if (!messageKey)
      return res.status(400).json({ error: "messageKey required" });
    if (!number && !group)
      return res.status(400).json({ error: "number or group required" });

    const session = await sessionModel.findOne({ apiKey });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const jid = number || group;
    const isGroup = Boolean(group);

    await sendMessage(
      session.user,
      session._id,
      jid,
      {
        delete: messageKey,
      },
      isGroup,
    );

    return res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

export async function getGroups(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(400).json({ error: "x-api-key header required" });
    }

    const session = await sessionModel.findOne({ apiKey });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const groups = await getGroupList(session.user, session._id);
    return res.json({ groups });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
}
