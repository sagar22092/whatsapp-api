import { Router } from "express";
import { getRecharges, getTransactions, submitRecharge } from "../controllers/rechargeController.js";



const rechargeRouter = Router();

rechargeRouter.post("/submit", submitRecharge)
rechargeRouter.get("/history", getRecharges)
rechargeRouter.get("/transactions", getTransactions)

export default rechargeRouter;