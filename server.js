import express from "express";
import {
  initUser,
  getQR,
  getStatus,
  sendMessage,
  logout,
  getMyInfo,
  getChatList,
} from "./lib/whatsapp.js";

//env config
import "dotenv/config";
import authRouter from "./routers/authRouters.js";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./lib/mongodb.js";
import { authenticate } from "./middlewares/authMiddlewares.js";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

/* ───────── API ───────── */
app.use("/api/auth", authRouter);

app.get("/", authenticate, (req, res) => {
  if (!req.user) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/login", authenticate, (req, res) => {
  if (req.user) {
    return res.redirect("/");
  } else {
    res.sendFile(path.join(__dirname, "views", "login.html"));
  }
});

app.get("/register", authenticate, (req, res) => {
  if (req.user) {
    return res.redirect("/");
  } else {
    res.sendFile(path.join(__dirname, "views", "register.html"));
  }
});

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

app.get("/api/chats/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const chats = await getChatList(username);
    res.json({ chats });
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

app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Server running → http://localhost:${PORT}`);
});
