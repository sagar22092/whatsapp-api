import mongoose from "mongoose";

const rechargeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 10,
      max: 100000,
    },

    number: {
      type: String,
      required: true,
      match: /^01[3-9]\d{8}$/, // Bangladeshi mobile number validation
    },
    method: {
      type: String,
      required: true,
    },

    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

// Index for faster queries
rechargeSchema.index({ createdAt: -1 });
rechargeSchema.index({ user: 1, status: 1 });

const Recharge =
  mongoose.models.Recharge || mongoose.model("Recharge", rechargeSchema);

export default Recharge;
