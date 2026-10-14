require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const requestRoutes = require("./routes/requests");
const conversationRoutes = require("./routes/conversations");
const assistantRoutes = require("./routes/assistant");

const { MONGODB_URI, JWT_SECRET, CLIENT_ORIGIN = "http://localhost:5173" } = process.env;
if (!MONGODB_URI || !JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("Set MONGODB_URI and a JWT_SECRET of at least 32 characters in Backend/.env.");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN.split(",").map((origin) => origin.trim()), methods: ["GET", "POST"] },
});
const onlineUsers = new Set();

app.set("io", io);
app.set("onlineUsers", onlineUsers);
app.use("/api/assistant", express.json({ limit: "32kb" }));
app.use(cors({ origin: CLIENT_ORIGIN.split(",").map((origin) => origin.trim()) }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/assistant", assistantRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.name === "ValidationError") {
    return res.status(400).json({ message: "Some submitted details are invalid." });
  }
  return res.status(500).json({ message: "Something went wrong. Please try again." });
});

io.use(async (socket, next) => {
  let payload;
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("Authentication required."));
    payload = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return next(new Error("Invalid or expired session."));
  }

  try {
    const user = await User.findById(payload.sub).select("_id username");
    if (!user) return next(new Error("Account not found."));
    socket.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;
  socket.join(`user:${userId}`);
  onlineUsers.add(userId);
  socket.emit("presence:initial", [...onlineUsers]);
  socket.broadcast.emit("presence:update", { userId, online: true });

  socket.on("conversation:join", async (conversationId) => {
    if (typeof conversationId !== "string" || !mongoose.isValidObjectId(conversationId)) return;
    const conversation = await Conversation.exists({
      _id: conversationId,
      participants: userId,
    });
    if (conversation) socket.join(`conversation:${conversationId}`);
  });

  socket.on("conversation:leave", (conversationId) => {
    if (typeof conversationId === "string") socket.leave(`conversation:${conversationId}`);
  });

  socket.on("typing:start", async (conversationId) => {
    if (typeof conversationId !== "string" || !mongoose.isValidObjectId(conversationId)) return;
    const allowed = await Conversation.exists({
      _id: conversationId,
      participants: userId,
    });
    if (allowed) {
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId,
        username: socket.user.username,
        typing: true,
      });
    }
  });

  socket.on("typing:stop", async (conversationId) => {
    if (typeof conversationId !== "string" || !mongoose.isValidObjectId(conversationId)) return;
    const allowed = await Conversation.exists({
      _id: conversationId,
      participants: userId,
    });
    if (allowed) {
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId,
        typing: false,
      });
    }
  });

  socket.on("disconnect", () => {
    const stillConnected = [...io.sockets.sockets.values()].some(
      (connectedSocket) => connectedSocket.user.id === userId
    );
    if (!stillConnected) {
      onlineUsers.delete(userId);
      io.emit("presence:update", { userId, online: false });
    }
  });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    const port = Number(process.env.PORT) || 5000;
    server.listen(port, () => console.log(`Nexora chat API and Socket.IO listening on ${port}`));
  })
  .catch((error) => {
    console.error("Unable to connect to MongoDB:", error);
    process.exitCode = 1;
  });
