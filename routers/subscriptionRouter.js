import { Router } from "express";
import {
  getCurrentSubscription,
  getSubscriptionList,
  purchaseSubscription,
} from "../controllers/subscriptionController.js";

const subscriptionRouter = Router();

subscriptionRouter.get("/list", getSubscriptionList);

subscriptionRouter.get("/current", getCurrentSubscription);

subscriptionRouter.post("/purchase", purchaseSubscription);

subscriptionRouter.post("/update", purchaseSubscription);

export default subscriptionRouter;
