const express = require("express");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const Conversation = require("../models/Conversation");
const FriendRequest = require("../models/FriendRequest");
const Message = require("../models/Message");
const User = require("../models/User");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(file.mimetype)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
});

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function handleUploadError(upload, field, sizeMessage) {
  return (req, res, next) => {
    upload.single(field)(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: sizeMessage });
        }
        return res.status(400).json({ message: "Choose one file to send." });
      }
      if (error) return next(error);
      return next();
    });
  };
}

function broadcastMessage(req, conversation, payload, notificationText) {
  const io = req.app.get("io");
  const onlineUsers = req.app.get("onlineUsers");
  io.to(`conversation:${conversation.id}`).emit("message:new", payload);
  io.to(`user:${req.user.id}`).emit("conversation:updated", {
    conversationId: conversation.id,
  });
  conversation.participants
    .filter((participant) => String(participant) !== req.user.id)
    .forEach((participant) => {
      const participantId = String(participant);
      io.to(`user:${participantId}`).emit("conversation:updated", {
        conversationId: conversation.id,
      });
      if (onlineUsers.has(participantId)) {
        io.to(`user:${participantId}`).emit("message:notification", {
          conversationId: conversation.id,
          conversationName: conversation.isGroup ? conversation.name : null,
          senderUsername: req.user.username,
          text: notificationText,
          isGroup: Boolean(conversation.isGroup),
        });
      }
    });
}

function getAdminIds(conversation) {
  const admins = (conversation.admins || []).map(String);
  if (conversation.createdBy) admins.push(String(conversation.createdBy));
  return [...new Set(admins)];
}

function isGroupAdmin(conversation, userId) {
  return getAdminIds(conversation).includes(userId);
}

async function findKnownContacts(userId) {
  const [requests, directConversations] = await Promise.all([
    FriendRequest.find({
      status: { $in: ["pending", "accepted"] },
      $or: [{ from: userId }, { to: userId }],
    }).select("from to"),
    Conversation.find({
      participants: userId,
      $or: [{ isGroup: false }, { isGroup: { $exists: false } }],
    }).select("participants"),
  ]);
    const contacts = new Map();
    const addContact = (id, source) => {
      const contactId = String(id);
      if (contactId === String(userId)) return;
      const sources = contacts.get(contactId) || new Set();
      sources.add(source);
      contacts.set(contactId, sources);
    };
    requests.forEach((request) => {
      const friendId = String(request.from) === String(userId) ? request.to : request.from;
      addContact(friendId, "request");
    });
    directConversations.forEach((conversation) => {
      conversation.participants.forEach((participant) => {
        addContact(participant, "conversation");
      });
    });
    return contacts;
}

async function notifyGroupUpdated(req, conversation) {
  const io = req.app.get("io");
  conversation.participants.forEach((participant) => {
    io.to(`user:${participant}`).emit("conversation:updated", {
      conversationId: conversation.id,
    });
  });
}

router.get("/friends", async (req, res, next) => {
  try {
    const knownContacts = await findKnownContacts(req.user._id);

    const friends = await User.find({ _id: { $in: [...knownContacts.keys()] } })
      .select("_id username")
      .sort({ username: 1 });
    return res.json({
      friends: friends.map((friend) => ({
        id: friend.id,
        username: friend.username,
        sources: [...knownContacts.get(friend.id)],
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/member-candidates", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      isGroup: true,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!isGroupAdmin(conversation, req.user.id)) {
      return res.status(403).json({ message: "Only group admins can view addable members." });
    }
    const knownContacts = await findKnownContacts(req.user._id);
    conversation.participants.forEach((participant) => knownContacts.delete(String(participant)));
    const friends = await User.find({ _id: { $in: [...knownContacts.keys()] } })
      .select("_id username")
      .sort({ username: 1 });
    return res.json({
      friends: friends.map((friend) => ({
        id: friend.id,
        username: friend.username,
        sources: [...knownContacts.get(friend.id)],
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/groups", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const memberIds = req.body.memberIds;
    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({ message: "Group name must be between 2 and 50 characters." });
    }
    if (
      !Array.isArray(memberIds) ||
      memberIds.length < 1 ||
      memberIds.length > 49 ||
      memberIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id))
    ) {
      return res.status(400).json({ message: "Choose between 1 and 49 friends for your group." });
    }

    const uniqueMemberIds = [...new Set(memberIds.map((id) => new mongoose.Types.ObjectId(id).toString()))];
    if (uniqueMemberIds.length !== memberIds.length || uniqueMemberIds.includes(req.user.id)) {
      return res.status(400).json({ message: "Choose each friend only once." });
    }

    const knownContacts = await findKnownContacts(req.user._id);
    if (uniqueMemberIds.some((id) => !knownContacts.has(id))) {
      return res.status(403).json({ message: "Groups can only include people you have messaged or exchanged a request with." });
    }

    const conversation = await Conversation.create({
      name,
      isGroup: true,
      createdBy: req.user._id,
      admins: [req.user._id],
      participants: [req.user._id, ...uniqueMemberIds],
    });
    await conversation.populate("participants", "username");

    const payload = {
      id: conversation.id,
      name: conversation.name,
      isGroup: true,
      admins: getAdminIds(conversation),
      participants: conversation.participants.map((participant) => ({
        id: participant.id,
        username: participant.username,
      })),
      lastMessage: null,
      updatedAt: conversation.updatedAt,
    };
    const io = req.app.get("io");
    conversation.participants.forEach((participant) => {
      io.to(`user:${participant.id}`).emit("conversation:updated", {
        conversationId: conversation.id,
      });
    });
    return res.status(201).json({ conversation: payload });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user.id })
      .populate("participants", "username")
      .populate({
        path: "lastMessage",
        select: "text imageUrl fileUrl fileName fileMimeType fileSize sender createdAt readBy",
        populate: { path: "sender", select: "username" },
      })
      .sort({ updatedAt: -1 });

    const unreadCounts = await Message.aggregate([
      {
        $match: {
          conversation: { $in: conversations.map((conversation) => conversation._id) },
          sender: { $ne: req.user._id },
          readBy: { $ne: req.user._id },
        },
      },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);
    const unreadCountByConversation = new Map(
      unreadCounts.map(({ _id, count }) => [String(_id), count])
    );

    return res.json({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        isGroup: conversation.isGroup,
        admins: getAdminIds(conversation),
        participants: conversation.participants.map((user) => ({
          id: user.id,
          username: user.username,
        })),
        lastMessage: conversation.lastMessage
          ? {
              text: conversation.lastMessage.text,
              imageUrl: conversation.lastMessage.imageUrl,
              fileUrl: conversation.lastMessage.fileUrl,
              fileName: conversation.lastMessage.fileName,
              senderId: conversation.lastMessage.sender.id,
              createdAt: conversation.lastMessage.createdAt,
              readBy: conversation.lastMessage.readBy.map(String),
            }
          : null,
        unreadCount: unreadCountByConversation.get(conversation.id) || 0,
        updatedAt: conversation.updatedAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/members", async (req, res, next) => {
  try {
    const memberIds = req.body.memberIds;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group." });
    }
    if (
      !Array.isArray(memberIds) ||
      memberIds.length < 1 ||
      memberIds.length > 49 ||
      memberIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id))
    ) {
      return res.status(400).json({ message: "Choose between 1 and 49 valid members." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      isGroup: true,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!isGroupAdmin(conversation, req.user.id)) {
      return res.status(403).json({ message: "Only group admins can add members." });
    }

    const uniqueMemberIds = [...new Set(memberIds.map((id) => String(new mongoose.Types.ObjectId(id))))];
    if (uniqueMemberIds.length !== memberIds.length) {
      return res.status(400).json({ message: "Choose each person only once." });
    }
    if (
      uniqueMemberIds.some(
        (id) => id === req.user.id || conversation.participants.some((participant) => String(participant) === id)
      )
    ) {
      return res.status(409).json({ message: "One or more people are already in this group." });
    }
    if (conversation.participants.length + uniqueMemberIds.length > 50) {
      return res.status(400).json({ message: "This group has reached its 50-member limit." });
    }
    const knownContacts = await findKnownContacts(req.user._id);
    if (uniqueMemberIds.some((id) => !knownContacts.has(id))) {
      return res.status(403).json({ message: "You can only add people you have messaged or exchanged a request with." });
    }
    const existingMembers = await User.countDocuments({ _id: { $in: uniqueMemberIds } });
    if (existingMembers !== uniqueMemberIds.length) {
      return res.status(404).json({ message: "One or more accounts could not be found." });
    }

    conversation.participants.push(...uniqueMemberIds.map((id) => new mongoose.Types.ObjectId(id)));
    await conversation.save();
    await notifyGroupUpdated(req, conversation);
    return res.status(200).json({
      message: uniqueMemberIds.length === 1 ? "Member added to the group." : "Members added to the group.",
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/admins/:memberId", async (req, res, next) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.memberId)
    ) {
      return res.status(400).json({ message: "Choose a valid group member." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      isGroup: true,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!isGroupAdmin(conversation, req.user.id)) {
      return res.status(403).json({ message: "Only group admins can promote members." });
    }
    const memberId = String(new mongoose.Types.ObjectId(req.params.memberId));
    if (!conversation.participants.some((id) => String(id) === memberId)) {
      return res.status(404).json({ message: "That person is not a member of this group." });
    }
    conversation.admins = [...new Set([...getAdminIds(conversation), memberId])];
    await conversation.save();
    await notifyGroupUpdated(req, conversation);
    return res.json({ message: "Group admin added." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/admins/:memberId", async (req, res, next) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.memberId)
    ) {
      return res.status(400).json({ message: "Choose a valid group member." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      isGroup: true,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!isGroupAdmin(conversation, req.user.id)) {
      return res.status(403).json({ message: "Only group admins can remove admin roles." });
    }

    const memberId = String(new mongoose.Types.ObjectId(req.params.memberId));
    if (!conversation.participants.some((id) => String(id) === memberId)) {
      return res.status(404).json({ message: "That person is not a member of this group." });
    }
    if (memberId === req.user.id) {
      return res.status(400).json({ message: "You cannot remove your own admin role." });
    }
    if (conversation.createdBy && String(conversation.createdBy) === memberId) {
      return res.status(400).json({ message: "The group creator must remain an admin." });
    }
    if (!getAdminIds(conversation).includes(memberId)) {
      return res.status(409).json({ message: "That person is not a group admin." });
    }

    conversation.admins = (conversation.admins || []).filter(
      (adminId) => String(adminId) !== memberId
    );
    await conversation.save();
    await notifyGroupUpdated(req, conversation);
    return res.json({ message: "Admin role removed." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      isGroup: true,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!isGroupAdmin(conversation, req.user.id)) {
      return res.status(403).json({ message: "Only group admins can delete this group." });
    }

    await Message.deleteMany({ conversation: conversation._id });
    await conversation.deleteOne();
    const io = req.app.get("io");
    io.to(`conversation:${conversation.id}`).emit("conversation:deleted", {
      conversationId: conversation.id,
      name: conversation.name,
    });
    io.in(`conversation:${conversation.id}`).socketsLeave(`conversation:${conversation.id}`);
    conversation.participants.forEach((participant) => {
      io.to(`user:${participant}`).emit("conversation:deleted", {
        conversationId: conversation.id,
        name: conversation.name,
      });
    });
    return res.json({ message: `Group "${conversation.name}" and its messages were deleted for everyone.` });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/messages", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation." });
    }
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user.id,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const messages = await Message.find({ conversation: conversation.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("readBy", "username")
      .lean();
    const readById = (reader) => String(reader._id || reader);
    const unreadIds = messages
      .filter(
        (message) =>
          String(message.sender) !== req.user.id &&
          !message.readBy.some((reader) => readById(reader) === req.user.id)
      )
      .map((message) => message._id);

    if (unreadIds.length) {
      await Message.updateMany(
        { _id: { $in: unreadIds } },
        { $addToSet: { readBy: req.user._id } }
      );
      req.app.get("io").to(`conversation:${conversation.id}`).emit("message:read", {
        conversationId: conversation.id,
        user: { id: req.user.id, username: req.user.username },
        messageIds: unreadIds.map(String),
      });
    }

    return res.json({
      messages: messages.reverse().map((message) => ({
        id: String(message._id),
        conversationId: String(message.conversation),
        senderId: String(message.sender),
        text: message.text,
        imageUrl: message.imageUrl,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileMimeType: message.fileMimeType,
        fileSize: message.fileSize,
        readBy: [
          ...message.readBy.map(readById),
          ...(unreadIds.some((id) => String(id) === String(message._id)) ? [req.user.id] : []),
        ],
        readByUsers: [
          ...message.readBy.map((reader) => ({
            id: readById(reader),
            username: reader.username,
          })),
          ...(unreadIds.some((id) => String(id) === String(message._id))
            ? [{ id: req.user.id, username: req.user.username }]
            : []),
        ],
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation." });
    }
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 4000) {
      return res.status(400).json({ message: "Message must be between 1 and 4,000 characters." });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user.id,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const message = await Message.create({
      conversation: conversation.id,
      sender: req.user.id,
      text,
      readBy: [req.user._id],
    });
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const payload = {
      id: message.id,
      conversationId: conversation.id,
      senderId: req.user.id,
      text: message.text,
      imageUrl: message.imageUrl,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileMimeType: message.fileMimeType,
      fileSize: message.fileSize,
      readBy: [req.user.id],
      readByUsers: [{ id: req.user.id, username: req.user.username }],
      createdAt: message.createdAt,
    };
    broadcastMessage(req, conversation, payload, message.text);
    return res.status(201).json({ message: payload });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/images", (req, res, next) => {
  imageUpload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Images must be 5 MB or smaller." });
      }
      return res.status(400).json({ message: "Choose one image to send." });
    }
    if (error) return next(error);
    return next();
  });
}, async (req, res, next) => {
  let uploadedImage;
  let messageCreated = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Choose a supported photo to send." });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({ message: "Photo uploads are not configured on the server." });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user.id,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    uploadedImage = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "nexora-chat",
          resource_type: "image",
          allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"],
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        }
      ).end(req.file.buffer);
    });

    const message = await Message.create({
      conversation: conversation.id,
      sender: req.user.id,
      text: "",
      imageUrl: uploadedImage.secure_url,
      readBy: [req.user._id],
    });
    messageCreated = true;
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const payload = {
      id: message.id,
      conversationId: conversation.id,
      senderId: req.user.id,
      text: message.text,
      imageUrl: message.imageUrl,
      readBy: [req.user.id],
      readByUsers: [{ id: req.user.id, username: req.user.username }],
      createdAt: message.createdAt,
    };
    broadcastMessage(req, conversation, payload, "Photo");
    return res.status(201).json({ message: payload });
  } catch (error) {
    if (uploadedImage?.public_id && !messageCreated) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.public_id, { resource_type: "image" });
      } catch (cleanupError) {
        console.error("Unable to remove an unreferenced Cloudinary upload:", cleanupError);
      }
    }
    return next(error);
  }
});

router.post("/:id/files", handleUploadError(
  documentUpload,
  "file",
  "Documents must be 10 MB or smaller."
), async (req, res, next) => {
  let uploadedFile;
  let messageCreated = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Choose a supported document to send." });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({ message: "File uploads are not configured on the server." });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user.id,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const fileName = req.file.originalname
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 255) || "document";
    const candidateExtension = fileName.split(".").pop().toLowerCase();
    const extension = /^[a-z0-9]{1,10}$/.test(candidateExtension)
      ? candidateExtension
      : "bin";
    uploadedFile = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "nexora-chat",
          resource_type: "raw",
          public_id: `${randomUUID()}.${extension}`,
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        }
      ).end(req.file.buffer);
    });

    const message = await Message.create({
      conversation: conversation.id,
      sender: req.user.id,
      text: "",
      fileUrl: uploadedFile.secure_url,
      fileName,
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size,
      readBy: [req.user._id],
    });
    messageCreated = true;
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const payload = {
      id: message.id,
      conversationId: conversation.id,
      senderId: req.user.id,
      text: message.text,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileMimeType: message.fileMimeType,
      fileSize: message.fileSize,
      readBy: [req.user.id],
      readByUsers: [{ id: req.user.id, username: req.user.username }],
      createdAt: message.createdAt,
    };
    broadcastMessage(req, conversation, payload, `File: ${fileName}`);
    return res.status(201).json({ message: payload });
  } catch (error) {
    if (uploadedFile?.public_id && !messageCreated) {
      try {
        await cloudinary.uploader.destroy(uploadedFile.public_id, { resource_type: "raw" });
      } catch (cleanupError) {
        console.error("Unable to remove an unreferenced Cloudinary file:", cleanupError);
      }
    }
    return next(error);
  }
});

module.exports = router;
