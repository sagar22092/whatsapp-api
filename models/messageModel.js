import mongoose, { Types } from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    session: { type: Types.ObjectId, ref: "Session", required: true },
    message: { type: Object, required: true },
  },
  { timestamps: true },
);

const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
export default Message;
