import Recharge from "../models/rechargeModel.js";
import Transaction from "../models/transactionModel.js";

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
        recharge,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
export async function getRecharges(req, res) {
  try {
    const recharges = await Recharge.find({ user: req.user._id }).sort({ createdAt: -1 }) || [];
    return res.status(200).json({ recharges });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
export async function getTransactions(req, res) {
  try {
    const userId = req.user._id;
    const { limit = 5 } = req.query;
    
    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean() || [];
    
    return res.status(200).json({
      transactions: transactions.map(t => ({
        id: t._id,
        amount: t.amount,
        type: t.type,
        by: t.by,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}


