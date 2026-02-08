import { Router } from "express";
import { submitRecharge } from "../controllers/rechargeController.js";



const rechargeRouter = Router();

rechargeRouter.post("/submit", submitRecharge)

export default rechargeRouter;