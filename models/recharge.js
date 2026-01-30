import mongoose from "mongoose";

const rechargeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    
    username: {
      type: String,
      required: true,
      index: true,
    },
    
    amount: {
      type: Number,
      required: true,
      min: 10,
      max: 100000,
    },
    
    bKashNumber: {
      type: String,
      required: true,
      match: /^01[3-9]\d{8}$/, // Bangladeshi mobile number validation
    },
    
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    
    screenshot: {
      type: String, // URL or path to screenshot
      required: true,
    },
    
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who processed the request
    },
    
    processedAt: {
      type: Date,
    },
    
    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Index for faster queries
rechargeSchema.index({ createdAt: -1 });
rechargeSchema.index({ user: 1, status: 1 });

const Recharge = mongoose.models.Recharge || mongoose.model("Recharge", rechargeSchema);

export default Recharge;