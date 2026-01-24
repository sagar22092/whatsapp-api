import { Router } from "express";
import { getQR, newSession, getStatus, sendMessage, getMyInfo, logoutSession, getSessionList } from "../controllers/sessionController.js";

const sessionRouter = Router();

sessionRouter.post("/new", newSession);
sessionRouter.get("/list", getSessionList);
sessionRouter.get("/:sessionId/qr", getQR);
sessionRouter.get("/:sessionId/status", getStatus);
sessionRouter.post("/:sessionId/send", sendMessage);
sessionRouter.get("/:sessionId/info", getMyInfo);
sessionRouter.post("/:sessionId/logout", logoutSession);

export default sessionRouter;
