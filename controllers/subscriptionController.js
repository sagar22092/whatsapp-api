import subscriptions from "../json/subscription.js";
import Transaction from "../models/transactionModel.js";
import Session from "../models/sessionModel.js";

export async function getSubscriptionList(req, res) {
  try {
    return res.status(200).json({ subscriptions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function getCurrentSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    if (!user.subscription) {
      return res.status(200).json({
        subscription: null,
        message: "No active subscription",
      });
    }

    const subscription = subscriptions.plans.find(
      (sub) => sub.id === user.subscription.id,
    );

    if (!subscription) {
      return res.status(200).json({
        subscription: null,
        message: "Subscription plan not found",
      });
    }

    // Calculate remaining days
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    const remainingDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    return res.status(200).json({
      subscription: {
        ...subscription,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        autoRenew: user.subscription.autoRenew || false,
        status: user.subscription.status,
        remainingDays: remainingDays > 0 ? remainingDays : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function purchaseSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const { subscriptionId, autoRenew = false } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    const plan = subscriptions.plans.find((p) => p.id === subscriptionId);
    if (!plan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }

    const sessions = await Session.find({ user: user._id });
    if (sessions.length >= plan.sessions) {
      return res.status(400).json({
        error: "Session limit exceeded for this subscription plan delete some sessions to purchase this plan",
        limit: plan.sessions,
        current: sessions.length,
      });
    }
    // Check if user has sufficient balance
    if (user.balance < plan.price) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: plan.price,
        current: user.balance,
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Deduct balance
    user.balance -= plan.price;

    // Set new subscription
    user.subscription = {
      id: plan.id,
      startDate,
      endDate,
      autoRenew,
      status: "active",
    };

    await user.save();

    // Record transaction
    const transaction = await Transaction.create({
      user: user._id,
      amount: plan.price,
      type: "debit",
      description: `Subscription purchase: ${plan.name}`,
      by: "subscription",
    });

    return res.status(200).json({
      message: "Subscription purchased successfully",
      subscription: user.subscription,
      transaction,
      balance: user.balance,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function changeSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const { subscriptionId, autoRenew = false } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    if (!user.subscription) {
      return res.status(400).json({ error: "No active subscription" });
    }

    const newPlan = subscriptions.plans.find((p) => p.id === subscriptionId);
    if (!newPlan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }

    // Check if user has sufficient balance for the new plan
    if (user.balance < newPlan.price) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: newPlan.price,
        current: user.balance,
      });
    }

    // Deduct full price of new plan
    user.balance -= newPlan.price;

    // Set new subscription - start fresh from today for 1 month
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Update subscription
    user.subscription = {
      id: newPlan.id,
      startDate,
      endDate,
      autoRenew,
      status: "active",
    };

    await user.save();

    // Record transaction
    const transaction = await Transaction.create({
      user: user._id,
      amount: newPlan.price,
      type: "debit",
      by: "subscription",
    });

    return res.status(200).json({
      message: "Subscription changed successfully",
      subscription: user.subscription,
      transaction,
      balance: user.balance,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function cancelSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    if (!user.subscription || user.subscription.status !== "active") {
      return res
        .status(400)
        .json({ error: "No active subscription to cancel" });
    }

    user.subscription.autoRenew = false;
    user.subscription.status = "cancelled";

    await user.save();

    return res.status(200).json({
      message: "Subscription cancelled successfully",
      subscription: user.subscription,
      willExpire: user.subscription.endDate,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function renewSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    if (!user.subscription) {
      return res.status(400).json({ error: "No subscription found" });
    }

    // Check if subscription is expired or cancelled
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);

    if (endDate > now) {
      return res.status(400).json({ error: "Subscription is still active" });
    }

    const plan = subscriptions.plans.find((p) => p.id === user.subscription.id);
    if (!plan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }
    const sessions = await Session.find({ user: user._id });
    if (sessions.length >= plan.sessions) {
      return res.status(400).json({
        error: "You have reached the maximum number of sessions",
      });
    }

    if (user.balance < plan.price) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: plan.price,
        current: user.balance,
      });
    }

    // Set new dates
    const startDate = now;
    const newEndDate = new Date(startDate);
    newEndDate.setMonth(newEndDate.getMonth() + 1);

    // Deduct balance
    user.balance -= plan.price;

    // Update subscription
    user.subscription = {
      id: plan.id,
      startDate,
      endDate: newEndDate,
      autoRenew: user.subscription.autoRenew || false,
      status: "active",
    };

    await user.save();

    // Record transaction
    const transaction = await Transaction.create({
      user: user._id,
      amount: plan.price,
      type: "debit",
      by: "subscription",
    });

    return res.status(200).json({
      message: "Subscription renewed successfully",
      subscription: user.subscription,
      transaction,
      balance: user.balance,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function updateAutoRenew(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const { autoRenew } = req.body;

    if (typeof autoRenew !== "boolean") {
      return res.status(400).json({ error: "autoRenew must be boolean" });
    }

    if (!user.subscription) {
      return res.status(400).json({ error: "No subscription found" });
    }

    user.subscription.autoRenew = autoRenew;
    await user.save();

    return res.status(200).json({
      message: `Auto-renew ${autoRenew ? "enabled" : "disabled"} successfully`,
      subscription: user.subscription,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function getPaymentHistory(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      payments: transactions,
      total: transactions.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}


