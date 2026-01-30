import express from "express";
import mongoose from "mongoose";
import User from "../models/user.js";
import Recharge from "../models/recharge.js";

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// Submit a recharge request
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const { amount, bKashNumber, transactionId, screenshot } = req.body;
    
    // Validation
    if (!amount || !bKashNumber || !transactionId || !screenshot) {
      return res.status(400).json({ message: "All fields are required" });
    }
    
    if (amount < 10 || amount > 100000) {
      return res.status(400).json({ message: "Amount must be between 10 and 100,000" });
    }
    
    // Check if transaction ID already exists
    const existingRecharge = await Recharge.findOne({ transactionId });
    if (existingRecharge) {
      return res.status(400).json({ message: "This transaction ID has already been used" });
    }
    
    // Get user info
    const user = await User.findById(req.session.userId);
    
    // Create recharge request
    const recharge = new Recharge({
      user: user._id,
      username: user.username,
      amount,
      bKashNumber,
      transactionId,
      screenshot,
      status: "pending",
    });
    
    await recharge.save();
    
    res.status(201).json({
      success: true,
      message: "Recharge request submitted successfully",
      rechargeId: recharge._id,
    });
  } catch (error) {
    console.error("Recharge submit error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get user's recharge history
router.get("/history", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const recharges = await Recharge.find({ user: req.session.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Recharge.countDocuments({ user: req.session.userId });
    
    res.json({
      success: true,
      recharges,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get recharge history error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ADMIN ROUTES

// Get all pending recharge requests
router.get("/admin/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const recharges = await Recharge.find({ status: "pending" })
      .populate("user", "username email name")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Recharge.countDocuments({ status: "pending" });
    
    res.json({
      success: true,
      recharges,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get pending recharges error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve a recharge request
router.post("/admin/approve/:id", requireAuth, requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { note } = req.body;
    const rechargeId = req.params.id;
    
    // Find the recharge request
    const recharge = await Recharge.findById(rechargeId).session(session);
    
    if (!recharge) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Recharge request not found" });
    }
    
    if (recharge.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: `Recharge request is already ${recharge.status}` });
    }
    
    // Update user's balance
    await User.findByIdAndUpdate(
      recharge.user,
      { $inc: { balance: recharge.amount } },
      { session }
    );
    
    // Update recharge status
    recharge.status = "approved";
    recharge.processedBy = req.session.userId;
    recharge.processedAt = new Date();
    recharge.adminNote = note || "";
    
    await recharge.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Emit real-time notification (if using Socket.io)
    // io.to(`user_${recharge.user}`).emit('rechargeApproved', recharge);
    
    res.json({
      success: true,
      message: "Recharge approved successfully",
      recharge,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Approve recharge error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Reject a recharge request
router.post("/admin/reject/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body;
    const rechargeId = req.params.id;
    
    if (!note) {
      return res.status(400).json({ message: "Rejection note is required" });
    }
    
    const recharge = await Recharge.findById(rechargeId);
    
    if (!recharge) {
      return res.status(404).json({ message: "Recharge request not found" });
    }
    
    if (recharge.status !== "pending") {
      return res.status(400).json({ message: `Recharge request is already ${recharge.status}` });
    }
    
    recharge.status = "rejected";
    recharge.processedBy = req.session.userId;
    recharge.processedAt = new Date();
    recharge.adminNote = note;
    
    await recharge.save();
    
    // Emit real-time notification (if using Socket.io)
    // io.to(`user_${recharge.user}`).emit('rechargeRejected', recharge);
    
    res.json({
      success: true,
      message: "Recharge rejected",
      recharge,
    });
  } catch (error) {
    console.error("Reject recharge error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all recharge requests (admin)
router.get("/admin/all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, fromDate, toDate, username } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    
    if (status && status !== "all") {
      query.status = status;
    }
    
    if (username) {
      query.username = { $regex: username, $options: "i" };
    }
    
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    
    const recharges = await Recharge.find(query)
      .populate("user", "username email name")
      .populate("processedBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Recharge.countDocuments(query);
    
    // Get statistics
    const stats = await Recharge.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);
    
    res.json({
      success: true,
      recharges,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all recharges error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;