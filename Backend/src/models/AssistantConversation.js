const mongoose = require("mongoose");

const assistantConversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    preview: { type: String, default: "", maxlength: 200 },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assistantConversationSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("AssistantConversation", assistantConversationSchema);
