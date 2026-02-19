import cron from "node-cron";
import User from "../models/userModel.js";
import subscriptions from "../json/subscription.js";
import Transaction from "../models/transactionModel.js";

const subscriptionCron = () => {
  // Run every day at 2 AM
  cron.schedule("0 2 * * *", async () => {
    console.log(
      "🔄 Subscription cron job started at",
      new Date().toISOString(),
    );

    try {
      const now = new Date();

      // Find users with active subscriptions that are about to expire (within 7 days)
      const expiringUsers = await User.find({
        "subscription.status": "active",
        "subscription.endDate": {
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          $gte: now,
        },
      });

      console.log(
        `Found ${expiringUsers.length} users with expiring subscriptions`,
      );

      // Send renewal reminders
      for (const user of expiringUsers) {
        const daysUntilExpiry = Math.ceil(
          (new Date(user.subscription.endDate) - now) / (1000 * 60 * 60 * 24),
        );

        console.log(
          `User ${user.email} subscription expires in ${daysUntilExpiry} days`,
        );

        // Here you would typically send email notifications
        // await sendRenewalReminder(user.email, daysUntilExpiry);
      }

      // Find users with expired subscriptions
      const expiredUsers = await User.find({
        "subscription.status": "active",
        "subscription.endDate": { $lt: now },
      });

      console.log(
        `Found ${expiredUsers.length} users with expired subscriptions`,
      );

      for (const user of expiredUsers) {
        const sub = user.subscription;
        const plan = subscriptions.plans.find((p) => p.id === sub.id);

        if (!plan) {
          user.subscription.status = "expired";
          await user.save();
          console.log(`⛔ Plan not found, expired: ${user.email}`);
          continue;
        }

        if (sub.autoRenew) {
          // Calculate renewal price
          let renewalPrice = plan.price;

          if (user.balance >= renewalPrice) {
            // Process auto-renewal
            user.balance -= renewalPrice;

            const newStart = sub.endDate;
            const newEnd = new Date(newStart);

            newEnd.setMonth(newEnd.getMonth() + 1);

            user.subscription = {
              ...user.subscription,
              startDate: newStart,
              endDate: newEnd,
              lastRenewal: now,
              status: "active",
            };

            // Record payment
            await Transaction.create({
              user: user._id,
              amount: renewalPrice,
              type: "debit",
              by: "subscription_auto_renewal",
            });

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
    } catch (err) {
      console.error("❌ Subscription cron error:", err.message);
      console.error(err.stack);
    }
  });
};

export default subscriptionCron;
