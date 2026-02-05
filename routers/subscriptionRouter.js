import { Router } from "express";
import {
  getCurrentSubscription,
  getSubscriptionList,
  purchaseSubscription,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
  updateAutoRenew,
  getPaymentHistory,
  addBalance
} from "../controllers/subscriptionController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const subscriptionRouter = Router();

// Public routes
subscriptionRouter.get("/list", getSubscriptionList);

// Protected routes (require authentication)
subscriptionRouter.use(authenticate);

subscriptionRouter.get("/current", getCurrentSubscription);
subscriptionRouter.get("/payments", getPaymentHistory);
subscriptionRouter.post("/purchase", purchaseSubscription);
subscriptionRouter.post("/update", updateSubscription);
subscriptionRouter.post("/cancel", cancelSubscription);
subscriptionRouter.post("/renew", renewSubscription);
subscriptionRouter.post("/auto-renew", updateAutoRenew);
subscriptionRouter.post("/add-balance", addBalance);

export default subscriptionRouter;