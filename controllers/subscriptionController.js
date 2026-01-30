import subscriptions from "../json/subscription.js";
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
    const subscription = subscriptions.plans.find(
      (sub) => sub.id === user.subscription.id,
    );
    if (!subscription) {
      return res.status(400).json({ error: "Subscription not found" });
    }
    return res.status(200).json({ subscription });
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

    // ✅ Find plan correctly
    const plan = subscriptions.plans.find((p) => p.id === subscriptionId);

    if (!plan) {
      return res.status(400).json({ error: "Subscription not found" });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // monthly billing

    // ✅ Save only schema-valid data
    user.subscription = {
      id: plan.id,
      startDate,
      endDate,
      autoRenew,
      status: "active",
    };

    await user.save();

    return res.status(200).json({
      message: "Subscription purchased successfully",
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        sessions: plan.sessions,
      },
      subscription: user.subscription,
      nextRenewalDate: autoRenew ? endDate : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
