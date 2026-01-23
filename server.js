import express from "express";
import {
  initUser,
  getQR,
  getStatus,
  sendMessage,
  logout,
  getMyInfo,
} from "./lib/whatsapp.js";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

/* ───────── API ───────── */

// Init / get QR
app.post("/api/qr", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  try {
    await initUser(username);

    // wait until QR ready or session connected
    const qr = await getQR(username);
    const status = await getStatus(username);

    res.json({ qr, connected: status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Status
app.get("/api/status/:username", async (req, res) => {
  const { username } = req.params;
  const status = await getStatus(username);
  res.json({ connected: status });
});

// Send message
app.post("/api/send", async (req, res) => {
  try {
    const { username, number, message } = req.body;
    const data = await sendMessage(username, number, message);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get my account info
app.get("/api/myinfo/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const info = await getMyInfo(username);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post("/api/logout", async (req, res) => {
  const { username } = req.body;
  try {
    await logout(username);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running → http://localhost:${PORT}`),
);
