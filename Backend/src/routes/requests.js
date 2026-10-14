const express = require("express");
const mongoose = require("mongoose");
const FriendRequest = require("../models/FriendRequest");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

function serializeRequest(request, direction) {
  const person = direction === "incoming" ? request.from : request.to;
  return {
    id: request.id,
    status: request.status,
    createdAt: request.createdAt,
    user: { id: person.id, username: person.username },
  };
}

router.get("/", async (req, res, next) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      FriendRequest.find({ to: req.user.id, status: "pending" })
        .populate("from", "username")
        .sort({ createdAt: -1 }),
      FriendRequest.find({ from: req.user.id, status: "pending" })
        .populate("to", "username")
        .sort({ createdAt: -1 }),
    ]);
    return res.json({
      incoming: incoming.map((request) => serializeRequest(request, "incoming")),
      outgoing: outgoing.map((request) => serializeRequest(request, "outgoing")),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const username =
      typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ message: "Enter a valid username." });
    }

    const target = await User.findOne({ username }).select("_id username");
    if (!target) return res.status(404).json({ message: "No account found with that username." });
    if (target.id === req.user.id) {
      return res.status(400).json({ message: "You cannot send a request to yourself." });
    }

    const previous = await FriendRequest.findOne({
      $or: [
        { from: req.user.id, to: target.id },
        { from: target.id, to: req.user.id },
      ],
    });

    if (previous?.status === "accepted") {
      return res.status(409).json({ message: "You are already connected." });
    }
    if (previous?.status === "pending" && String(previous.to) === req.user.id) {
      return res.status(409).json({ message: "This person has already sent you a request. Check incoming requests." });
    }
    if (previous?.status === "pending") {
      return res.status(409).json({ message: "Your connection request is already pending." });
    }

    if (previous) await previous.deleteOne();
    const request = await FriendRequest.create({ from: req.user.id, to: target.id });
    const io = req.app.get("io");
    io.to(`user:${target.id}`).emit("request:new", {
      id: request.id,
      user: { id: req.user.id, username: req.user.username },
    });
    return res.status(201).json({ message: `Request sent to @${target.username}.` });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Your connection request is already pending." });
    }
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid request." });
    }
    const { action } = req.body;
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Choose accept or reject." });
    }

    const request = await FriendRequest.findOne({
      _id: req.params.id,
      to: req.user.id,
      status: "pending",
    }).populate("from", "username");
    if (!request) {
      return res.status(404).json({ message: "That pending request was not found." });
    }

    request.status = action === "accept" ? "accepted" : "rejected";
    await request.save();

    let conversation;
    if (action === "accept") {
      conversation = await Conversation.findOne({
        participants: { $all: [req.user.id, request.from.id], $size: 2 },
        $or: [{ isGroup: false }, { isGroup: { $exists: false } }],
      });
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user.id, request.from.id],
          isGroup: false,
        });
      }
    }

    const io = req.app.get("io");
    io.to(`user:${req.user.id}`).emit("request:updated");
    io.to(`user:${request.from.id}`).emit("request:updated");
    if (conversation) {
      io.to(`user:${request.from.id}`).emit("friend:accepted");
      io.to(`user:${req.user.id}`).emit("friend:accepted");
    }

    return res.json({
      message: action === "accept" ? "Connection accepted. You can start chatting!" : "Request declined.",
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
