import express from "express";
import { getRules, addRule, deleteRule, toggleRule } from "../controllers/autoReplyController.js";

const autoReplyRouter = express.Router();

autoReplyRouter.get("/", getRules);
autoReplyRouter.post("/", addRule);
autoReplyRouter.put("/:id/toggle", toggleRule);
autoReplyRouter.delete("/:id", deleteRule);

export default autoReplyRouter;
