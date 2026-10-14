<<<<<<< HEAD
# Nexora Chat — Phase 1

A WhatsApp-inspired, real-time chat application built with React, Tailwind CSS, Express, MongoDB, and Socket.IO.

## Requirements

- Node.js 20+
- MongoDB running locally or a MongoDB Atlas connection string

## Run locally

1. In `Backend`, copy `.env.example` to `.env`, set `MONGODB_URI` and a long, random `JWT_SECRET`, then run:

   ```powershell
   cd Backend
   npm install
   npm run dev
   ```

   For chat attachment uploads, also set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `Backend/.env`. The API streams images and files to Cloudinary; the API secret is never sent to the browser. Images up to 5 MB and files of any type up to 10 MB are supported.

   For the AI assistant, set `GEMINI_API_KEY` in `Backend/.env`. The key is used only by authenticated backend endpoints and is never sent to the browser. The assistant can analyze photos (up to 5 MB), PDFs (up to 10 MB), and UTF-8 text files (up to 100,000 characters); it can also generate images that users can download. Other binary document formats are not currently supported for analysis.

2. In a second terminal, start the frontend:

   ```powershell
   cd Frontend
   npm install
   npm run dev
   ```

3. Open the URL printed by Vite (usually `http://localhost:5173`).

The API and Socket.IO server run on `http://localhost:5000`. The Vite development server proxies `/api` and `/socket.io` to the backend.

## Phase 1 features

- Email, username, and password registration; email-and-password login with JWT-protected API routes (legacy accounts may still log in with their username)
- Find another account by exact username and send a connection request
- Accept or reject incoming requests; only accepted connections can chat
- Persistent one-to-one conversations and multi-member group chats in MongoDB
- Create groups from known contacts, with live messages delivered to every group member
- Group admins can add people from their conversations or connection requests, promote members, remove other admins (the creator remains an admin), and permanently delete groups and their messages for everyone
- Group message read receipts; senders can double-click (desktop) or long-press (mobile) a message to see who has viewed it
- Responsive black-and-blue interface
- Real-time messages, typing indicators, and online/offline presence using Socket.IO
- Send chat photos and documents stored in Cloudinary and persisted as messages in MongoDB
- Open the Gemini-powered AI assistant from the floating button; it fills the chat pane on desktop and the screen on mobile
- Attach photos, PDFs, and text documents to assistant chats for analysis, or generate and download a new image with Gemini
- Assistant conversations are saved privately to the signed-in user's MongoDB account and can be reopened from the assistant history panel
- Online-only new-message alerts for direct and group chats, with optional browser notifications
- Unread message counts in the conversation list that clear when a conversation is opened
- Responsive WhatsApp-inspired interface

## Security notes

Passwords are stored as bcrypt hashes. The API does not expose password hashes, and conversation reads, writes, and Socket.IO room joins all require participant membership. Use HTTPS, a strong unique `JWT_SECRET`, and appropriate production CORS and rate-limiting settings before deploying.
=======
# Nexora-chat
>>>>>>> b689af75a5d989ef03ce137600dafc4b47033357
