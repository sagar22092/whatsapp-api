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
      unique: true,
    },
    webhookUrl: {
      type: String,
    },
  },
  { timestamps: true },
);
sessionModel.pre("save", function () {
  if (!this.apiKey) {
    this.apiKey = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
});

const Session = mongoose.models.Session || mongoose.model("Session", sessionModel);
export default Session;
