import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * Example subscription tiers:
 * Free: 30 requests per hour
 * Pro: 100 requests per hour
 * Premium: 500 requests per hour
 */
const subscriptionLimits = {
  FREE: { points: 30, duration: 3600 },      // 30 requests per hour
  PRO: { points: 100, duration: 3600 },      // 100 requests per hour
  PREMIUM: { points: 500, duration: 3600 },  // 500 requests per hour
};

// Memory store per user
const limiters = {};

/**
 * rateLimitMiddleware(user) 
 * @param req.user should exist { _id, subscription }
 */
export function rateLimitMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = req.user._id.toString();
  const subscription = req.user.subscription || "FREE";

  // Create limiter per user if it doesn't exist
  if (!limiters[userId]) {
    const { points, duration } = subscriptionLimits[subscription] || subscriptionLimits["FREE"];
    limiters[userId] = new RateLimiterMemory({ points, duration });
  }

  const limiter = limiters[userId];

  limiter.consume(1)
    .then(() => {
      next(); // Allowed
    })
    .catch(() => {
      const retrySecs = Math.ceil(limiter.msBeforeNext / 1000) || 1;
      res.set("Retry-After", String(retrySecs));
      res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${retrySecs} seconds.`,
      });
    });
}
