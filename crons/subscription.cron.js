import cron from "node-cron";
import User from "../models/userModel.js";
import subscriptions from "../json/subscription.js";

const subscriptionCron = () => {
  // Run every day at 2 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("🔄 Subscription cron job started at", new Date().toISOString());

    try {
      const now = new Date();

      // Find users with active subscriptions that are about to expire (within 7 days)
      const expiringUsers = await User.find({
        "subscription.status": "active",
        "subscription.endDate": { 
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          $gte: now
        }
      });

      console.log(`Found ${expiringUsers.length} users with expiring subscriptions`);

      // Send renewal reminders
      for (const user of expiringUsers) {
        const daysUntilExpiry = Math.ceil(
          (new Date(user.subscription.endDate) - now) / (1000 * 60 * 60 * 24)
        );
        
        console.log(`User ${user.email} subscription expires in ${daysUntilExpiry} days`);
        
        // Here you would typically send email notifications
        // await sendRenewalReminder(user.email, daysUntilExpiry);
      }

      // Find users with expired subscriptions
      const expiredUsers = await User.find({
        "subscription.status": "active",
        "subscription.endDate": { $lt: now }
      });

      console.log(`Found ${expiredUsers.length} users with expired subscriptions`);

      for (const user of expiredUsers) {
        const sub = user.subscription;
        const plan = subscriptions.plans.find(p => p.id === sub.id);

        if (!plan) {
          user.subscription.status = "expired";
          await user.save();
          console.log(`⛔ Plan not found, expired: ${user.email}`);
          continue;
        }

        if (sub.autoRenew) {
          // Calculate renewal price
          let renewalPrice = plan.price;
          if (sub.billingCycle === 'yearly') {
            renewalPrice = Math.round(plan.price * 12 * 0.8);
          }

          if (user.balance >= renewalPrice) {
            // Process auto-renewal
            user.balance -= renewalPrice;

            const newStart = sub.endDate;
            const newEnd = new Date(newStart);
            
            if (sub.billingCycle === 'yearly') {
              newEnd.setFullYear(newEnd.getFullYear() + 1);
            } else {
              newEnd.setMonth(newEnd.getMonth() + 1);
            }

            user.subscription = {
              ...user.subscription,
              startDate: newStart,
              endDate: newEnd,
              lastRenewal: now,
              status: "active"
            };

            // Record payment
            const payment = {
              reference: `AUTO-REN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              date: now,
              amount: renewalPrice,
              plan: plan.name,
              type: 'auto-renewal',
              status: 'completed',
              billingCycle: sub.billingCycle
            };
            
            if (!user.paymentHistory) user.paymentHistory = [];
            user.paymentHistory.push(payment);

            await user.save();
            console.log(`✅ Auto-renewed: ${user.email}`);
            
            // Send renewal confirmation email
            // await sendRenewalConfirmation(user.email, plan.name, renewalPrice);
            
          } else {
            // Insufficient balance
            user.subscription.status = "expired";
            user.subscription.autoRenew = false;
            
            await user.save();
            console.log(`⛔ Insufficient balance, expired: ${user.email}`);
            
            // Send insufficient balance notification
            // await sendInsufficientBalanceNotification(user.email, plan.name, renewalPrice);
          }
        } else {
          // Auto-renew disabled
          user.subscription.status = "expired";
          await user.save();
          console.log(`⛔ Auto-renew disabled, expired: ${user.email}`);
          
          // Send expiration notification
          // await sendExpirationNotification(user.email, plan.name);
        }
      }

      // Handle downgraded subscriptions (process at end of billing cycle)
      const downgradedUsers = await User.find({
        "subscription.status": "downgrade_pending",
        "subscription.endDate": { $lte: now }
      });

      for (const user of downgradedUsers) {
        // Apply downgrade
        user.subscription.status = "active";
        user.subscription.id = user.subscription.downgradeTo;
        delete user.subscription.downgradeTo;
        delete user.subscription.downgradePending;
        
        await user.save();
        console.log(`🔄 Downgrade applied: ${user.email}`);
      }

      console.log("✅ Subscription cron job completed");
    } catch (err) {
      console.error("❌ Subscription cron error:", err.message);
      console.error(err.stack);
    }
  });

  // Run every hour to check for failed payments
  cron.schedule("0 * * * *", async () => {
    console.log("🔄 Payment retry cron job started");
    
    try {
      const users = await User.find({
        "subscription.status": "payment_failed",
        "subscription.lastPaymentAttempt": { 
          $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
        }
      });

      for (const user of users) {
        console.log(`Retrying payment for user: ${user.email}`);
        // Implement payment retry logic here
        // This would typically involve retrying the failed payment
      }
    } catch (err) {
      console.error("❌ Payment retry cron error:", err.message);
    }
  });
};

export default subscriptionCron;