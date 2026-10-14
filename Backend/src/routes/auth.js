const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authenticate = require("../middleware/auth");

const router = express.Router();

function createToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function serializeUser(user) {
  return { id: user.id, email: user.email, username: user.username };
}

router.post("/register", async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const username =
      typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({
        message: "Username must be 3–24 characters and use only letters, numbers, and underscores.",
      });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ message: "Password must be between 8 and 72 characters." });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(409).json({
        message: existing.email === email
          ? "An account already uses that email address."
          : "That username is already taken.",
      });
    }

    const user = await User.create({
      email,
      username,
      passwordHash: await bcrypt.hash(password, 12),
    });
    return res.status(201).json({ token: createToken(user), user: serializeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const message = duplicateField === "email"
        ? "An account already uses that email address."
        : "That username is already taken.";
      return res.status(409).json({ message });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const usesLegacyUsername = !email.includes("@");
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = await User.findOne(
      usesLegacyUsername ? { username: email } : { email }
    ).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Incorrect username or password." });
    }

    return res.json({ token: createToken(user), user: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

module.exports = router;
