import express from "express";
import {
  getSubscriptionList,
  getCurrentSubscription,
  purchaseSubscription,
  changeSubscription,
  cancelSubscription,
  renewSubscription,
  updateAutoRenew,
  getPaymentHistory,
  addBalance
} from "../controllers/subscriptionController.js";
import {authenticate as protect} from "../middlewares/authMiddleware.js";

const router = express.Router();

// All routes are protected - require authentication
router.get("/list", protect, getSubscriptionList);
router.get("/current", protect, getCurrentSubscription);
router.post("/purchase", protect, purchaseSubscription);
router.post("/change", protect, changeSubscription);
router.post("/cancel", protect, cancelSubscription);
router.post("/renew", protect, renewSubscription);
router.post("/auto-renew", protect, updateAutoRenew);
router.get("/payments", protect, getPaymentHistory);
router.post("/add-balance", protect, addBalance);

export default router;