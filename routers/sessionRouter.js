import { Router } from "express";
import {
  getQR,
  newSession,
  getStatus,
  sendMessage,
  getMyInfo,
  logoutSession,
  getSessionList,
  getPairCode,
  deleteSession,
  setWebhook,
  setHistory,
} from "../controllers/sessionController.js";

const sessionRouter = Router();

sessionRouter.post("/new", newSession);
sessionRouter.get("/list", getSessionList);
sessionRouter.get("/:sessionId/qr", getQR);
sessionRouter.post("/:sessionId/pairCode", getPairCode);

sessionRouter.get("/:sessionId/status", getStatus);
sessionRouter.post("/:sessionId/send", sendMessage);
sessionRouter.get("/:sessionId/info", getMyInfo);
sessionRouter.post("/:sessionId/logout", logoutSession);
sessionRouter.post("/:sessionId/delete", deleteSession);
sessionRouter.post("/:sessionId/set-webhook", setWebhook);
sessionRouter.get("/:sessionId/message-history", setHistory);

export default sessionRouter;
