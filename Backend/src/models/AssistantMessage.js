const mongoose = require("mongoose");

const assistantMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssistantConversation",
      required: true,
      index: true,
    },
    role: { type: String, enum: ["user", "model"], required: true },
    text: { type: String, default: "", maxlength: 8000 },
    attachmentName: { type: String, default: "", maxlength: 255 },
    attachmentType: { type: String, default: "", maxlength: 128 },
    attachmentSize: { type: Number, default: 0 },
    imageData: { type: String, default: "" },
    imageMimeType: { type: String, default: "" },
  },
  { timestamps: true }
);

assistantMessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model("AssistantMessage", assistantMessageSchema);
