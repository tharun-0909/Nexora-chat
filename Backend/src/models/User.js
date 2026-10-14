const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

module.exports = mongoose.model("User", userSchema);
