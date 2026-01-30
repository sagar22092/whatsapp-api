import { Router } from "express";
import { getSubscriptionList } from "../controllers/subscriptionController.js";

const subscriptionRouter = Router();

subscriptionRouter.get("/list", getSubscriptionList);

// subscriptionRouter.post("/current", );

// subscriptionRouter.get("/purchase", );

export default subscriptionRouter;
