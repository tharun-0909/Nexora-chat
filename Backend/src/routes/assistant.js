const express = require("express");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const AssistantConversation = require("../models/AssistantConversation");
const AssistantMessage = require("../models/AssistantMessage");
const authenticate = require("../middleware/auth");

const router = express.Router();
const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_MODEL_MESSAGE_LENGTH = 8000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_HISTORY_CONVERSATIONS = 50;
const MAX_STORED_MESSAGES = 200;
const MAX_STORED_IMAGE_LENGTH = 7 * 1024 * 1024;
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"];
const GENERATED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/csv",
]);
const TEXT_FILE_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".log"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 2, fieldSize: 64 * 1024 },
});

function getRetryAfterSeconds(response, data) {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
    const retryAt = Date.parse(header);
    if (Number.isFinite(retryAt)) return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  }

  const retryDelay = data.error?.details
    ?.map((detail) => detail.retryDelay || detail.metadata?.retryDelay)
    .find((delay) => typeof delay === "string");
  const match = retryDelay?.match(/^(\d+(?:\.\d+)?)(s|ms)$/);
  if (!match) return 60;
  const duration = Number(match[1]);
  return Math.max(1, Math.ceil(match[2] === "ms" ? duration / 1000 : duration));
}

function respondWithRateLimit(res, operation, response, data) {
  const retryAfterSeconds = getRetryAfterSeconds(response, data);
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    message: `Gemini's usage limit for ${operation} has been reached. Wait at least ${retryAfterSeconds} seconds before trying again. If it continues, check this project's quota and billing in Google AI Studio.`,
    retryAfterSeconds,
  });
}

function getConversationTitle(text, attachmentName = "") {
  const title = text.trim() || attachmentName || "New conversation";
  return title.length > 80 ? `${title.slice(0, 77).trimEnd()}...` : title;
}

async function saveAssistantTurn({ userId, conversationId, userMessage, reply, image }) {
  let conversation;
  if (conversationId) {
    if (!mongoose.isValidObjectId(conversationId)) {
      const error = new Error("This assistant conversation is invalid. Start a new chat.");
      error.status = 400;
      throw error;
    }
    conversation = await AssistantConversation.findOne({ _id: conversationId, user: userId });
    if (!conversation) {
      const error = new Error("This assistant conversation was not found. Start a new chat.");
      error.status = 404;
      throw error;
    }
  } else {
    conversation = new AssistantConversation({
      user: userId,
      title: getConversationTitle(userMessage.text, userMessage.attachmentName),
    });
    await conversation.save();
  }

  const storedMessages = [
    {
      conversation: conversation._id,
      role: "user",
      text: userMessage.text.slice(0, MAX_MESSAGE_LENGTH),
      attachmentName: userMessage.attachmentName || "",
      attachmentType: userMessage.attachmentType || "",
      attachmentSize: userMessage.attachmentSize || 0,
    },
    {
      conversation: conversation._id,
      role: "model",
      text: reply,
      ...(image ? { imageData: image.data, imageMimeType: image.mimeType } : {}),
    },
  ];
  await AssistantMessage.insertMany(storedMessages);
  conversation.preview = (reply || userMessage.text || "Shared an attachment").slice(0, 200);
  conversation.messageCount += storedMessages.length;
  conversation.updatedAt = new Date();
  await conversation.save();

  return String(conversation._id);
}

router.use(authenticate);

router.get("/conversations", async (req, res, next) => {
  try {
    const conversations = await AssistantConversation.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(MAX_HISTORY_CONVERSATIONS)
      .select("title preview messageCount updatedAt");
    return res.json({
      conversations: conversations.map((conversation) => ({
        id: String(conversation._id),
        title: conversation.title,
        preview: conversation.preview,
        messageCount: conversation.messageCount,
        updatedAt: conversation.updatedAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/conversations/:conversationId", async (req, res, next) => {
  try {
    const conversation = await AssistantConversation.findOne({
      _id: req.params.conversationId,
      user: req.user._id,
    }).select("title updatedAt");
    if (!conversation) {
      return res.status(404).json({ message: "This assistant conversation was not found." });
    }

    const messages = await AssistantMessage.find({ conversation: conversation._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_STORED_MESSAGES)
      .select("role text attachmentName attachmentType attachmentSize imageData imageMimeType createdAt");
    messages.reverse();
    return res.json({
      conversation: {
        id: String(conversation._id),
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
      messages: messages.map((message) => ({
        id: String(message._id),
        role: message.role,
        text: message.text,
        ...(message.attachmentName ? {
          attachment: {
            name: message.attachmentName,
            type: message.attachmentType,
            size: message.attachmentSize,
          },
        } : {}),
        ...(message.imageData ? {
          image: { data: message.imageData, mimeType: message.imageMimeType },
        } : {}),
      })),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "This assistant conversation is invalid." });
    }
    return next(error);
  }
});

router.post("/chat", (req, res, next) => {
  upload.single("attachment")(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Assistant attachments must be 10 MB or smaller." });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FIELD_VALUE") {
        return res.status(413).json({ message: "The assistant conversation history is too large. Please start a new chat." });
      }
      if (error.code === "LIMIT_FIELD_COUNT") {
        return res.status(400).json({ message: "The assistant request contains unexpected fields." });
      }
      return res.status(400).json({ message: "Attach one file at a time." });
    }
    if (error) return next(error);
    return next();
  });
}, async (req, res, next) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_Api_key;
  if (!apiKey) {
    return res.status(503).json({ message: "The AI assistant is not configured on the server." });
  }

  let messages;
  try {
    messages = typeof req.body.messages === "string"
      ? JSON.parse(req.body.messages)
      : req.body.messages;
  } catch (error) {
    return res.status(400).json({ message: "The assistant message history is invalid." });
  }
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > MAX_MESSAGES ||
    messages.some((message) =>
      !message ||
      !["user", "model"].includes(message.role) ||
      typeof message.text !== "string"
    ) ||
    messages[messages.length - 1]?.role !== "user"
  ) {
    return res.status(400).json({ message: "The assistant conversation history is invalid. Please start a new message." });
  }
  if (messages.some((message) => message.role === "user" && message.text.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ message: "Your message must be 1,000 characters or fewer." });
  }
  if (messages.some((message) => message.role === "model" && message.text.length > MAX_MODEL_MESSAGE_LENGTH)) {
    return res.status(400).json({ message: "This assistant conversation has too much context. Please start a new chat." });
  }
  if (messages.some((message, index) => !message.text.trim() && !(req.file && index === messages.length - 1))) {
    return res.status(400).json({ message: "Write a message or attach a supported photo or file." });
  }

  const attachmentParts = [];
  if (req.file) {
    const mimeType = req.file.mimetype.toLowerCase();
    if (mimeType.startsWith("image/") && req.file.size > 5 * 1024 * 1024) {
      return res.status(413).json({ message: "Photos sent to the assistant must be 5 MB or smaller." });
    }
    if (mimeType === "application/pdf" || IMAGE_MIME_TYPES.has(mimeType)) {
      attachmentParts.push({
        inline_data: { mime_type: mimeType, data: req.file.buffer.toString("base64") },
      });
    } else if (
      mimeType.startsWith("text/") ||
      TEXT_MIME_TYPES.has(mimeType) ||
      TEXT_FILE_EXTENSIONS.has(path.extname(req.file.originalname).toLowerCase())
    ) {
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(req.file.buffer);
      } catch (error) {
        return res.status(400).json({ message: "The attached text file must use UTF-8 encoding." });
      }
      if (!text.trim()) {
        return res.status(400).json({ message: "The attached text file is empty." });
      }
      if (text.length > 100_000) {
        return res.status(413).json({ message: "Text attachments must contain 100,000 characters or fewer." });
      }
      attachmentParts.push({
        text: `Attached file "${path.basename(req.file.originalname).slice(0, 255)}":\n${text}`,
      });
    } else {
      return res.status(415).json({
        message: "The assistant can analyze photos, PDFs, and text-based files. Please convert this file to one of those formats.",
      });
    }
  }

  try {
    let response;
    let data;
    for (const model of GEMINI_MODELS) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are Nexora Assistant, a friendly and professional AI chatbot inside the Nexora chat app. Give clear, helpful answers. Be concise unless the user asks for detail. You are an AI, not a human, and cannot see the user's chats, contacts, or account information. You can analyze any files explicitly attached to the current message.",
              }],
            },
            contents: messages.map((message, index) => ({
              role: message.role,
              parts: [
                ...(message.text.trim() ? [{ text: message.text.trim() }] : []),
                ...(index === messages.length - 1 ? attachmentParts : []),
              ],
            })),
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
          }),
          signal: AbortSignal.timeout(90000),
        }
      );

      try {
        data = await response.json();
      } catch (error) {
        console.error("Gemini API returned an invalid response:", error);
        return res.status(502).json({ message: "The assistant returned an invalid reply. Please try again." });
      }
      if (response.status !== 503 && data.error?.status !== "UNAVAILABLE") break;
    }

    if (!response.ok) {
      if (response.status === 429) {
        return respondWithRateLimit(res, "chat", response, data);
      }
      if (response.status === 503 || data.error?.status === "UNAVAILABLE") {
        return res.status(503).json({ message: "Gemini is temporarily busy. Please try again in a moment." });
      }
      const providerErrorReasons = data.error?.details
        ?.map((detail) => detail.reason)
        .filter(Boolean);
      if (
        response.status === 401 ||
        response.status === 403 ||
        providerErrorReasons?.includes("API_KEY_INVALID")
      ) {
        console.error("Gemini rejected the configured API key:", response.status);
        return res.status(503).json({
          message: "Gemini rejected the configured API key. Check GEMINI_API_KEY in Backend/.env and restart the backend.",
        });
      }
      console.error("Gemini API request failed:", response.status);
      return res.status(502).json({ message: "The assistant couldn't respond just now. Please try again." });
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      return res.status(502).json({ message: "The assistant couldn't generate a reply. Please try rephrasing." });
    }
    const conversationId = await saveAssistantTurn({
      userId: req.user._id,
      conversationId: req.body.conversationId,
      userMessage: {
        text: messages[messages.length - 1].text.trim(),
        attachmentName: req.file ? path.basename(req.file.originalname).slice(0, 255) : "",
        attachmentType: req.file?.mimetype || "",
        attachmentSize: req.file?.size || 0,
      },
      reply: text.slice(0, MAX_MODEL_MESSAGE_LENGTH),
    });
    return res.json({ message: text, conversationId });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        message: "Gemini did not finish the chat reply within 90 seconds. Please try again; if this keeps happening, check the backend connection and Gemini service status.",
      });
    }
    console.error("Gemini chat or history persistence failed:", error);
    return res.status(502).json({ message: "The assistant could not complete or save that response. Please try again." });
  }
});

router.post("/images", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_Api_key;
  if (!apiKey) {
    return res.status(503).json({ message: "The AI assistant is not configured on the server." });
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: "Describe the image you want (up to 1,000 characters)." });
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image",
        input: [{ type: "text", text: prompt }],
        store: false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) {
        return respondWithRateLimit(res, "image generation", response, data);
      }
      if (response.status === 503 || data.error?.status === "UNAVAILABLE") {
        return res.status(503).json({ message: "Image generation is temporarily busy. Please try again in a moment." });
      }
      const invalidKey = data.error?.details?.some((detail) => detail.reason === "API_KEY_INVALID");
      if (response.status === 401 || response.status === 403 || invalidKey) {
        return res.status(503).json({ message: "Gemini rejected the configured API key. Check GEMINI_API_KEY in Backend/.env and restart the backend." });
      }
      console.error("Gemini image generation failed:", response.status);
      return res.status(502).json({ message: "The assistant couldn't generate that image. Please try another prompt." });
    }

    const image = data.output_image || data.output?.find((item) => item.type === "image");
    const mimeType = image?.mime_type || image?.mimeType || "image/png";
    if (
      typeof image?.data !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) ||
      !GENERATED_IMAGE_MIME_TYPES.has(mimeType) ||
      image.data.length > MAX_STORED_IMAGE_LENGTH
    ) {
      return res.status(502).json({ message: "Gemini didn't return an image. Please try a different prompt." });
    }
    const conversationId = await saveAssistantTurn({
      userId: req.user._id,
      conversationId: req.body.conversationId,
      userMessage: { text: prompt },
      reply: "Here’s your image.",
      image: { data: image.data, mimeType },
    });
    return res.json({
      conversationId,
      image: {
        data: image.data,
        mimeType,
      },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        message: "Gemini did not finish generating the image within 120 seconds. Please try again; if this keeps happening, check the backend connection and Gemini service status.",
      });
    }
    console.error("Gemini image generation or history persistence failed:", error);
    return res.status(502).json({ message: "The assistant could not generate or save that image. Please try again." });
  }
});

module.exports = router;
