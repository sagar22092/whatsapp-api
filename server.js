import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";

//env config
import "dotenv/config";

import authRouter from "./routers/authRouter.js";
import connectDB from "./lib/mongodb.js";
import { authenticate } from "./middlewares/authMiddleware.js";
import sessionRouter from "./routers/sessionRouter.js";
import whatsappRouter from "./routers/whatsappRouter.js";
import subscriptionRouter from "./routers/subscriptionRouter.js";
import startCrons from "./crons/index.js";
import { subscriptionMiddleware } from "./middlewares/subscriptionMiddleware.js";
import rechargeRouter from "./routers/rechargeRouter.js";

const app = express();
await connectDB();

// 🔥 Start all cron jobs
startCrons();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(morgan("dev"));

/* ───────── API ───────── */
app.use("/api/auth", authenticate, authRouter);
app.use("/api/session", authenticate, sessionRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/subscription", authenticate, subscriptionRouter);
app.use("/api/recharge", authenticate, rechargeRouter);

app.get("/", authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});
app.get("/doc", (req, res) =>
  res.sendFile(path.join(__dirname, "views", "api-doc.html")),
);
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

app.get("/sessions", authenticate, (req, res) => {
  if (req.user) {
    res.sendFile(path.join(__dirname, "views", "sessions.html"));
  } else {
    return res.redirect("/login");
  }
});
app.get("/recharge", authenticate, (req, res) => {
  if (req.user) {
    res.sendFile(path.join(__dirname, "views", "recharge.html"));
  } else {
    return res.redirect("/login");
  }
});
app.get("/recharge/history", authenticate, (req, res) => {
  if (req.user) {
    res.sendFile(path.join(__dirname, "views", "history/recharge.html"));
  } else {
    return res.redirect("/login");
  }
});
app.get("/profile", authenticate, (req, res) => {
  if (req.user) {
    res.sendFile(path.join(__dirname, "views", "profile.html"));
  } else {
    return res.redirect("/login");
  }
});
app.get("/subscriptions", authenticate, (req, res) => {
  if (req.user) {
    res.sendFile(path.join(__dirname, "views", "subscriptions.html"));
  } else {
    return res.redirect("/login");
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Express Server running → http://localhost:${PORT}`);
});
