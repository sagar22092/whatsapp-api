import Recharge from "../models/rechargeModel.js";

export async function submitRecharge(req, res) {
  const { amount, bKashNumber, transactionId } = req.body;
  if (!amount || !bKashNumber || !transactionId)
    return res
      .status(400)
      .json({ error: "amount,bKashNumber,transactionId required" });
  try {
    const existingRecharge = await Recharge.findOne({
      transactionId,
    });
    if (existingRecharge) {
      return res.status(400).json({ error: "Transaction ID already exists" });
    }
    
    // Create recharge with the id field you mentioned
    const recharge = await Recharge.create({
      id: `REF-${Date.now().toString().slice(-8)}`, // This is what you want to show
      user: req.user._id,
      amount,
      number: bKashNumber,
      method: "bKash",
      transactionId,
    });
    
    // Return the full recharge object
    return res.status(200).json({ 
      success: true, 
      data: {
        recharge
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}