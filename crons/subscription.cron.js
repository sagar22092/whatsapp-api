import cron from "node-cron";
import User from "../models/userModel.js";
import subscriptions from "../json/subscription.js";

const subscriptionCron = () => {
  cron.schedule("0 2 * * *", async () => {
    console.log("🔄 Subscription cron started");

    try {
      const now = new Date();

      const users = await User.find({
        "subscription.status": "active",
        "subscription.endDate": { $lte: now },
      });

      for (const user of users) {
        const sub = user.subscription;
        const plan = subscriptions.plans.find(p => p.id === sub.id);

        if (!plan) {
          sub.status = "expired";
          await user.save();
          continue;
        }

        if (sub.autoRenew) {
          if (user.balance < plan.price) {
            sub.status = "expired";
            sub.autoRenew = false;
            await user.save();
            continue;
          }

          user.balance -= plan.price;

          const newStart = sub.endDate;
          const newEnd = new Date(newStart);
          newEnd.setMonth(newEnd.getMonth() + 1);

          user.subscription = {
            id: plan.id,
            startDate: newStart,
            endDate: newEnd,
            autoRenew: true,
            status: "active",
          };

          await user.save();
          console.log(`✅ Renewed: ${user.email}`);
        } else {
          sub.status = "expired";
          await user.save();
          console.log(`⛔ Expired: ${user.email}`);
        }
      }

      console.log("✅ Subscription cron finished");
    } catch (err) {
      console.error("❌ Subscription cron error:", err.message);
    }
  });
};

export default subscriptionCron;
