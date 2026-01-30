import { Router } from "express";
import {
  getCurrentSubscription,
  getSubscriptionList,
  purchaseSubscription,
} from "../controllers/subscriptionController.js";

const subscriptionRouter = Router();

subscriptionRouter.get("/list", getSubscriptionList);

subscriptionRouter.post("/current", getCurrentSubscription);

subscriptionRouter.get("/purchase", purchaseSubscription);

export default subscriptionRouter;
