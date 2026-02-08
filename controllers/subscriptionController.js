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
      (sub) => sub.id === user.subscription?.id,
    );
    
    if (!subscription) {
      return res.status(200).json({ 
        subscription: null,
        message: "No active subscription" 
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
        autoRenew: user.subscription.autoRenew,
        status: user.subscription.status,
        remainingDays: remainingDays > 0 ? remainingDays : 0
      }
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

    const { subscriptionId, billingCycle = 'monthly', autoRenew = true } = req.body;
    
    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    const plan = subscriptions.plans.find((p) => p.id === subscriptionId);
    if (!plan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }

    // Calculate price based on billing cycle
    let price = plan.price;
    if (billingCycle === 'yearly') {
      price = Math.round(plan.price * 12 * 0.8); // 20% discount for yearly
    }

    // Check if user has sufficient balance
    if (user.balance < price) {
      return res.status(400).json({ 
        error: "Insufficient balance",
        required: price,
        current: user.balance
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    
    if (billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Deduct balance
    user.balance -= price;
    
    // Update or create subscription
    user.subscription = {
      id: plan.id,
      startDate,
      endDate,
      autoRenew,
      billingCycle,
      status: "active",
      lastRenewal: startDate
    };

    await user.save();

    // Record payment
    const payment = {
      reference: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: startDate,
      amount: price,
      plan: plan.name,
      type: 'new',
      status: 'completed',
      billingCycle
    };
    
    if (!user.paymentHistory) user.paymentHistory = [];
    user.paymentHistory.push(payment);
    await user.save();

    return res.status(200).json({
      message: "Subscription purchased successfully",
      subscription: user.subscription,
      payment,
      balance: user.balance
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function updateSubscription(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const { subscriptionId, changeType = 'upgrade', autoRenew = true } = req.body;
    
    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    if (!user.subscription || user.subscription.status !== 'active') {
      return res.status(400).json({ error: "No active subscription to update" });
    }

    const currentPlan = subscriptions.plans.find(p => p.id === user.subscription.id);
    const newPlan = subscriptions.plans.find(p => p.id === subscriptionId);
    
    if (!currentPlan || !newPlan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }

    // Calculate prorated amount
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    const totalDays = Math.ceil((endDate - user.subscription.startDate) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const dailyRateCurrent = currentPlan.price / 30; // Simplified daily rate
    const dailyRateNew = newPlan.price / 30;
    const proratedAmount = Math.round((dailyRateNew - dailyRateCurrent) * remainingDays);

    let amountToPay = 0;
    if (changeType === 'upgrade' && proratedAmount > 0) {
      amountToPay = proratedAmount;
      
      if (user.balance < amountToPay) {
        return res.status(400).json({ 
          error: "Insufficient balance for upgrade",
          required: amountToPay,
          current: user.balance
        });
      }
      
      user.balance -= amountToPay;
    }

    // Update subscription
    user.subscription = {
      id: newPlan.id,
      startDate: user.subscription.startDate,
      endDate: user.subscription.endDate, // Keep same end date
      autoRenew,
      billingCycle: user.subscription.billingCycle,
      status: "active",
      lastRenewal: user.subscription.lastRenewal
    };

    await user.save();

    // Record payment for upgrade
    if (amountToPay > 0) {
      const payment = {
        reference: `UPG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: now,
        amount: amountToPay,
        plan: newPlan.name,
        type: 'upgrade',
        status: 'completed',
        fromPlan: currentPlan.name,
        toPlan: newPlan.name
      };
      
      if (!user.paymentHistory) user.paymentHistory = [];
      user.paymentHistory.push(payment);
      await user.save();
    }

    return res.status(200).json({
      message: `Subscription ${changeType}d successfully`,
      subscription: user.subscription,
      amountCharged: amountToPay,
      balance: user.balance,
      proratedAmount
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

    if (!user.subscription || user.subscription.status !== 'active') {
      return res.status(400).json({ error: "No active subscription to cancel" });
    }

    user.subscription.autoRenew = false;
    user.subscription.status = 'cancelled';
    
    await user.save();

    return res.status(200).json({
      message: "Subscription cancelled successfully",
      subscription: user.subscription,
      willExpire: user.subscription.endDate
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

    const plan = subscriptions.plans.find(p => p.id === user.subscription.id);
    if (!plan) {
      return res.status(400).json({ error: "Subscription plan not found" });
    }

    let price = plan.price;
    if (user.subscription.billingCycle === 'yearly') {
      price = Math.round(plan.price * 12 * 0.8);
    }

    if (user.balance < price) {
      return res.status(400).json({ 
        error: "Insufficient balance",
        required: price,
        current: user.balance
      });
    }

    const now = new Date();
    const startDate = new Date(user.subscription.endDate);
    const endDate = new Date(startDate);
    
    if (user.subscription.billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Deduct balance
    user.balance -= price;
    
    // Update subscription
    user.subscription = {
      id: plan.id,
      startDate,
      endDate,
      autoRenew: user.subscription.autoRenew,
      billingCycle: user.subscription.billingCycle,
      status: "active",
      lastRenewal: now
    };

    await user.save();

    // Record payment
    const payment = {
      reference: `REN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: now,
      amount: price,
      plan: plan.name,
      type: 'renewal',
      status: 'completed',
      billingCycle: user.subscription.billingCycle
    };
    
    if (!user.paymentHistory) user.paymentHistory = [];
    user.paymentHistory.push(payment);
    await user.save();

    return res.status(200).json({
      message: "Subscription renewed successfully",
      subscription: user.subscription,
      payment,
      balance: user.balance
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
    
    if (typeof autoRenew !== 'boolean') {
      return res.status(400).json({ error: "autoRenew must be boolean" });
    }

    if (!user.subscription) {
      return res.status(400).json({ error: "No subscription found" });
    }

    user.subscription.autoRenew = autoRenew;
    await user.save();

    return res.status(200).json({
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'} successfully`,
      subscription: user.subscription
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

    return res.status(200).json({
      payments: user.paymentHistory || [],
      total: (user.paymentHistory || []).length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function addBalance(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const { amount, paymentMethod = 'manual' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    user.balance += amount;
    await user.save();

    // Record transaction
    const transaction = {
      reference: `DEP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: new Date(),
      amount,
      type: 'deposit',
      method: paymentMethod,
      status: 'completed',
      balanceAfter: user.balance
    };
    
    if (!user.transactions) user.transactions = [];
    user.transactions.push(transaction);
    await user.save();

    return res.status(200).json({
      message: "Balance added successfully",
      balance: user.balance,
      transaction
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}