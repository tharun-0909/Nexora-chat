const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 50 },
    isGroup: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
