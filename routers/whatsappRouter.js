import { Router } from "express";
import { sendText } from "../controllers/whatsappController.js";

const whatsappRouter = Router();



whatsappRouter.post("/send/text", sendText);

export default whatsappRouter;