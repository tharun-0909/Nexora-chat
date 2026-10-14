const express = require("express");
const User = require("../models/User");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/search", async (req, res, next) => {
  try {
    const username =
      typeof req.query.username === "string" ? req.query.username.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ message: "Enter a valid username." });
    }
    if (username === req.user.username) {
      return res.status(400).json({ message: "That is your own username." });
    }

    const user = await User.findOne({ username }).select("_id username");
    if (!user) return res.status(404).json({ message: "No account found with that username." });
    return res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
