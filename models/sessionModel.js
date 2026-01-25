import mongoose from "mongoose";

const sessionModel = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
    },
    apiKey: {
      type: String,
      default: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      unique: true,
    },
    webhookUrl: {
      type: String,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Session", sessionModel);
