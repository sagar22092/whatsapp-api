import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    session: { type: String, required: true },
    message: { type: Object, required: true },
  },
  { timestamps: true },
);

const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
export default Message;
