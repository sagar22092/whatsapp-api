import express from "express";
import cors from "cors";
import path from "path";
import qrcode from "qrcode";
import { connectWhatsApp, getQRCode, sendMessage } from "./lib/whatsapp.js";

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public
app.use(express.static(path.join(path.resolve(), "public")));

const TEST_USER = "testuser";

// Connect test user on server start
connectWhatsApp(TEST_USER).catch(console.error);

// API to get QR code
app.get("/api/qr/:userId", async (req, res) => {
  const qr = getQRCode(req.params.userId);
  if (!qr) return res.json({ qr: null });

  qrcode.toDataURL(qr, (err, url) => {
    if (err) return res.json({ qr: null });
    res.json({ qr: url });
  });
});

// API to send message
app.post("/api/send", async (req, res) => {
  const { userId, number, message } = req.body;
  try {
    await sendMessage(userId, number, message);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(path.resolve(), "public", "index.html"));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
