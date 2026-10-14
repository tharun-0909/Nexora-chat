import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Download,
  FileText,
  History,
  Image as ImageIcon,
  ImagePlus,
  LogOut,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { api, clearToken, getToken, saveToken } from "./api.js";
import assistantIcon from "./assets/assistant-icon.png";

const avatarColors = ["#8b98d7", "#c59688", "#779f94", "#b18bb9", "#d3a45f", "#7294b5"];

function initials(username = "?") {
  return username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
}

function Avatar({ username, online, large = false }) {
  const color = avatarColors[(username?.charCodeAt(0) || 0) % avatarColors.length];
  return (
    <div className={`avatar ${large ? "avatar-large" : ""}`} style={{ "--avatar-color": color }}>
      <span>{initials(username)}</span>
      {online && <i className="online-dot" />}
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = mode === "register"
        ? { email, username, password }
        : { email, password };
      const data = await api(`/auth/${mode}`, { method: "POST", body });
      saveToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow glow-one" />
      <div className="auth-glow glow-two" />
      <nav className="auth-nav">
        <a className="brand" href="#"><span className="brand-icon"><MessageCircle size={19} fill="currentColor" /></span>nexora<span className="brand-period">.</span></a>
        <span className="auth-nav-note"><ShieldCheck size={15} /> A little more connected.</span>
      </nav>
      <section className="auth-layout">
        <div className="auth-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PEOPLE, YOUR SPACE</div>
          <h1>Good conversations<br />start <span>right here.</span></h1>
          <p>A calmer corner of the internet to catch up, share a thought, and stay close to the people who matter.</p>
          <div className="auth-proof">
            <div className="proof-avatars"><Avatar username="mira" /><Avatar username="arjun" /><Avatar username="sana" /><div className="proof-count">+</div></div>
            <div><strong>Made for real connection</strong><span>Just you and your people.</span></div>
          </div>
          <div className="auth-bubble bubble-a">hey, how have you been? <span>10:42</span></div>
          <div className="auth-bubble bubble-b"><span className="bubble-sparkle">✳</span> So good to hear from you! <span>10:43</span></div>
        </div>
        <div className="auth-card">
          <div className="auth-card-top"><span className="auth-icon"><MessageCircle size={20} /></span><span className="secure-label"><i /> PRIVATE BY DESIGN</span></div>
          <h2>{mode === "login" ? "Welcome back" : "Find your people"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Pick up right where you left off." : "Create an account with an email and a username your friends can find."}</p>
          <div className="auth-tabs">
            <button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
            <button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input className="password-input" id="email" type={mode === "register" ? "email" : "text"} inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
            {mode === "login" && <span className="field-hint">You can also use your username for an older account.</span>}
            {mode === "register" && <>
              <label htmlFor="username">Username</label>
              <div className="input-wrap"><span className="input-prefix">@</span><input id="username" autoComplete="username" placeholder="yourname" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} required /></div>
              <span className="field-hint">3–24 characters · letters, numbers, underscores</span>
            </>}
            <label htmlFor="password">Password</label>
            <input className="password-input" id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "register" ? 8 : undefined} required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? <>Log in to Nexora <ArrowDown size={16} className="arrow-diagonal" /></> : <>Create your account <ArrowDown size={16} className="arrow-diagonal" /></>}</button>
          </form>
          <div className="auth-terms"><ShieldCheck size={14} /> Your chats belong to you. Always.</div>
        </div>
      </section>
      <footer className="auth-footer"><span>© 2026 Nexora</span><span>Simple conversations. Better connections.</span></footer>
    </main>
  );
}

function AssistantPanel({
  messages,
  conversations,
  conversationId,
  historyLoading,
  historyOpen,
  busy,
  draft,
  onDraftChange,
  onSubmit,
  sending,
  generatingImage,
  attachment,
  onAttachmentChange,
  onGenerateImage,
  onNewConversation,
  onSelectConversation,
  onToggleHistory,
  error,
  onClose,
}) {
  const bottomRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const suggestions = [
    "Help me write a friendly message",
    "Give me ideas for the weekend",
    "Explain something I'm curious about",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  return (
    <section className={`assistant-panel ${historyOpen ? "assistant-panel-history-open" : ""}`} aria-label="Nexora AI assistant">
      <aside className="assistant-history" aria-label="Recent assistant conversations">
        <div className="assistant-history-heading">
          <div><span>YOUR SPACE</span><strong>Recent chats</strong></div>
          <button type="button" onClick={onNewConversation} disabled={busy} aria-label="Start a new conversation" title="New conversation"><Plus size={17} /></button>
        </div>
        <div className="assistant-history-list">
          {historyLoading && conversations.length === 0 ? <span className="assistant-history-empty">Loading conversations…</span> : conversations.length ? conversations.map((conversation) => (
            <button
              className={`assistant-history-item ${conversationId === conversation.id ? "assistant-history-item-active" : ""}`}
              type="button"
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              disabled={busy}
            >
              <strong>{conversation.title}</strong>
              <span>{conversation.preview}</span>
              <small>{formatAssistantDate(conversation.updatedAt)}</small>
            </button>
          )) : <span className="assistant-history-empty">Your conversations will appear here.</span>}
        </div>
      </aside>
      <div className="assistant-main">
        <header className="assistant-header">
            <button className="assistant-history-toggle" type="button" onClick={onToggleHistory} aria-label="Toggle conversation history"><History size={18} /></button>
            <span className="assistant-avatar"><img src={assistantIcon} alt="" /></span>
            <div className="assistant-title">
              <strong>Nexora Assistant</strong>
              <span><i /> Here whenever you need</span>
            </div>
            <span className="assistant-powered">GEMINI</span>
            <button className="assistant-close-button" type="button" onClick={onClose} aria-label="Close assistant">
              <X size={19} />
            </button>
        </header>
          <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="assistant-welcome">
            <span className="assistant-welcome-icon"><Sparkles size={22} /></span>
            <h2>A little help, right here.</h2>
            <p>Ask a question, get ideas, or find the right words. What can I help with?</p>
            <div className="assistant-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => onDraftChange(suggestion)}>
                  {suggestion}<ArrowDown size={13} className="arrow-diagonal" />
                </button>
              ))}
            </div>
          </div>
          ) : messages.map((message) => (
          <div className={`assistant-message assistant-message-${message.role}`} key={message.id}>
            {message.role === "model" && <span className="assistant-message-avatar"><Sparkles size={13} /></span>}
            <div className="assistant-message-content">
              {message.attachment && <div className="assistant-attachment-preview">
                <span className="assistant-attachment-icon">
                  {message.attachment.previewUrl && message.attachment.type.startsWith("image/")
                    ? <img src={message.attachment.previewUrl} alt="" />
                    : <FileText size={18} />}
                </span>
                <span className="assistant-attachment-info"><strong>{message.attachment.name}</strong><small>{message.attachment.type || "File"}</small></span>
              </div>}
              {message.image && <div className="assistant-generated-image">
                <img src={message.image.url} alt="Generated by Nexora Assistant" />
                <a className="assistant-download-button" href={message.image.url} download={`nexora-image.${message.image.mimeType === "image/jpeg" ? "jpg" : message.image.mimeType === "image/webp" ? "webp" : "png"}`}><Download size={15} /> Download image</a>
              </div>}
              {message.text && <p>{message.text}</p>}
            </div>
          </div>
        ))}
        {(sending || generatingImage) && <div className="assistant-message assistant-message-model assistant-typing" role="status" aria-label={generatingImage ? "Generating image" : "Assistant is responding"}>
          <span className="assistant-message-avatar"><Sparkles size={13} /></span>
          <p>{generatingImage ? "Creating your image…" : <><i /><i /><i /></>}</p>
        </div>}
            <div ref={bottomRef} />
          </div>
          <div className="assistant-footer">
        {error && <p className="assistant-error" role="alert">{error}</p>}
        {attachment && <div className="assistant-selected-attachment">
          <span className="assistant-attachment-icon">
            {attachment.type.startsWith("image/") && attachment.previewUrl
              ? <img src={attachment.previewUrl} alt="" />
              : <FileText size={17} />}
          </span>
          <span className="assistant-attachment-info"><strong>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></span>
          <button type="button" aria-label="Remove attachment" onClick={() => onAttachmentChange(null)}><X size={15} /></button>
        </div>}
        <form className="assistant-composer" onSubmit={onSubmit}>
          <div className="assistant-attach-wrap">
            <button type="button" className="assistant-attach-button" aria-label="Attach a photo or file" aria-expanded={menuOpen} disabled={sending || generatingImage} onClick={() => setMenuOpen((open) => !open)}><Paperclip size={17} /></button>
            {menuOpen && <div className="attachment-menu assistant-attachment-menu">
              <button type="button" onClick={() => { setMenuOpen(false); photoInputRef.current?.click(); }}><ImageIcon size={16} /> Photos</button>
              <button type="button" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}><FileText size={16} /> Files</button>
            </div>}
            <input ref={photoInputRef} className="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" onChange={(event) => { onAttachmentChange(event.target.files?.[0] || null); event.target.value = ""; }} />
            <input ref={fileInputRef} className="photo-file-input" type="file" accept=".pdf,.txt,.md,.csv,.json,.xml,.html,.css,.js,.log" onChange={(event) => { onAttachmentChange(event.target.files?.[0] || null); event.target.value = ""; }} />
          </div>
          <textarea
            aria-label="Message the assistant"
            placeholder="Ask me anything..."
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            maxLength={1000}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form.requestSubmit();
              }
            }}
          />
          <button type="button" className="assistant-generate-button" disabled={sending || generatingImage || !draft.trim()} aria-label="Generate an image" title="Generate an image from your prompt" onClick={onGenerateImage}>
            <ImagePlus size={17} />
          </button>
          <button type="submit" disabled={sending || generatingImage || (!draft.trim() && !attachment)} aria-label="Send to assistant">
            <Send size={17} />
          </button>
        </form>
            <span className="assistant-disclaimer">Attach photos, PDFs, and text files to ask about them · AI can make mistakes. Check important information.</span>
          </div>
        </div>
    </section>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(Boolean(getToken()));
  const [socket, setSocket] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [online, setOnline] = useState(new Set());
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantConversations, setAssistantConversations] = useState([]);
  const [assistantConversationId, setAssistantConversationId] = useState(null);
  const [assistantHistoryLoading, setAssistantHistoryLoading] = useState(false);
  const [assistantHistoryOpen, setAssistantHistoryOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantSending, setAssistantSending] = useState(false);
  const [assistantGeneratingImage, setAssistantGeneratingImage] = useState(false);
  const [assistantAttachment, setAssistantAttachment] = useState(null);
  const [assistantError, setAssistantError] = useState("");
  const assistantObjectUrlsRef = useRef(new Set());
  const assistantSessionRef = useRef(0);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [notice, setNotice] = useState("");
  const [incomingNotification, setIncomingNotification] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported"
  );
  const [requestUsername, setRequestUsername] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupFriends, setGroupFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [addMemberPickerOpen, setAddMemberPickerOpen] = useState(false);
  const [loadingMemberCandidates, setLoadingMemberCandidates] = useState(false);
  const [groupMemberOptions, setGroupMemberOptions] = useState([]);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [promotingMemberId, setPromotingMemberId] = useState("");
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [viewedMessage, setViewedMessage] = useState(null);
  const bottomRef = useRef(null);
  const imageInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const typingTimer = useRef(null);
  const messagePressTimer = useRef(null);
  const activeIdRef = useRef(null);

  function trackAssistantObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    assistantObjectUrlsRef.current.add(url);
    return url;
  }

  function revokeAssistantObjectUrls() {
    assistantObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    assistantObjectUrlsRef.current.clear();
  }

  useEffect(() => () => revokeAssistantObjectUrls(), []);

  const refreshData = useCallback(async () => {
    const [conversationData, requestData] = await Promise.all([
      api("/conversations"),
      api("/requests"),
    ]);
    setConversations(conversationData.conversations);
    setRequests(requestData);
  }, []);

  const refreshAssistantHistory = useCallback(async () => {
    setAssistantHistoryLoading(true);
    try {
      const { conversations: history } = await api("/assistant/conversations");
      setAssistantConversations(history);
    } catch (error) {
      setAssistantError(error.message);
    } finally {
      setAssistantHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (assistantOpen && user) refreshAssistantHistory();
  }, [assistantOpen, user, refreshAssistantHistory]);

  function startAssistantConversation() {
    if (assistantSending || assistantGeneratingImage) return;
    assistantSessionRef.current += 1;
    revokeAssistantObjectUrls();
    setAssistantConversationId(null);
    setAssistantMessages([]);
    setAssistantDraft("");
    setAssistantAttachment(null);
    setAssistantError("");
    setAssistantHistoryOpen(false);
  }

  async function selectAssistantConversation(id) {
    if (assistantSending || assistantGeneratingImage || id === assistantConversationId) {
      setAssistantHistoryOpen(false);
      return;
    }
    const requestSession = ++assistantSessionRef.current;
    setAssistantHistoryLoading(true);
    setAssistantError("");
    try {
      const { conversation, messages: storedMessages } = await api(`/assistant/conversations/${id}`);
      if (requestSession !== assistantSessionRef.current) return;
      revokeAssistantObjectUrls();
      const restoredMessages = storedMessages.map((message) => {
        if (!message.image?.data) return message;
        const imageBytes = Uint8Array.from(atob(message.image.data), (character) => character.charCodeAt(0));
        const imageUrl = trackAssistantObjectUrl(new Blob([imageBytes], { type: message.image.mimeType }));
        return { ...message, image: { url: imageUrl, mimeType: message.image.mimeType } };
      });
      setAssistantConversationId(conversation.id);
      setAssistantMessages(restoredMessages);
      setAssistantDraft("");
      setAssistantAttachment(null);
      setAssistantHistoryOpen(false);
    } catch (error) {
      if (requestSession === assistantSessionRef.current) setAssistantError(error.message);
    } finally {
      if (requestSession === assistantSessionRef.current) setAssistantHistoryLoading(false);
    }
  }

  async function sendAssistantMessage(event) {
    event.preventDefault();
    const text = assistantDraft.trim() || (assistantAttachment ? "Please analyze this attachment." : "");
    if ((!text && !assistantAttachment) || assistantSending || assistantGeneratingImage) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      ...(assistantAttachment ? {
        attachment: {
          name: assistantAttachment.name,
          type: assistantAttachment.type,
          size: assistantAttachment.size,
          previewUrl: assistantAttachment.previewUrl,
        },
      } : {}),
    };
    const nextMessages = [...assistantMessages, userMessage];
    setAssistantMessages(nextMessages);
    setAssistantDraft("");
    setAssistantError("");
    setAssistantSending(true);
    const requestSession = assistantSessionRef.current;
    try {
      const body = new FormData();
      body.append("messages", JSON.stringify(nextMessages.slice(-8).map(({ role, text: content }) => ({
        role,
        text: content,
      }))));
      if (assistantConversationId) body.append("conversationId", assistantConversationId);
      if (assistantAttachment) body.append("attachment", assistantAttachment.file);
      const { message, conversationId } = await api("/assistant/chat", {
        method: "POST",
        body,
      });
      if (requestSession !== assistantSessionRef.current) return;
      setAssistantConversationId(conversationId);
      setAssistantMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "model", text: message },
      ]);
      setAssistantAttachment(null);
      refreshAssistantHistory();
    } catch (error) {
      if (requestSession !== assistantSessionRef.current) return;
      setAssistantMessages((current) => current.filter((item) => item.id !== userMessage.id));
      setAssistantDraft(text);
      setAssistantError(error.message);
    } finally {
      if (requestSession === assistantSessionRef.current) setAssistantSending(false);
    }
  }

  function selectAssistantAttachment(file) {
    if (!file) {
      setAssistantAttachment(null);
      return;
    }
    const isImage = file.type.startsWith("image/");
    if (file.size > (isImage ? 5 : 10) * 1024 * 1024) {
      setAssistantError(isImage
        ? "Photos sent to the assistant must be 5 MB or smaller."
        : "Assistant attachments must be 10 MB or smaller.");
      return;
    }
    setAssistantError("");
    setAssistantAttachment({
      file,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      previewUrl: isImage ? trackAssistantObjectUrl(file) : "",
    });
  }

  async function generateAssistantImage() {
    const prompt = assistantDraft.trim();
    if (!prompt || assistantSending || assistantGeneratingImage) return;
    const userMessage = { id: crypto.randomUUID(), role: "user", text: prompt };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantDraft("");
    setAssistantError("");
    setAssistantGeneratingImage(true);
    const requestSession = assistantSessionRef.current;
    try {
      const { image, conversationId } = await api("/assistant/images", {
        method: "POST",
        body: { prompt, conversationId: assistantConversationId },
      });
      if (requestSession !== assistantSessionRef.current) return;
      setAssistantConversationId(conversationId);
      const imageBytes = Uint8Array.from(atob(image.data), (character) => character.charCodeAt(0));
      const imageUrl = trackAssistantObjectUrl(new Blob([imageBytes], { type: image.mimeType }));
      setAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "model",
          text: "Here’s your image.",
          image: { url: imageUrl, mimeType: image.mimeType },
        },
      ]);
      refreshAssistantHistory();
    } catch (error) {
      if (requestSession !== assistantSessionRef.current) return;
      setAssistantMessages((current) => current.filter((item) => item.id !== userMessage.id));
      setAssistantDraft(prompt);
      setAssistantError(error.message);
    } finally {
      if (requestSession === assistantSessionRef.current) setAssistantGeneratingImage(false);
    }
  }

  function changeAssistantDraft(value) {
    setAssistantDraft(value);
    if (assistantError) setAssistantError("");
  }

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    refreshData().catch((error) => setNotice(error.message));
    const connection = io({ auth: { token: getToken() } });
    setSocket(connection);
    connection.on("presence:initial", (ids) => setOnline(new Set(ids)));
    connection.on("presence:update", ({ userId, online: isOnline }) => {
      setOnline((current) => {
        const next = new Set(current);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    connection.on("conversation:updated", () => refreshData().catch((error) => setNotice(error.message)));
    connection.on("message:notification", (messageNotification) => {
      const { conversationId, conversationName, senderUsername, text, isGroup } = messageNotification;
      const title = isGroup
        ? `${senderUsername} in ${conversationName}`
        : `@${senderUsername} sent you a message`;
      const body = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      const openConversation = () => {
        setActiveId(conversationId);
        setMobileChatOpen(true);
        setIncomingNotification(null);
      };

      if (
        typeof window.Notification !== "undefined" &&
        window.Notification.permission === "granted" &&
        document.hidden
      ) {
        const notification = new window.Notification(title, {
          body,
          tag: `nexora-${conversationId}`,
        });
        notification.onclick = () => {
          window.focus();
          openConversation();
          notification.close();
        };
      } else if (activeIdRef.current !== conversationId) {
        setIncomingNotification({ conversationId, title, body });
      }
    });
    connection.on("request:new", () => refreshData().catch((error) => setNotice(error.message)));
    connection.on("request:updated", () => refreshData().catch((error) => setNotice(error.message)));
    connection.on("friend:accepted", () => refreshData().catch((error) => setNotice(error.message)));
    connection.on("conversation:deleted", ({ conversationId, name }) => {
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (activeIdRef.current === conversationId) {
        activeIdRef.current = null;
        setActiveId(null);
        setMessages([]);
        setMobileChatOpen(false);
        setViewedMessage(null);
        setGroupManageOpen(false);
        setNotice(`Group "${name}" was deleted by an admin.`);
      }
    });
    connection.on("connect_error", (error) => {
      if (active && error.message.toLowerCase().includes("session")) {
        setNotice("Your session has expired. Please log in again.");
      }
    });
    return () => {
      active = false;
      connection.disconnect();
      setSocket(null);
    };
  }, [user, refreshData]);

  useEffect(() => {
    if (!user || !activeId) {
      setMessages([]);
      return undefined;
    }
    setLoadingMessages(true);
    setTypingUser("");
    socket?.emit("conversation:join", activeId);
    api(`/conversations/${activeId}/messages`)
      .then(({ messages: loadedMessages }) => {
        setMessages(loadedMessages);
        refreshData().catch((error) => setNotice(error.message));
      })
      .catch((error) => setNotice(error.message))
      .finally(() => setLoadingMessages(false));
    return () => socket?.emit("conversation:leave", activeId);
  }, [user, activeId, socket, refreshData]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (message) => {
      if (message.conversationId === activeId) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        if (message.senderId !== user?.id) {
          api(`/conversations/${activeId}/messages`)
            .then(({ messages: loadedMessages }) => {
              setMessages(loadedMessages);
              refreshData().catch((error) => setNotice(error.message));
            })
            .catch((error) => setNotice(error.message));
        }
      }
      refreshData().catch((error) => setNotice(error.message));
    };
    const onTyping = (payload) => {
      if (payload.conversationId !== activeId || payload.userId === user?.id) return;
      setTypingUser(payload.typing ? payload.username : "");
    };
    const onRead = ({ conversationId, user, userId, messageIds }) => {
      if (conversationId !== activeId) return;
      const read = new Set(messageIds);
      const readerId = user?.id || userId;
      if (!readerId) return;
      setMessages((current) => current.map((message) => {
        if (!read.has(message.id)) return message;
        return {
          ...message,
          readBy: [...new Set([...message.readBy, readerId])],
          readByUsers: user
            ? [...new Map([...(message.readByUsers || []), user].map((reader) => [reader.id, reader])).values()]
            : message.readByUsers || [],
        };
      }));
      setViewedMessage((message) => {
        if (!message || !read.has(message.id)) return message;
        return {
          ...message,
          readBy: [...new Set([...message.readBy, readerId])],
          readByUsers: user
            ? [...new Map([...(message.readByUsers || []), user].map((reader) => [reader.id, reader])).values()]
            : message.readByUsers || [],
        };
      });
    };
    socket.on("message:new", onMessage);
    socket.on("typing:update", onTyping);
    socket.on("message:read", onRead);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("typing:update", onTyping);
      socket.off("message:read", onRead);
    };
  }, [socket, activeId, user, refreshData]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typingUser]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!incomingNotification) return undefined;
    let timer = document.hidden
      ? null
      : window.setTimeout(() => setIncomingNotification(null), 7000);
    const handleVisibilityChange = () => {
      if (document.hidden && timer) {
        window.clearTimeout(timer);
        timer = null;
      } else if (!document.hidden && !timer) {
        timer = window.setTimeout(() => setIncomingNotification(null), 7000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [incomingNotification]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const friend = activeConversation?.participants.find((participant) => participant.id !== user?.id);
  const isActiveGroupAdmin = Boolean(
    activeConversation?.isGroup &&
      (activeConversation.admins || []).includes(user?.id)
  );
  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    const otherParticipants = conversation.participants.filter((participant) => participant.id !== user?.id);
    const matchesQuery = conversation.isGroup
      ? `${conversation.name} ${otherParticipants.map((participant) => participant.username).join(" ")}`.toLowerCase().includes(query.toLowerCase())
      : otherParticipants[0]?.username.toLowerCase().includes(query.toLowerCase());
    const matchesTab = filter === "all" || otherParticipants.some((participant) => online.has(participant.id));
    return matchesQuery && matchesTab;
  }), [conversations, user, query, filter, online]);

  async function sendMessage(event) {
    event.preventDefault();
    if (uploadingAttachment) return;
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft("");
    socket?.emit("typing:stop", activeId);
    try {
      const { message } = await api(`/conversations/${activeId}/messages`, { method: "POST", body: { text } });
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      refreshData().catch((error) => setNotice(error.message));
    } catch (error) {
      setDraft(text);
      setNotice(error.message);
    }
  }

  async function sendAttachment(file, type) {
    if (!file || !activeId) return;
    const conversationId = activeId;
    const formData = new FormData();
    formData.append(type === "image" ? "image" : "file", file);
    setUploadingAttachment(true);
    socket?.emit("typing:stop", conversationId);
    try {
      const { message } = await api(`/conversations/${conversationId}/${type === "image" ? "images" : "files"}`, {
        method: "POST",
        body: formData,
      });
      if (activeIdRef.current === conversationId) {
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, message]);
      }
      refreshData().catch((error) => setNotice(error.message));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploadingAttachment(false);
    }
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) sendAttachment(file, "image");
  }

  function selectDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) sendAttachment(file, "file");
  }

  async function enableNotifications() {
    if (typeof window.Notification === "undefined") return;
    try {
      setNotificationPermission(await window.Notification.requestPermission());
    } catch (error) {
      setNotice(error.message);
    }
  }

  function changeDraft(value) {
    setDraft(value);
    if (!activeId || !socket) return;
    socket.emit(value.trim() ? "typing:start" : "typing:stop", activeId);
    window.clearTimeout(typingTimer.current);
    if (value.trim()) typingTimer.current = window.setTimeout(() => socket.emit("typing:stop", activeId), 1600);
  }

  async function sendRequest(event) {
    event.preventDefault();
    if (!requestUsername.trim()) return;
    setRequestBusy(true);
    try {
      const result = await api("/requests", { method: "POST", body: { username: requestUsername } });
      setNotice(result.message);
      setRequestUsername("");
      await refreshData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRequestBusy(false);
    }
  }

  async function respondToRequest(id, action) {
    try {
      const result = await api(`/requests/${id}`, { method: "PATCH", body: { action } });
      setNotice(result.message);
      await refreshData();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function openGroupDialog() {
    setGroupDialogOpen(true);
    setGroupFriends([]);
    setSelectedFriendIds([]);
    setGroupName("");
    try {
      const { friends } = await api("/conversations/friends");
      setGroupFriends(friends);
    } catch (error) {
      setGroupDialogOpen(false);
      setNotice(error.message);
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    if (groupBusy || selectedFriendIds.length === 0) return;
    setGroupBusy(true);
    try {
      const { conversation } = await api("/conversations/groups", {
        method: "POST",
        body: { name: groupName, memberIds: selectedFriendIds },
      });
      await refreshData();
      setActiveId(conversation.id);
      setMobileChatOpen(true);
      setGroupDialogOpen(false);
      setNotice(`Group "${conversation.name}" created.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setGroupBusy(false);
    }
  }

  async function openGroupManagement(showMemberPicker = false) {
    if (!activeConversation?.isGroup) return;
    setGroupManageOpen(true);
    setAddMemberPickerOpen(false);
    setSelectedNewMemberIds([]);
    setConfirmGroupDelete(false);
    setGroupMemberOptions([]);
    if (!showMemberPicker || !isActiveGroupAdmin || loadingMemberCandidates) return;
    setAddMemberPickerOpen(true);
    setLoadingMemberCandidates(true);
    try {
      const { friends } = await api(
        `/conversations/${activeConversation.id}/member-candidates`
      );
      setGroupMemberOptions(friends);
    } catch (error) {
      setAddMemberPickerOpen(false);
      setNotice(error.message);
    } finally {
      setLoadingMemberCandidates(false);
    }
  }

  async function openAddMemberPicker() {
    await openGroupManagement(true);
  }

  async function addGroupMembers(event) {
    event.preventDefault();
    if (!activeConversation?.isGroup || !selectedNewMemberIds.length || addingMembers) return;
    setAddingMembers(true);
    try {
      const result = await api(`/conversations/${activeConversation.id}/members`, {
        method: "POST",
        body: { memberIds: selectedNewMemberIds },
      });
      setSelectedNewMemberIds([]);
      await refreshData();
      const { friends } = await api(
        `/conversations/${activeConversation.id}/member-candidates`
      );
      setGroupMemberOptions(friends);
      setAddMemberPickerOpen(false);
      setNotice(result.message);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAddingMembers(false);
    }
  }

  async function promoteGroupMember(member) {
    if (!activeConversation?.isGroup || promotingMemberId) return;
    setPromotingMemberId(member.id);
    try {
      const result = await api(
        `/conversations/${activeConversation.id}/admins/${member.id}`,
        { method: "PATCH" }
      );
      await refreshData();
      setNotice(`@${member.username} is now a group admin.`);
      if (!result.message) setNotice("Group admin added.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setPromotingMemberId("");
    }
  }

  async function removeGroupAdmin(member) {
    if (!activeConversation?.isGroup || !isActiveGroupAdmin || promotingMemberId) return;
    setPromotingMemberId(member.id);
    try {
      const result = await api(
        `/conversations/${activeConversation.id}/admins/${member.id}`,
        { method: "DELETE" }
      );
      await refreshData();
      setNotice(`@${member.username} is no longer a group admin.`);
      if (result.message !== "Admin role removed.") setNotice(result.message);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setPromotingMemberId("");
    }
  }

  async function deleteGroup() {
    if (!activeConversation?.isGroup || !isActiveGroupAdmin || deletingGroup) return;
    setDeletingGroup(true);
    try {
      const result = await api(`/conversations/${activeConversation.id}`, { method: "DELETE" });
      activeIdRef.current = null;
      setActiveId(null);
      setMessages([]);
      setGroupManageOpen(false);
      setAddMemberPickerOpen(false);
      setConfirmGroupDelete(false);
      setMobileChatOpen(false);
      await refreshData();
      setNotice(result.message);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeletingGroup(false);
    }
  }

  function toggleGroupMember(friendId) {
    setSelectedFriendIds((selected) =>
      selected.includes(friendId)
        ? selected.filter((id) => id !== friendId)
        : [...selected, friendId]
    );
  }

  function showMessageReaders(message) {
    setViewedMessage({
      ...message,
      readByUsers: message.readByUsers || [],
    });
  }

  function startMessagePress(message, canViewReaders) {
    if (!canViewReaders) return;
    window.clearTimeout(messagePressTimer.current);
    messagePressTimer.current = window.setTimeout(() => showMessageReaders(message), 550);
  }

  function cancelMessagePress() {
    window.clearTimeout(messagePressTimer.current);
  }

  function logout() {
    socket?.disconnect();
    assistantSessionRef.current += 1;
    revokeAssistantObjectUrls();
    clearToken();
    setUser(null);
    setSocket(null);
    setConversations([]);
    setActiveId(null);
    setAssistantOpen(false);
    setAssistantMessages([]);
    setAssistantConversations([]);
    setAssistantConversationId(null);
    setAssistantHistoryOpen(false);
    setAssistantSending(false);
    setAssistantGeneratingImage(false);
    setAssistantAttachment(null);
    setAssistantDraft("");
    setAssistantError("");
  }

  if (checkingAuth) return <div className="loading-screen"><span className="loader" />Getting your space ready…</div>;
  if (!user) return <AuthScreen onAuth={setUser} />;

  return (
    <main className="app-shell">
      <div className="app-topbar">
        <a className="brand app-brand" href="#"><span className="brand-icon"><MessageCircle size={17} fill="currentColor" /></span>nexora<span className="brand-period">.</span></a>
        <div className="topbar-right"><span className="topbar-status"><i /> ALL GOOD, ALL CONNECTED</span>{notificationPermission === "default" && <button className="notification-permission-button" onClick={enableNotifications}>Enable notifications</button>}{notificationPermission === "granted" && <span className="notification-permission-state">Alerts enabled</span>}{notificationPermission === "denied" && <span className="notification-permission-state" title="Allow notifications for this site in your browser settings">Alerts blocked</span>}</div>
      </div>
      <section className="messenger">
        <aside className={`sidebar ${mobileChatOpen ? "sidebar-hidden-mobile" : ""}`}>
          <div className="sidebar-heading"><div><span className="section-kicker">YOUR SPACE</span><h1>Messages <span>{conversations.length ? String(conversations.length).padStart(2, "0") : ""}</span></h1></div><div className="sidebar-heading-actions"><button className="group-create-button" onClick={openGroupDialog} aria-label="Create a group"><Users size={15} /><span>Group</span></button></div></div>
          <div className="search-box"><Search size={17} /><input aria-label="Search conversations" placeholder="Find a conversation..." value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}<kbd>⌘ K</kbd></div>
          <div className="conversation-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All chats</button><button className={filter === "online" ? "active" : ""} onClick={() => setFilter("online")}>Online <span className="filter-online-dot" /></button><button className="request-count" onClick={() => document.getElementById("requests-section")?.scrollIntoView({ behavior: "smooth" })}><Users size={13} /> {requests.incoming.length ? `${requests.incoming.length} request${requests.incoming.length === 1 ? "" : "s"}` : "Requests"}</button></div>
          <div className="conversation-list">
            {filteredConversations.length ? filteredConversations.map((conversation) => {
              const otherParticipants = conversation.participants.filter((participant) => participant.id !== user.id);
              const other = otherParticipants[0];
              const isOnline = otherParticipants.some((participant) => online.has(participant.id));
              const last = conversation.lastMessage;
              const lastSender = conversation.participants.find((participant) => participant.id === last?.senderId);
              const title = conversation.isGroup ? conversation.name : `@${other?.username}`;
              return <button key={conversation.id} className={`conversation-item ${activeId === conversation.id ? "conversation-active" : ""}`} onClick={() => { setActiveId(conversation.id); setMobileChatOpen(true); }}>
                <Avatar username={conversation.isGroup ? conversation.name : other?.username} online={!conversation.isGroup && isOnline} />
                <div className={`conversation-copy ${conversation.unreadCount ? "conversation-unread" : ""}`}><div className="conversation-title"><strong>{title}</strong><time>{last ? formatTime(last.createdAt) : ""}</time></div><div className="conversation-preview"><span>{last ? `${last.senderId === user.id ? "You" : conversation.isGroup ? `@${lastSender?.username || "member"}` : ""}${last.senderId === user.id || conversation.isGroup ? ": " : ""}${last.imageUrl ? "Photo" : last.fileName ? `File: ${last.fileName}` : last.text}` : conversation.isGroup ? `${conversation.participants.length} members · Start chatting` : "Say hello 👋"}</span>{conversation.unreadCount > 0 && <span className="unread-indicator" aria-label={`${conversation.unreadCount} unread messages`}><i />{conversation.unreadCount > 1 ? conversation.unreadCount : ""}</span>}{last?.senderId === user.id && <CheckCheck className="preview-check" size={14} />}</div></div>
              </button>;
            }) : <div className="empty-conversations"><span className="empty-icon"><MessageCircle size={19} /></span><strong>{query ? "No matches just yet" : "Your chats start here"}</strong><span>{query ? "Try another username." : "Connect with someone to get the conversation going."}</span></div>}
          </div>
          <div className="sidebar-bottom">
            <section className="add-friend-card">
              <div className="add-card-heading"><span className="add-card-icon"><Plus size={15} /></span><div><strong>Find your people</strong><span>Connect by username</span></div></div>
              <form onSubmit={sendRequest}><div className="friend-input"><span>@</span><input id="add-friend-input" placeholder="their_username" value={requestUsername} onChange={(event) => setRequestUsername(event.target.value)} minLength={3} maxLength={24} /><button type="submit" disabled={requestBusy || requestUsername.trim().length < 3} aria-label="Send connection request"><ArrowDown size={16} className="arrow-diagonal" /></button></div></form>
            </section>
            {incomingNotification && <button className="incoming-message-toast" role="status" onClick={() => { setActiveId(incomingNotification.conversationId); setMobileChatOpen(true); setIncomingNotification(null); }}><span className="incoming-message-icon"><MessageCircle size={17} /></span><span><strong>{incomingNotification.title}</strong><small>{incomingNotification.body}</small></span><X size={15} onClick={(event) => { event.stopPropagation(); setIncomingNotification(null); }} /></button>}
            {requests.incoming.length > 0 && <section className="requests-section" id="requests-section"><div className="request-heading"><span>INCOMING REQUESTS</span><b>{requests.incoming.length}</b></div>{requests.incoming.map((request) => <div className="incoming-request" key={request.id}><Avatar username={request.user.username} /><div className="incoming-copy"><strong>@{request.user.username}</strong><span>wants to connect</span></div><button className="accept-request" onClick={() => respondToRequest(request.id, "accept")} aria-label={`Accept @${request.user.username}`}><Check size={16} /></button><button className="reject-request" onClick={() => respondToRequest(request.id, "reject")} aria-label={`Decline @${request.user.username}`}><X size={15} /></button></div>)}</section>}
            <div className="profile-row"><Avatar username={user.username} /><div className="profile-copy"><strong>@{user.username}</strong><span><i /> Your account</span></div><button className="profile-menu" aria-label="Log out" onClick={logout}><LogOut size={17} /></button></div>
          </div>
        </aside>
        <section className={`chat-panel ${mobileChatOpen ? "chat-panel-mobile-open" : ""}`}>
          {assistantOpen ? <div className="assistant-desktop-panel"><AssistantPanel messages={assistantMessages} conversations={assistantConversations} conversationId={assistantConversationId} historyLoading={assistantHistoryLoading} historyOpen={assistantHistoryOpen} busy={assistantSending || assistantGeneratingImage} draft={assistantDraft} onDraftChange={changeAssistantDraft} onSubmit={sendAssistantMessage} onGenerateImage={generateAssistantImage} onNewConversation={startAssistantConversation} onSelectConversation={selectAssistantConversation} onToggleHistory={() => setAssistantHistoryOpen((open) => !open)} generatingImage={assistantGeneratingImage} attachment={assistantAttachment} onAttachmentChange={selectAssistantAttachment} sending={assistantSending} error={assistantError} onClose={() => setAssistantOpen(false)} /></div> : activeConversation && friend ? <>
            <header className="chat-header"><button className="mobile-back" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations"><ArrowLeft size={19} /></button><Avatar username={activeConversation.isGroup ? activeConversation.name : friend.username} /><div className="chat-contact"><strong>{activeConversation.isGroup ? activeConversation.name : `@${friend.username}`}</strong><span>{typingUser ? <em>{typingUser} is typing…</em> : activeConversation.isGroup ? `${activeConversation.participants.length} members · ${activeConversation.participants.filter((participant) => online.has(participant.id)).length} online` : online.has(friend.id) ? <><i className="header-online" /> online now</> : "a friend on Nexora"}</span></div><span className="conversation-secure"><ShieldCheck size={14} /> {activeConversation.isGroup ? "GROUP CHAT" : "PRIVATE CHAT"}</span>{activeConversation.isGroup && isActiveGroupAdmin && <button className="add-members-header-button" onClick={openAddMemberPicker} aria-label="Add members to group" disabled={loadingMemberCandidates}><UserPlus size={15} /><span>Add members</span></button>}{activeConversation.isGroup && <button className="manage-group-button" onClick={() => openGroupManagement()} aria-label="Manage group"><Settings2 size={15} /><span>Manage</span></button>}</header>
            <div className="message-area">
              <div className="day-divider"><span>{activeConversation.isGroup ? `${activeConversation.participants.length} PEOPLE, ONE SPACE` : "YOUR SPACE, JUST THE TWO OF YOU"}</span></div>
              {messages.length === 0 && <div className="chat-welcome"><div className="welcome-avatar"><Avatar username={activeConversation.isGroup ? activeConversation.name : friend.username} large /></div><h2>{activeConversation.isGroup ? `Welcome to ${activeConversation.name}.` : "It’s nice to have you here."}</h2><p>{activeConversation.isGroup ? <>A shared space with {activeConversation.participants.length} members.<br />Go on, say hello.</> : <>This is the beginning of your conversation with <strong>@{friend.username}</strong>.<br />Go on, say hello.</>}</p><span className="welcome-privacy"><ShieldCheck size={13} /> {activeConversation.isGroup ? "Just between group members" : "Just between you two"}</span></div>}
              {loadingMessages ? <div className="messages-loading"><span className="loader" /></div> : messages.map((message, index) => {
                const mine = message.senderId === user.id;
                const sender = activeConversation.participants.find((participant) => participant.id === message.senderId);
                const previous = messages[index - 1];
                const sameSender = previous?.senderId === message.senderId && Date.now() - new Date(previous.createdAt).getTime() < 120000;
                const canViewReaders = mine && activeConversation.isGroup;
                return <div className={`message-row ${mine ? "message-mine" : "message-theirs"} ${sameSender ? "message-grouped" : ""}`} key={message.id} onDoubleClick={() => canViewReaders && showMessageReaders(message)} onTouchStart={() => startMessagePress(message, canViewReaders)} onTouchEnd={cancelMessagePress} onTouchMove={cancelMessagePress} onContextMenu={(event) => { if (canViewReaders) event.preventDefault(); }}>
                  {!mine && !sameSender && <Avatar username={activeConversation.isGroup ? sender?.username : friend.username} />}
                  <div className="message-bubble">{activeConversation.isGroup && !mine && !sameSender && <span className="message-sender">@{sender?.username || "member"}</span>}{message.imageUrl && <a className="message-image-link" href={message.imageUrl} target="_blank" rel="noreferrer"><img className="message-image" src={message.imageUrl} alt="Photo shared in chat" loading="lazy" /></a>}{message.fileUrl && <a className="message-file-link" href={message.fileUrl} target="_blank" rel="noreferrer"><FileText size={19} /><span><strong>{message.fileName || "Document"}</strong><small>{formatFileSize(message.fileSize)}</small></span></a>}{message.text && <p>{message.text}</p>}<span>{formatTime(message.createdAt)} {mine && (activeConversation.isGroup ? <button type="button" className={`receipt-button ${message.readBy.length > 1 ? "receipt-read" : ""}`} onClick={() => showMessageReaders(message)} aria-label={`See who viewed this message; ${Math.max(message.readBy.length - 1, 0)} members have seen it`}><CheckCheck size={14} /></button> : (message.readBy.includes(friend.id) ? <CheckCheck size={14} className="read-check" /> : <Check size={14} className="sent-check" />))}</span></div>
                </div>;
              })}
              {typingUser && <div className="typing-bubble"><span /><span /><span /></div>}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={sendMessage}><div className="composer-attachment-wrap"><button type="button" className="composer-attachment-button" aria-label="Attach a file" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)} disabled={uploadingAttachment}><Paperclip size={17} /></button>{attachmentMenuOpen && <div className="attachment-menu"><button type="button" onClick={() => { setAttachmentMenuOpen(false); imageInputRef.current?.click(); }}><ImageIcon size={16} /> Photos</button><button type="button" onClick={() => { setAttachmentMenuOpen(false); documentInputRef.current?.click(); }}><FileText size={16} /> Files</button></div>}<input ref={imageInputRef} className="photo-file-input" type="file" accept="image/*" onChange={selectPhoto} /><input ref={documentInputRef} className="photo-file-input" type="file" onChange={selectDocument} /></div><div className="composer-input"><input value={draft} onChange={(event) => changeDraft(event.target.value)} onBlur={() => activeId && socket?.emit("typing:stop", activeId)} placeholder={activeConversation.isGroup ? `Message ${activeConversation.name}...` : `Message @${friend.username}...`} maxLength={4000} aria-label="Message" /><span className="composer-character-count">{uploadingAttachment ? "Uploading attachment…" : draft.length > 0 ? `${draft.length}/4000` : ""}</span></div><button type="submit" className="send-button" disabled={!draft.trim() || uploadingAttachment} aria-label="Send message"><Send size={17} /></button></form>
          </> : <div className="welcome-panel"><div className="welcome-art"><div className="art-sun" /><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-chat art-chat-back"><span /><span /><span /></div><div className="art-chat art-chat-front"><span /><span /></div><div className="art-star star-one">✳</div><div className="art-star star-two">✦</div></div><span className="section-kicker">A LITTLE SPACE FOR A GOOD CHAT</span><h2>Say hello to a<br /><span>better kind</span> of inbox.</h2><p>Your conversations, your pace. Choose someone on the left and pick up where life left off.</p><div className="welcome-tags"><span><i /> Real-time, always</span><span><ShieldCheck size={13} /> Just between you two</span></div><div className="welcome-bottom"><span>GOOD THINGS START WITH “HEY”</span><Sparkles size={16} /></div></div>}
        </section>
      </section>
      {assistantOpen && <div className="assistant-mobile-overlay"><AssistantPanel messages={assistantMessages} conversations={assistantConversations} conversationId={assistantConversationId} historyLoading={assistantHistoryLoading} historyOpen={assistantHistoryOpen} busy={assistantSending || assistantGeneratingImage} draft={assistantDraft} onDraftChange={changeAssistantDraft} onSubmit={sendAssistantMessage} onGenerateImage={generateAssistantImage} onNewConversation={startAssistantConversation} onSelectConversation={selectAssistantConversation} onToggleHistory={() => setAssistantHistoryOpen((open) => !open)} generatingImage={assistantGeneratingImage} attachment={assistantAttachment} onAttachmentChange={selectAssistantAttachment} sending={assistantSending} error={assistantError} onClose={() => setAssistantOpen(false)} /></div>}
      <button className={`assistant-launcher ${assistantOpen ? "assistant-launcher-open" : ""}`} type="button" aria-label={assistantOpen ? "Close Nexora Assistant" : "Open Nexora Assistant"} aria-expanded={assistantOpen} onClick={() => setAssistantOpen((open) => !open)}>
        {assistantOpen ? <X size={23} /> : <img className="assistant-launcher-icon" src={assistantIcon} alt="" />}
        {!assistantOpen && <span>AI</span>}
      </button>
      {groupDialogOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupDialogOpen(false); }}><section className="group-dialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title"><header className="group-dialog-header"><span className="group-dialog-icon"><Users size={19} /></span><button className="icon-button" onClick={() => setGroupDialogOpen(false)} aria-label="Close group creator"><X size={18} /></button></header><h2 id="group-dialog-title">Bring everyone together.</h2><p className="group-dialog-description">Create a group with people you’re already connected with.</p><form onSubmit={createGroup}><label htmlFor="group-name">Group name</label><input id="group-name" className="group-name-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Weekend plans" minLength={2} maxLength={50} required /><div className="member-list-heading"><span>YOUR CONNECTIONS</span><span>{selectedFriendIds.length} selected</span></div><div className="group-friend-list">{groupFriends.length ? groupFriends.map((member) => <label className={`group-friend-option ${selectedFriendIds.includes(member.id) ? "member-selected" : ""}`} key={member.id}><Avatar username={member.username} /><span className="group-friend-name">@{member.username}</span><input type="checkbox" checked={selectedFriendIds.includes(member.id)} onChange={() => toggleGroupMember(member.id)} /></label>) : <div className="no-group-friends"><Users size={22} /><strong>No connections yet</strong><span>Connect with a friend before creating a group.</span></div>}</div><button className="primary-button create-group-submit" type="submit" disabled={groupBusy || groupName.trim().length < 2 || selectedFriendIds.length === 0}>{groupBusy ? "Creating your group…" : <>Create group <ArrowDown size={15} className="arrow-diagonal" /></>}</button></form></section></div>}
      {groupManageOpen && activeConversation?.isGroup && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingGroup) setGroupManageOpen(false); }}><section className="group-dialog manage-group-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-group-title"><header className="group-dialog-header"><span className="group-dialog-icon"><Settings2 size={19} /></span><button className="icon-button" onClick={() => setGroupManageOpen(false)} aria-label="Close group management"><X size={18} /></button></header><h2 id="manage-group-title">{activeConversation.name}</h2><p className="group-dialog-description">{activeConversation.participants.length} members · Admins can add connected friends, change admin roles, and delete the group.</p><div className="member-list-heading"><span>GROUP MEMBERS</span><span>{activeConversation.participants.length} / 50</span></div><div className="group-friend-list">{activeConversation.participants.map((member) => { const admin = (activeConversation.admins || []).includes(member.id); const protectedAdmin = member.id === activeConversation.createdBy || member.id === user.id; return <div className="group-friend-option group-member-option" key={member.id}><Avatar username={member.username} /><span className="group-friend-name">@{member.username}{member.id === activeConversation.createdBy && <small> creator</small>}</span>{admin ? <><span className="admin-badge"><ShieldCheck size={12} /> Admin</span>{isActiveGroupAdmin && !protectedAdmin && <button className="remove-admin-button" disabled={Boolean(promotingMemberId)} onClick={() => removeGroupAdmin(member)} aria-label={`Remove admin role from @${member.username}`}>{promotingMemberId === member.id ? "Removing…" : "Remove admin"}</button>}</> : isActiveGroupAdmin ? <button className="promote-admin-button" disabled={Boolean(promotingMemberId)} onClick={() => promoteGroupMember(member)} aria-label={`Make @${member.username} an admin`}>{promotingMemberId === member.id ? "…" : <><ShieldCheck size={13} /> Make admin</>}</button> : null}</div>; })}</div>{isActiveGroupAdmin && <><section className="add-group-members-section"><button className="primary-button open-add-members-button" onClick={openAddMemberPicker} disabled={loadingMemberCandidates || activeConversation.participants.length >= 50}><UserPlus size={15} /> {loadingMemberCandidates ? "Loading connections…" : "Add members"}</button>{addMemberPickerOpen && <form className="add-group-members-form" onSubmit={addGroupMembers}><div className="member-list-heading"><span>YOUR CONVERSATIONS & REQUESTS</span><span>{selectedNewMemberIds.length} selected</span></div><p className="member-picker-hint">Choose people you have chatted with or exchanged a connection request with. Current group members are hidden.</p>{groupMemberOptions.length ? <><div className="group-friend-list add-member-list">{groupMemberOptions.map((member) => <label className={`group-friend-option ${selectedNewMemberIds.includes(member.id) ? "member-selected" : ""}`} key={member.id}><Avatar username={member.username} /><span className="group-friend-name">@{member.username}<small>{member.sources?.includes("conversation") && member.sources?.includes("request") ? "Conversation · request" : member.sources?.includes("conversation") ? "Conversation" : "Connection request"}</small></span><input type="checkbox" checked={selectedNewMemberIds.includes(member.id)} onChange={() => setSelectedNewMemberIds((selected) => selected.includes(member.id) ? selected.filter((id) => id !== member.id) : [...selected, member.id])} /></label>)}</div><button className="primary-button add-members-submit" type="submit" disabled={addingMembers || selectedNewMemberIds.length === 0 || activeConversation.participants.length + selectedNewMemberIds.length > 50}>{addingMembers ? "Adding members…" : <>Add selected members <UserPlus size={15} /></>}</button></> : <div className="no-group-friends existing-group-members"><Users size={20} /><strong>No one else to add</strong><span>Friends from your conversations and connection requests will appear here.</span></div>}</form>}</section><div className="delete-group-section">{confirmGroupDelete ? <><p>This permanently deletes <strong>{activeConversation.name}</strong> and all its messages for every member.</p><div><button className="cancel-delete-button" onClick={() => setConfirmGroupDelete(false)} disabled={deletingGroup}>Cancel</button><button className="delete-group-button" onClick={deleteGroup} disabled={deletingGroup}>{deletingGroup ? "Deleting…" : "Delete for everyone"}</button></div></> : <button className="delete-group-button" onClick={() => setConfirmGroupDelete(true)}><Trash2 size={15} /> Delete group for everyone</button>}</div></>}{!isActiveGroupAdmin && <p className="member-admin-note"><ShieldCheck size={14} /> Group changes and deletion are managed by admins.</p>}</section></div>}
      {viewedMessage && <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewedMessage(null); }}><section className="readers-dialog" role="dialog" aria-modal="true" aria-labelledby="readers-dialog-title"><header className="readers-dialog-header"><div><span className="section-kicker">GROUP MESSAGE</span><h2 id="readers-dialog-title">Seen by</h2></div><button className="icon-button" onClick={() => setViewedMessage(null)} aria-label="Close seen-by list"><X size={18} /></button></header><p className="readers-message-preview">{viewedMessage.text}</p><div className="readers-list">{(viewedMessage.readByUsers || []).filter((reader) => reader.id !== user.id).length ? viewedMessage.readByUsers.filter((reader) => reader.id !== user.id).map((reader) => <div className="reader-item" key={reader.id}><Avatar username={reader.username} /><span>@{reader.username}</span><CheckCheck size={15} className="reader-check" /></div>) : <div className="no-readers-yet">No one else has seen this message yet.</div>}</div></section></div>}
      {notice && <div className="toast-message" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
    </main>
  );
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatAssistantDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFileSize(size = 0) {
  if (size < 1024 * 1024) return `${size === 0 ? 0 : Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default App;
