import subscriptions from "../json/subscription.js";
export async function getSubscriptionList(req, res) {
  try {
    return res.status(200).json({ subscriptions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
