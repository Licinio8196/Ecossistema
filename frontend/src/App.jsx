import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { io } from "socket.io-client";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Edit3,
  Mail,
  FileText,
  Filter,
  Handshake,
  Home,
  ImagePlus,
  Lock,
  LogOut,
  MapPinned,
  MessageSquare,
  MoreHorizontal,
  PhoneCall,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Scale,
  Star,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

const postTypes = [
  ["PROPERTY", "Imovel disponivel"],
  ["CLIENT_REQUEST", "Cliente procura"],
  ["PARTNERSHIP", "Parceria"],
  ["ANNOUNCEMENT", "Anuncio livre"]
];

const businessTypes = [
  ["SALE", "Venda"],
  ["RENT", "Arrendamento"],
  ["BUY", "Compra"],
  ["INVESTMENT", "Investimento"]
];

const businessStyles = {
  SALE: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  RENT: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  BUY: "border-nexus-gold/50 bg-nexus-gold/18 text-nexus-gold",
  INVESTMENT: "border-violet-400/40 bg-violet-500/15 text-violet-200"
};

const postTypeStyles = {
  PROPERTY: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  CLIENT_REQUEST: "border-nexus-gold/45 bg-nexus-gold/12 text-nexus-gold",
  PARTNERSHIP: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  ANNOUNCEMENT: "border-white/15 bg-white/5 text-white/80"
};

const propertyTypes = [
  ["APARTMENT", "Apartamento"],
  ["HOUSE", "Vivenda"],
  ["LAND", "Terreno"],
  ["STORE", "Loja"],
  ["OFFICE", "Escritorio"],
  ["DEVELOPMENT", "Empreendimento"]
];

const urgencies = [
  ["LOW", "Baixa"],
  ["MEDIUM", "Media"],
  ["HIGH", "Alta"],
  ["URGENT", "Urgente"]
];

const dealStatuses = ["LEAD", "ANALYSIS", "VISIT", "PROPOSAL", "NEGOTIATION", "CONTRACT", "CLOSED", "LOST"];

const navItems = [
  ["feed", "Feed", Home],
  ["requests", "Pedidos", FileText],
  ["messages", "Mensagens", MessageSquare],
  ["dealrooms", "Deal rooms", BriefcaseBusiness],
  ["groups", "Grupos", UsersRound],
  ["map", "Mapa", MapPinned]
];

const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#d9b66f;border:3px solid #07151d;box-shadow:0 0 0 3px rgba(217,182,111,.28)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hydrateUser(user) {
  if (!user) return user;
  return {
    ...user,
    profile: user.profile ? { ...user.profile, socialLinks: parseJson(user.profile.socialLinks, {}) } : user.profile
  };
}

function hydratePost(post) {
  return {
    ...post,
    images: parseJson(post.images, []),
    author: hydrateUser(post.author),
    comments: (post.comments || []).map((comment) => ({ ...comment, author: hydrateUser(comment.author) }))
  };
}

function hydrateRequest(request) {
  return {
    ...request,
    attachments: parseJson(request.attachments, []),
    author: hydrateUser(request.author),
    replies: (request.replies || []).map((reply) => ({ ...reply, author: hydrateUser(reply.author) }))
  };
}

function hydrateConversation(conversation) {
  return {
    ...conversation,
    userA: hydrateUser(conversation.userA),
    userB: hydrateUser(conversation.userB),
    messages: (conversation.messages || []).map((message) => ({
      ...message,
      attachments: parseJson(message.attachments, []),
      sender: hydrateUser(message.sender)
    }))
  };
}

function hydrateDealRoom(room) {
  return {
    ...room,
    requiredDocs: parseJson(room.requiredDocs, []),
    owner: hydrateUser(room.owner),
    invitedUser: hydrateUser(room.invitedUser),
    messages: (room.messages || []).map((message) => ({ ...message, sender: hydrateUser(message.sender) }))
  };
}

function hydrateGroup(group) {
  return {
    ...group,
    posts: group.posts || [],
    messages: group.messages || [],
    members: group.members || []
  };
}

function label(list, value) {
  return list.find(([key]) => key === value)?.[1] || value || "-";
}

function businessClass(value) {
  return businessStyles[value] || "border-white/10 bg-white/5 text-nexus-muted";
}

function postTypeClass(value) {
  return postTypeStyles[value] || postTypeStyles.ANNOUNCEMENT;
}

function whatsappUrl(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function mediaUrl(value) {
  if (!value) return "";
  const url = String(value);
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  if (url.startsWith("/uploads")) return `${SOCKET_URL}${url}`;
  return url;
}

function isImageUrl(value) {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(String(value || "").split("?")[0]);
}

function shortId(value) {
  return String(value || "").slice(0, 8).toUpperCase();
}

function matchesSearch(values, term) {
  const query = String(term || "").trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function postMatchesSearch(post, term) {
  return matchesSearch(
    [
      post.id,
      post.authorId,
      post.author?.id,
      post.author?.name,
      post.author?.email,
      post.title,
      post.description,
      post.location,
      label(postTypes, post.type),
      label(businessTypes, post.businessType),
      label(propertyTypes, post.propertyType)
    ],
    term
  );
}

function money(value) {
  if (!value) return "Sob consulta";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function shortDate(value) {
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function headers(token, body) {
  const base = token ? { Authorization: `Bearer ${token}` } : {};
  if (body instanceof FormData) return base;
  return { ...base, "Content-Type": "application/json" };
}

async function api(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(token, options.body), ...(options.headers || {}) }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Pedido falhou.");
  }
  if (response.status === 204) return null;
  return response.json();
}

function Panel({ children, className = "" }) {
  return <section className={clsx("min-w-0 rounded-lg border border-white/10 bg-nexus-card shadow-premium", className)}>{children}</section>;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button
      className={clsx(
        "inline-flex min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-nexus-gold !text-[#07151d] hover:bg-[#e6c981] [&_*]:!text-[#07151d]",
        variant === "ghost" && "border border-white/10 bg-white/5 text-white hover:border-nexus-gold/60",
        variant === "danger" && "border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label: fieldLabel, children }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-nexus-muted">
      {fieldLabel}
      {children}
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-md border border-white/10 bg-[#0b1c22] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-nexus-gold/70";

function TextInput({ className = "", ...props }) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

function SelectInput({ children, className = "", ...props }) {
  return (
    <select className={clsx(inputClass, className)} {...props}>
      {children}
    </select>
  );
}

function TextArea({ className = "", ...props }) {
  return <textarea className={clsx(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-2 sm:p-4">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-auto rounded-lg border border-nexus-gold/30 bg-[#07151d] shadow-premium">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#07151d] px-3 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 truncate text-base font-semibold text-white sm:text-lg">{title}</h2>
          <Button variant="ghost" className="shrink-0" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Avatar({ user, size = "md" }) {
  const photo = user?.profile?.profilePhoto;
  const initials = (user?.name || "R")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={clsx(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-nexus-gold font-bold text-[#07151d]",
        size === "xl" ? "h-20 w-20 text-xl" : size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs"
      )}
    >
      {photo ? <img src={mediaUrl(photo)} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "PROFESSIONAL" });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form)
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-screen bg-[#07151d] p-4 text-white sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-6xl items-center gap-6 lg:min-h-[calc(100vh-48px)] lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-5 inline-flex items-center gap-3 rounded-md border border-nexus-gold/30 bg-white/5 px-4 py-3 text-nexus-gold">
            <ShieldCheck size={18} /> RESIMOVEL Nexus privado
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">Rede social profissional imobiliaria para quem trabalha negocio todos os dias.</h1>
          <p className="mt-5 max-w-2xl text-base text-nexus-muted sm:text-lg">Entre na sua area profissional e colabore com outros especialistas do mercado imobiliario.</p>
        </div>
        <Panel className="p-5">
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold">{mode === "login" ? "Entrar" : "Criar conta profissional"}</h2>
              <p className="text-sm text-nexus-muted">Aceda com as credenciais da sua conta RESIMOVEL Nexus.</p>
            </div>
            {mode === "register" && (
              <>
                <Field label="Nome">
                  <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </Field>
                <Field label="Tipo de conta">
                  <SelectInput value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    <option value="PROFESSIONAL">Profissional</option>
                    <option value="PREMIUM">Premium</option>
                  </SelectInput>
                </Field>
              </>
            )}
            <Field label="Email">
              <TextInput value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </Field>
            {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
            <Button type="submit">
              <Lock size={16} /> {mode === "login" ? "Entrar no Nexus" : "Registar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Criar nova conta" : "Voltar ao login"}
            </Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("resimovel_token"));
  const [me, setMe] = useState(null);
  const [view, setView] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [dealRooms, setDealRooms] = useState([]);
  const [activeDealRoomId, setActiveDealRoomId] = useState("");
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [connections, setConnections] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [modal, setModal] = useState(null);
  const [floatingChat, setFloatingChat] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [savedRequests, setSavedRequests] = useState([]);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0];
  const activeDealRoom = dealRooms.find((item) => item.id === activeDealRoomId) || dealRooms[0];
  const activeGroup = groups.find((item) => item.id === activeGroupId) || groups[0];
  const onlineUsers = users.filter((user) => user.isOnline && user.id !== me?.id);

  async function loadMe(activeToken = token) {
    if (!activeToken) return;
    try {
      const data = await api("/api/auth/me", {}, activeToken);
      setMe(hydrateUser(data.user));
      if (!data.canAccessNexus) setError("Acesso reservado a profissionais e contas premium.");
    } catch {
      localStorage.removeItem("resimovel_token");
      setToken("");
      setMe(null);
    }
  }

  async function loadAll(activeToken = token) {
    if (!activeToken) return;
    const [postData, requestData, userData, conversationData, roomData, groupData, connectionData, notificationData] = await Promise.all([
      api("/api/posts", {}, activeToken),
      api("/api/requests", {}, activeToken),
      api("/api/users", {}, activeToken),
      api("/api/conversations", {}, activeToken),
      api("/api/deal-rooms", {}, activeToken),
      api("/api/groups", {}, activeToken),
      api("/api/connections", {}, activeToken),
      api("/api/notifications", {}, activeToken)
    ]);
    setPosts(postData.map(hydratePost));
    setRequests(requestData.map(hydrateRequest));
    setUsers(userData.map(hydrateUser));
    setConversations(conversationData.map(hydrateConversation));
    setDealRooms(roomData.map(hydrateDealRoom));
    setGroups(groupData.map(hydrateGroup));
    setConnections(connectionData);
    setNotifications(notificationData);
    if (!activeConversationId && conversationData[0]) setActiveConversationId(conversationData[0].id);
    if (!activeDealRoomId && roomData[0]) setActiveDealRoomId(roomData[0].id);
    if (!activeGroupId && groupData[0]) setActiveGroupId(groupData[0].id);
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (me && token && !error) loadAll();
  }, [me?.id]);

  useEffect(() => {
    if (!token || !me || error) return undefined;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on("message:new", (message) => {
      const hydratedMessage = { ...message, attachments: parseJson(message.attachments, []), sender: hydrateUser(message.sender) };
      setConversations((items) => {
        const exists = items.some((conversation) => conversation.id === hydratedMessage.conversationId);
        if (!exists) {
          loadAll();
          return items;
        }
        return items.map((conversation) => {
          if (conversation.id !== hydratedMessage.conversationId) return conversation;
          const messages = conversation.messages || [];
          if (messages.some((item) => item.id === hydratedMessage.id)) return conversation;
          return { ...conversation, messages: [...messages, hydratedMessage], updatedAt: hydratedMessage.createdAt };
        });
      });
    });
    socket.on("deal-message:new", (message) => {
      setDealRooms((items) => items.map((room) => (room.id === message.dealRoomId ? { ...room, messages: [...(room.messages || []), message] } : room)));
    });
    socket.on("notification:new", (notification) => setNotifications((items) => [notification, ...items]));
    socket.on("presence:update", ({ userId, isOnline }) => setUsers((items) => items.map((user) => (user.id === userId ? { ...user, isOnline } : user))));
    return () => socket.disconnect();
  }, [token, me?.id, error]);

  async function handleLogin(data) {
    localStorage.setItem("resimovel_token", data.token);
    setToken(data.token);
      setMe(hydrateUser(data.user));
    setError("");
    await loadAll(data.token);
  }

  function logout() {
    localStorage.removeItem("resimovel_token");
    setToken("");
    setMe(null);
  }

  async function refresh() {
    await loadMe();
    await loadAll();
  }

  async function createPost(values) {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key !== "images" && value !== undefined && value !== null) form.append(key, value);
    });
    [...(values.images || [])].forEach((file) => form.append("images", file));
    await api("/api/posts", { method: "POST", body: form }, token);
    await loadAll();
  }

  async function createRequest(values) {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key !== "attachments" && value !== undefined && value !== null) form.append(key, value);
    });
    [...(values.attachments || [])].forEach((file) => form.append("attachments", file));
    await api("/api/requests", { method: "POST", body: form }, token);
    setModal(null);
    setView("requests");
    await loadAll();
  }

  async function deletePost(post) {
    if (!window.confirm("Apagar esta publicacao?")) return;
    await api(`/api/posts/${post.id}`, { method: "DELETE" }, token);
    await loadAll();
  }

  async function editPost(post) {
    setModal({ type: "editPost", post });
  }

  async function updatePost(postId, values) {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key !== "images" && value !== undefined && value !== null) form.append(key, value);
    });
    [...(values.images || [])].forEach((file) => form.append("images", file));
    await api(`/api/posts/${postId}`, { method: "PUT", body: form }, token);
    setModal(null);
    await loadAll();
  }

  async function commentPost(post) {
    const body = window.prompt("Comentario");
    if (!body) return;
    await api(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body }) }, token);
    await loadAll();
  }

  async function savePost(post) {
    await api(`/api/posts/${post.id}/save`, { method: "POST" }, token);
    await loadAll();
  }

  async function replyToRequest(request, postId = "") {
    const message = window.prompt("Mensagem para responder ao pedido");
    if (!message) return;
    await api(`/api/requests/${request.id}/reply`, { method: "POST", body: JSON.stringify({ message, postId }) }, token);
    await loadAll();
  }

  async function startConversation(userId, related = {}, mode = "page") {
    if (!userId || userId === me.id) return;
    if (mode === "floating") {
      setFloatingChat({ conversationId: "", userId, minimized: false });
    }
    const conversation = await api("/api/conversations", { method: "POST", body: JSON.stringify({ userId, ...related }) }, token);
    const hydratedConversation = hydrateConversation(conversation);
    setConversations((items) => {
      const exists = items.some((item) => item.id === hydratedConversation.id);
      return exists ? items.map((item) => (item.id === hydratedConversation.id ? hydratedConversation : item)) : [hydratedConversation, ...items];
    });
    setActiveConversationId(conversation.id);
    if (mode === "floating") {
      setFloatingChat({ conversationId: conversation.id, userId, minimized: false });
      await loadAll();
      return;
    }
    setView("messages");
    await loadAll();
  }

  async function sendMessage(conversationId, body, files) {
    if (!body && !files?.length) return;
    const form = new FormData();
    form.append("conversationId", conversationId);
    form.append("body", body || "");
    [...(files || [])].forEach((file) => form.append("attachments", file));
    await api("/api/messages", { method: "POST", body: form }, token);
    await loadAll();
  }

  async function connectUser(userId) {
    const result = await api(`/api/users/${userId}/connect`, { method: "POST" }, token);
    setConnections((items) => {
      if (!result.connected) return items.filter((item) => item.followingId !== userId);
      return [result.connection, ...items.filter((item) => item.followingId !== userId)];
    });
    await loadAll();
  }

  async function readNotification(notification) {
    if (!notification.readAt) {
      const updated = await api(`/api/notifications/${notification.id}/read`, { method: "POST" }, token);
      setNotifications((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    }
    if (notification.link?.startsWith("/messages")) setView("messages");
    if (notification.link?.startsWith("/deal-rooms")) setView("dealrooms");
    if (notification.link?.startsWith("/requests")) setView("requests");
    if (notification.link?.startsWith("/posts")) setView("feed");
    if (notification.link?.startsWith("/users/")) setModal({ type: "userProfile", userId: notification.link.replace("/users/", "") });
  }

  async function createDealRoom(values) {
    await api("/api/deal-rooms", { method: "POST", body: JSON.stringify(values) }, token);
    setModal(null);
    setView("dealrooms");
    await loadAll();
  }

  async function sendDealMessage(roomId, body) {
    if (!body) return;
    await api(`/api/deal-rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify({ body }) }, token);
    await loadAll();
  }

  async function addDealTask(roomId) {
    const title = window.prompt("Nova tarefa");
    if (!title) return;
    await api(`/api/deal-rooms/${roomId}/tasks`, { method: "POST", body: JSON.stringify({ title }) }, token);
    await loadAll();
  }

  async function updateDealStatus(roomId, status) {
    await api(`/api/deal-rooms/${roomId}`, { method: "PUT", body: JSON.stringify({ status }) }, token);
    await loadAll();
  }

  async function closeDeal(roomId, lost = false) {
    await api(`/api/deal-rooms/${roomId}/close`, { method: "POST", body: JSON.stringify({ lost }) }, token);
    await loadAll();
  }

  async function joinGroup(groupId) {
    await api(`/api/groups/${groupId}/join`, { method: "POST" }, token);
    await loadAll();
  }

  async function createGroupPost(groupId) {
    const title = window.prompt("Titulo da publicacao");
    if (!title) return;
    const description = window.prompt("Descricao") || "";
    await api(`/api/groups/${groupId}/posts`, { method: "POST", body: JSON.stringify({ title, description }) }, token);
    await loadAll();
  }

  async function sendGroupMessage(groupId, body) {
    if (!body) return;
    await api(`/api/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ body }) }, token);
    await loadAll();
  }

  async function updateProfile(values) {
    const { profilePhotoFile, coverPhotoFile, ...profileValues } = values;
    await api("/api/users/me", { method: "PUT", body: JSON.stringify(profileValues) }, token);
    if (profilePhotoFile) {
      const form = new FormData();
      form.append("photo", profilePhotoFile);
      await api("/api/users/me/photo", { method: "PUT", body: form }, token);
    }
    if (coverPhotoFile) {
      const form = new FormData();
      form.append("cover", coverPhotoFile);
      await api("/api/users/me/cover", { method: "PUT", body: form }, token);
    }
    setModal(null);
    await loadMe();
    await loadAll();
  }

  if (!token || !me) return <AuthScreen onLogin={handleLogin} />;

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07151d] p-6 text-white">
        <Panel className="max-w-lg p-6 text-center">
          <Lock className="mx-auto mb-3 text-nexus-gold" />
          <h1 className="text-2xl font-semibold">Acesso bloqueado</h1>
          <p className="mt-2 text-nexus-muted">{error}</p>
          <Button className="mt-5" onClick={logout}>
            Sair
          </Button>
        </Panel>
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07151d] text-white">
      <Header me={me} view={view} setView={setView} logout={logout} notifications={notifications} setModal={setModal} searchTerm={searchTerm} setSearchTerm={setSearchTerm} readNotification={readNotification} />
      <main className="mx-auto grid w-full max-w-[1480px] gap-4 px-3 pb-24 pt-4 sm:px-4 sm:py-5">
        {view === "feed" && (
          <FeedPage
            me={me}
            posts={posts}
            requests={requests}
            groups={groups}
            onlineUsers={onlineUsers}
            setModal={setModal}
            createPost={createPost}
            commentPost={commentPost}
            savePost={savePost}
            editPost={editPost}
            deletePost={deletePost}
            startConversation={startConversation}
            replyToRequest={replyToRequest}
            setView={setView}
            searchTerm={searchTerm}
            openGallery={(images, index = 0) => setGallery({ images, index })}
          />
        )}
        {view === "requests" && (
          <RequestsPage
            requests={requests}
            setModal={setModal}
            startConversation={startConversation}
            replyToRequest={replyToRequest}
            savedRequests={savedRequests}
            setSavedRequests={setSavedRequests}
          />
        )}
        {view === "profile" && (
          <ProfilePage me={me} posts={posts} requests={requests} dealRooms={dealRooms} setModal={setModal} editPost={editPost} deletePost={deletePost} searchTerm={searchTerm} openGallery={(images, index = 0) => setGallery({ images, index })} />
        )}
        {view === "messages" && (
          <MessagesPage
            me={me}
            conversations={conversations}
            activeConversation={activeConversation}
            setActiveConversationId={setActiveConversationId}
            sendMessage={sendMessage}
          />
        )}
        {view === "dealrooms" && (
          <DealRoomsPage
            rooms={dealRooms}
            activeRoom={activeDealRoom}
            users={users}
            requests={requests}
            posts={posts}
            setActiveDealRoomId={setActiveDealRoomId}
            setModal={setModal}
            sendDealMessage={sendDealMessage}
            addDealTask={addDealTask}
            updateDealStatus={updateDealStatus}
            closeDeal={closeDeal}
          />
        )}
        {view === "groups" && (
          <GroupsPage groups={groups} activeGroup={activeGroup} setActiveGroupId={setActiveGroupId} joinGroup={joinGroup} createGroupPost={createGroupPost} sendGroupMessage={sendGroupMessage} />
        )}
        {view === "map" && <MapPage posts={posts} requests={requests} />}
      </main>

      {modal === "request" && <CreateRequestModal onClose={() => setModal(null)} onSubmit={createRequest} />}
      {modal?.type === "deal" && <CreateDealRoomModal users={users} requests={requests} posts={posts} seed={modal.seed} onClose={() => setModal(null)} onSubmit={createDealRoom} />}
      {modal?.type === "editPost" && <EditPostModal post={modal.post} onClose={() => setModal(null)} onSubmit={(values) => updatePost(modal.post.id, values)} />}
      {modal === "profile" && <EditProfileModal me={me} onClose={() => setModal(null)} onSubmit={updateProfile} />}
      {gallery && <ImageGalleryModal gallery={gallery} setGallery={setGallery} />}
      {modal?.type === "userProfile" && (
        <UserProfileModal
          user={users.find((user) => user.id === modal.userId) || posts.find((post) => post.authorId === modal.userId)?.author}
          posts={posts.filter((post) => post.authorId === modal.userId)}
          requests={requests.filter((request) => request.authorId === modal.userId)}
          onClose={() => setModal(null)}
          onContact={(userId) => startConversation(userId, {}, "floating")}
          onConnect={connectUser}
          connected={connections.some((item) => item.followingId === modal.userId)}
          me={me}
        />
      )}
      <FloatingChat
        me={me}
        users={users}
        onlineUsers={onlineUsers}
        conversations={conversations}
        floatingChat={floatingChat}
        setFloatingChat={setFloatingChat}
        startConversation={startConversation}
        sendMessage={sendMessage}
        setView={setView}
      />
    </div>
  );
}

function Header({ me, view, setView, logout, notifications, setModal, searchTerm, setSearchTerm, readNotification }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <header className="sticky top-0 z-40 border-b border-nexus-gold/20 bg-[#07151d]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] items-center gap-2 px-3 py-2.5 sm:px-4 lg:gap-3 lg:py-3">
        <button onClick={() => setView("feed")} className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-nexus-gold text-lg font-black text-[#07151d] sm:h-10 sm:w-10 sm:text-xl">R</span>
          <span className="hidden text-left md:block">
            <span className="block text-lg font-semibold tracking-normal xl:text-xl">RESIMOVEL Nexus</span>
            <span className="block text-[10px] uppercase tracking-[0.22em] text-nexus-gold">Rede profissional imobiliaria</span>
          </span>
        </button>
        <div className="hidden w-[28vw] max-w-[340px] flex-none items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-nexus-muted 2xl:flex">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/35"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setView("feed");
            }}
            placeholder="Pesquisar nome ou ID"
          />
        </div>
        <nav className="scrollbar-soft flex min-w-0 flex-1 justify-start gap-1 overflow-x-auto lg:justify-center">
          {navItems.map(([key, text, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition lg:px-3",
                view === key
                  ? "bg-nexus-gold !text-[#07151d] hover:bg-nexus-gold hover:!text-[#07151d] [&_*]:!text-[#07151d]"
                  : "text-nexus-muted hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={16} /> <span className="hidden xl:inline">{text}</span>
            </button>
          ))}
        </nav>
        <Button onClick={() => setModal("request")} className="hidden shrink-0 lg:inline-flex">
          <Plus size={16} /> Criar pedido
        </Button>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowNotifications((value) => !value)}
            className="relative rounded-md border border-white/10 bg-white/5 p-2 text-nexus-gold hover:border-nexus-gold/60"
            title="Notificacoes"
          >
            <Bell size={18} />
            {!!unreadCount && (
              <span className="absolute -right-2 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full bg-nexus-gold px-1 text-[10px] font-bold text-[#07151d]">
                {unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <Panel className="absolute right-0 top-12 z-50 w-[calc(100vw-24px)] max-w-[340px] overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <b>Notificacoes</b>
                <span className="text-xs text-nexus-muted">{unreadCount} nova(s)</span>
              </div>
              <div className="scrollbar-soft max-h-96 overflow-auto">
                {notifications.slice(0, 12).map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => {
                      readNotification(notification);
                      setShowNotifications(false);
                    }}
                    className={clsx("block w-full border-b border-white/10 p-3 text-left hover:bg-white/5", !notification.readAt && "bg-nexus-gold/10")}
                  >
                    <span className="flex items-start gap-2">
                      {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-nexus-gold" />}
                      <span className="min-w-0">
                        <b className="block truncate text-sm">{notification.title}</b>
                        <span className="mt-1 block text-xs leading-relaxed text-nexus-muted">{notification.body}</span>
                        <span className="mt-1 block text-[11px] text-nexus-gold">{shortDate(notification.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                ))}
                {!notifications.length && <div className="p-4 text-sm text-nexus-muted">Sem notificacoes por enquanto.</div>}
              </div>
            </Panel>
          )}
        </div>
        <button
          onClick={() => setView("profile")}
          title="Perfil"
          className={clsx(
            "shrink-0 rounded-full p-0.5 transition hover:ring-2 hover:ring-nexus-gold/70",
            view === "profile" && "ring-2 ring-nexus-gold"
          )}
        >
          <Avatar user={me} />
        </button>
        <button onClick={logout} className="inline-flex shrink-0 rounded-md border border-white/10 bg-white/5 p-2 text-nexus-muted hover:text-white">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function FeedPage(props) {
  const { me, posts, requests, groups, onlineUsers, setModal, createPost, setView, searchTerm } = props;
  const [typeFilter, setTypeFilter] = useState("");
  const filtered = posts.filter((post) => (!typeFilter || post.type === typeFilter) && postMatchesSearch(post, searchTerm));

  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:gap-5">
      <aside className="order-2 grid min-w-0 content-start gap-4 xl:order-1 xl:sticky xl:top-24">
        <Panel className="overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-[#0f2a32] to-[#2d3b3a]">
            {me.profile?.coverPhoto && <img src={mediaUrl(me.profile.coverPhoto)} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="-mt-10 p-4">
            <Avatar user={me} size="xl" />
            <h2 className="mt-3 text-lg font-semibold">{me.name}</h2>
            <p className="text-sm text-nexus-muted">{me.profile?.company || "Profissional RESIMOVEL"}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-md bg-white/5 p-2"><b className="block text-nexus-gold">{posts.filter((p) => p.authorId === me.id).length}</b>Posts</span>
              <span className="rounded-md bg-white/5 p-2"><b className="block text-nexus-gold">{requests.filter((r) => r.authorId === me.id).length}</b>Pedidos</span>
              <span className="rounded-md bg-white/5 p-2"><b className="block text-nexus-gold">{me.profile?.reputation || 90}</b>Score</span>
            </div>
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Filter size={16} /> Filtros</div>
          <div className="grid gap-2">
            <Button variant={typeFilter === "" ? "primary" : "ghost"} onClick={() => setTypeFilter("")}>Tudo</Button>
            {postTypes.map(([key, text]) => (
              <Button key={key} variant={typeFilter === key ? "primary" : "ghost"} onClick={() => setTypeFilter(key)}>
                {text}
              </Button>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 text-sm font-semibold">Atalhos</div>
          <div className="grid gap-2">
            <Button variant="ghost" onClick={() => setModal("request")}><FileText size={16} /> Criar pedido</Button>
            <Button variant="ghost" onClick={() => setModal({ type: "deal", seed: {} })}><BriefcaseBusiness size={16} /> Abrir deal room</Button>
            <Button variant="ghost" onClick={() => setView("map")}><MapPinned size={16} /> Ver mapa</Button>
          </div>
        </Panel>
      </aside>
      <section className="order-1 grid min-w-0 content-start gap-4 xl:order-2">
        <CreatePostBox onSubmit={createPost} />
        <div className="grid content-start gap-4">
          {searchTerm && (
            <div className="rounded-md border border-nexus-gold/20 bg-nexus-gold/10 px-3 py-2 text-sm text-nexus-gold">
              {filtered.length} resultado(s) para "{searchTerm}" por nome, ID de utilizador ou ID de publicacao.
            </div>
          )}
          {filtered.map((post) => <PostCard key={post.id} post={post} {...props} />)}
        </div>
      </section>
      <aside className="order-3 grid min-w-0 content-start gap-4 xl:sticky xl:top-24">
        <Panel className="p-4">
          <h3 className="mb-3 font-semibold">Pessoas online</h3>
          <div className="grid gap-3">
            {onlineUsers.slice(0, 6).map((user) => (
              <button key={user.id} onClick={() => props.startConversation(user.id, {}, "floating")} className="flex items-center gap-3 text-left">
                <span className="relative"><Avatar user={user} /><span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-nexus-card bg-green-400" /></span>
                <span><span className="block text-sm font-semibold">{user.name}</span><span className="text-xs text-nexus-muted">{user.profile?.company}</span></span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <h3 className="mb-3 font-semibold">Oportunidades quentes</h3>
          <div className="grid gap-3">
            {requests.slice(0, 4).map((request) => (
              <button key={request.id} onClick={() => setView("requests")} className="rounded-md border border-white/10 bg-white/5 p-3 text-left">
                <span className="text-sm font-semibold">{request.location} · {money(request.budgetMax)}</span>
                <span className="block text-xs text-nexus-muted">{label(propertyTypes, request.propertyType)} · {label(urgencies, request.urgency)}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <h3 className="mb-3 font-semibold">Grupos</h3>
          <div className="grid gap-2">
            {groups.slice(0, 6).map((group) => (
              <button key={group.id} onClick={() => setView("groups")} className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm">
                {group.name}<span className="text-nexus-gold">{group.members?.length || 0}</span>
              </button>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function CreatePostBox({ onSubmit }) {
  const [form, setForm] = useState({ type: "PROPERTY", title: "", description: "", location: "", price: "", propertyType: "APARTMENT", businessType: "SALE", bedrooms: "", bathrooms: "" });

  async function submit(event) {
    event.preventDefault();
    await onSubmit(form);
    setForm({ ...form, title: "", description: "", price: "", images: null });
    event.currentTarget.reset();
  }

  return (
    <Panel className="p-3 sm:p-4">
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {postTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </SelectInput>
          <TextInput placeholder="Titulo da publicacao" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </div>
        <TextArea placeholder="Descreva a oportunidade, imovel, pedido ou parceria" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput placeholder="Localizacao" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          <TextInput placeholder="Preco" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          <SelectInput value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
            {propertyTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </SelectInput>
          <SelectInput value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })}>
            {businessTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </SelectInput>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-nexus-muted">
            <ImagePlus size={16} /> Imagens
            <input type="file" multiple className="hidden" onChange={(event) => setForm({ ...form, images: event.target.files })} />
          </label>
          <Button type="submit" className="w-full sm:w-auto"><Send size={16} /> Publicar</Button>
        </div>
      </form>
    </Panel>
  );
}

function PostCard({ post, me, commentPost, savePost, editPost, deletePost, startConversation, replyToRequest, setModal, openGallery }) {
  const canEditPost = me.role === "ADMIN" || post.authorId === me.id;
  const saved = post.savedBy?.length > 0;
  const requestLike = post.type === "CLIENT_REQUEST";
  return (
    <article className="rounded-lg border border-white/10 bg-nexus-card shadow-premium transition hover:border-nexus-gold/35">
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setModal({ type: "userProfile", userId: post.authorId })} className="shrink-0">
            <Avatar user={post.author} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setModal({ type: "userProfile", userId: post.authorId })} className="font-semibold leading-tight hover:text-nexus-gold">
                {post.author?.name}
              </button>
              <span className="text-xs text-nexus-muted">· {shortDate(post.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-nexus-muted">{post.author?.profile?.company} · {post.location || "Portugal"}</p>
            <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-nexus-gold/80">
              <span title={post.authorId}>UID {shortId(post.authorId)}</span>
              <span title={post.id}>POST {shortId(post.id)}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className={clsx("rounded-md border px-2 py-1 text-[11px] font-semibold", postTypeClass(post.type))}>{label(postTypes, post.type)}</span>
            <span className={clsx("rounded-md border px-2 py-1 text-[11px] font-semibold", businessClass(post.businessType))}>{label(businessTypes, post.businessType)}</span>
            <button className="rounded-md p-1 text-nexus-muted hover:bg-white/5 hover:text-white">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h2 className="text-lg font-semibold leading-tight text-white sm:text-xl">{post.title || "Publicacao sem titulo"}</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-nexus-muted">{post.description || "Sem descricao."}</p>
        </div>

        {!!post.images?.length && (
          <div className="mt-3 grid max-w-xs grid-cols-3 gap-2 sm:max-w-sm sm:grid-cols-4 md:max-w-md">
            {post.images.slice(0, 4).map((image, index) => (
              <button
                key={image}
                onClick={() => openGallery(post.images, index)}
                className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/20"
              >
                <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover transition duration-200 hover:scale-105" />
                {index === 3 && post.images.length > 4 && (
                  <span className="absolute inset-0 grid place-items-center bg-black/60 text-lg font-bold text-white">+{post.images.length - 4}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-[#0b1c22] p-2.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <InfoPill label="Localizacao" value={post.location || "Sem localizacao"} />
          <InfoPill label={requestLike ? "Orcamento" : "Preco"} value={money(post.price)} highlight />
          <InfoPill label="Tipo" value={label(propertyTypes, post.propertyType)} />
          <InfoPill label="Negocio" value={label(businessTypes, post.businessType)} />
        </div>

        {!!post.comments?.length && (
          <div className="mt-4 grid gap-2 rounded-md border border-white/10 bg-white/5 p-3 text-sm">
            {post.comments.slice(-2).map((comment) => (
              <p key={comment.id}><b>{comment.author?.name}:</b> <span className="text-nexus-muted">{comment.body}</span></p>
            ))}
          </div>
        )}

        <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-nexus-muted hover:bg-white/5 hover:text-white" onClick={() => commentPost(post)}><MessageSquare size={15} /> Comentar</button>
            <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-nexus-muted hover:bg-white/5 hover:text-white" onClick={() => startConversation(post.authorId, { relatedPostId: post.id }, "floating")}><Send size={15} /> Contactar</button>
            <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-nexus-muted hover:bg-white/5 hover:text-white" onClick={() => requestLike ? replyToRequest({ id: post.requestId, authorId: post.authorId }) : setModal({ type: "deal", seed: { propertyPostId: post.id } })}><Handshake size={15} /> Tenho opcao</button>
            <button className={clsx("inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold hover:bg-white/5", saved ? "text-nexus-gold" : "text-nexus-muted hover:text-white")} onClick={() => savePost(post)}><Star size={15} /> Guardar</button>
            <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-nexus-muted hover:bg-white/5 hover:text-white" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 size={15} /> Partilhar</button>
          </div>
          {canEditPost && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-nexus-muted hover:bg-white/5 hover:text-white" onClick={() => editPost(post)}><Edit3 size={15} /> Editar</button>
              <button className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-red-200 hover:bg-red-500/10" onClick={() => deletePost(post)}><Trash2 size={15} /> Apagar</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function InfoPill({ label: title, value, highlight = false }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] uppercase tracking-wide text-nexus-muted">{title}</span>
      <b className={clsx("mt-1 block truncate text-sm", highlight ? "text-nexus-gold" : "text-white")}>{value || "-"}</b>
    </div>
  );
}

function RequestsPage({ requests, setModal, startConversation, replyToRequest, savedRequests, setSavedRequests }) {
  const [filters, setFilters] = useState({ location: "", propertyType: "", urgency: "", clientValidated: "" });
  const filtered = requests.filter((request) => {
    return (
      (!filters.location || request.location.toLowerCase().includes(filters.location.toLowerCase())) &&
      (!filters.propertyType || request.propertyType === filters.propertyType) &&
      (!filters.urgency || request.urgency === filters.urgency) &&
      (!filters.clientValidated || String(request.clientValidated) === filters.clientValidated)
    );
  });

  return (
    <div className="grid gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Pedidos de clientes</h1>
          <p className="text-nexus-muted">Filtre, responda com imovel, abra chat ou converta em deal room.</p>
        </div>
        <Button onClick={() => setModal("request")} className="w-full sm:w-auto"><Plus size={16} /> Criar pedido</Button>
      </div>
      <Panel className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
        <TextInput placeholder="Localizacao" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} />
        <SelectInput value={filters.propertyType} onChange={(event) => setFilters({ ...filters, propertyType: event.target.value })}>
          <option value="">Tipo de imovel</option>
          {propertyTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </SelectInput>
        <SelectInput value={filters.urgency} onChange={(event) => setFilters({ ...filters, urgency: event.target.value })}>
          <option value="">Urgencia</option>
          {urgencies.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </SelectInput>
        <SelectInput value={filters.clientValidated} onChange={(event) => setFilters({ ...filters, clientValidated: event.target.value })}>
          <option value="">Cliente validado</option>
          <option value="true">Sim</option>
          <option value="false">Nao</option>
        </SelectInput>
        <Button variant="ghost" onClick={() => setFilters({ location: "", propertyType: "", urgency: "", clientValidated: "" })}>Limpar</Button>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((request) => (
          <Panel key={request.id} className="grid gap-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-nexus-gold">{label(urgencies, request.urgency)} · {request.clientValidated ? "Cliente validado" : "Por validar"}</div>
                <h2 className="mt-1 text-xl font-semibold">{label(propertyTypes, request.propertyType)} em {request.location}</h2>
                <p className="mt-1 text-sm text-nexus-muted">{request.description}</p>
              </div>
              <div className="shrink-0 text-sm font-semibold text-nexus-gold sm:text-right">{money(request.budgetMin)} - {money(request.budgetMax)}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={clsx("rounded border px-2 py-1", businessClass(request.businessType))}>{label(businessTypes, request.businessType)}</span>
              <span className="rounded bg-white/5 px-2 py-1">{request.bedrooms || 0} quartos</span>
              <span className="rounded bg-white/5 px-2 py-1">{request.bathrooms || 0} WC</span>
              <span className="rounded bg-white/5 px-2 py-1">{shortDate(request.createdAt)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button variant="ghost" onClick={() => replyToRequest(request)}><Building2 size={15} /> Responder</Button>
              <Button variant="ghost" onClick={() => startConversation(request.authorId, { relatedRequestId: request.id }, "floating")}><MessageSquare size={15} /> Chat</Button>
              <Button variant="ghost" onClick={() => setModal({ type: "deal", seed: { requestId: request.id, buyerClient: request.author?.name } })}><BriefcaseBusiness size={15} /> Deal room</Button>
              <Button variant={savedRequests.includes(request.id) ? "primary" : "ghost"} onClick={() => setSavedRequests((items) => (items.includes(request.id) ? items.filter((id) => id !== request.id) : [...items, request.id]))}><Star size={15} /> Guardar</Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ProfilePage({ me, posts, requests, dealRooms, setModal, editPost, deletePost, searchTerm, openGallery }) {
  const [profileQuery, setProfileQuery] = useState("");
  const ownPosts = posts.filter((post) => post.authorId === me.id);
  const activeQuery = profileQuery || searchTerm;
  const visiblePosts = ownPosts.filter((post) => postMatchesSearch(post, activeQuery));
  const ownRequests = requests.filter((request) => request.authorId === me.id);
  return (
    <div className="grid gap-4 sm:gap-5">
      <Panel className="overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-[#0e2930] via-[#142f35] to-[#443a25] sm:h-44">
          {me.profile?.coverPhoto && <img src={mediaUrl(me.profile.coverPhoto)} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="-mt-10 grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <Avatar user={me} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold sm:text-3xl">{me.name}</h1>
              <p className="text-nexus-muted">{me.profile?.company} · {me.profile?.location} · {label([["PROFESSIONAL", "Profissional"], ["PREMIUM", "Premium"], ["ADMIN", "Admin"]], me.role)}</p>
              <p className="mt-1 font-mono text-xs text-nexus-gold">ID utilizador: {me.id}</p>
            </div>
          </div>
          <Button onClick={() => setModal("profile")} className="w-full sm:w-auto"><Edit3 size={16} /> Editar perfil</Button>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:gap-5">
        <aside className="grid h-fit gap-4">
          <Panel className="grid gap-3 p-4">
            <h2 className="font-semibold">Sobre</h2>
            <p className="text-sm text-nexus-muted">{me.profile?.bio || "Bio profissional por preencher."}</p>
            <InfoLine label="Telefone" value={me.profile?.phone} />
            <InfoLine label="WhatsApp" value={me.profile?.whatsapp} />
            <InfoLine label="Email" value={me.profile?.email || me.email} />
            <InfoLine label="Website" value={me.profile?.website} />
          </Panel>
          <Panel className="grid grid-cols-2 gap-3 p-4 text-center">
            <Metric icon={Star} label="Reputacao" value={`${me.profile?.rating || 4.8}/5`} />
            <Metric icon={CheckCircle2} label="Fechados" value={me.profile?.closedDeals || 0} />
            <Metric icon={MessageSquare} label="Resposta" value={me.profile?.averageResponseTime || "38 min"} />
            <Metric icon={BriefcaseBusiness} label="Deal rooms" value={dealRooms.length} />
          </Panel>
        </aside>
        <section className="grid gap-4">
          <Panel className="p-4">
            <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_minmax(240px,320px)] lg:items-center">
              <div>
                <h2 className="font-semibold">Publicacoes do utilizador</h2>
                <p className="text-xs text-nexus-muted">Pesquise por nome, ID do utilizador ou ID da publicacao.</p>
              </div>
              <TextInput
                value={profileQuery}
                onChange={(event) => setProfileQuery(event.target.value)}
                placeholder="Pesquisar publicacoes ou IDs"
              />
            </div>
            <div className="grid gap-3">
              {visiblePosts.map((post) => (
                <ProfilePostCard key={post.id} post={post} me={me} editPost={editPost} deletePost={deletePost} openGallery={openGallery} />
              ))}
              {!visiblePosts.length && (
                <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-nexus-muted">
                  Nenhuma publicacao encontrada para esta pesquisa.
                </div>
              )}
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="mb-3 font-semibold">Pedidos, imoveis e deal rooms ativos</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric icon={FileText} label="Pedidos criados" value={ownRequests.length} />
              <Metric icon={Building2} label="Imoveis publicados" value={ownPosts.filter((post) => post.type === "PROPERTY").length} />
              <Metric icon={BriefcaseBusiness} label="Deal rooms ativos" value={dealRooms.filter((room) => !["CLOSED", "LOST"].includes(room.status)).length} />
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function ProfilePostCard({ post, me, editPost, deletePost, openGallery }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/5 p-3 transition hover:border-nexus-gold/35">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-tight">{post.title || "Publicacao sem titulo"}</h3>
            <span className={clsx("rounded-md border px-2 py-1 text-[11px] font-semibold", postTypeClass(post.type))}>{label(postTypes, post.type)}</span>
            <span className={clsx("rounded-md border px-2 py-1 text-[11px] font-semibold", businessClass(post.businessType))}>{label(businessTypes, post.businessType)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-nexus-muted">{post.description || "Sem descricao."}</p>
          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-nexus-gold">
            <span className="rounded bg-black/20 px-2 py-1" title={post.id}>ID publicacao: {shortId(post.id)}</span>
            <span className="rounded bg-black/20 px-2 py-1" title={me.id}>ID utilizador: {shortId(me.id)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="ghost" onClick={() => editPost(post)}><Edit3 size={15} /> Editar</Button>
          <Button variant="danger" onClick={() => deletePost(post)}><Trash2 size={15} /> Apagar</Button>
        </div>
      </div>

      {!!post.images?.length && (
        <div className="mt-3 grid max-w-xs grid-cols-3 gap-2 sm:max-w-sm sm:grid-cols-4">
          {post.images.slice(0, 4).map((image, index) => (
            <button
              key={`${post.id}-${image}-${index}`}
              onClick={() => openGallery(post.images, index)}
              className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/20"
            >
              <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover transition duration-200 hover:scale-105" />
              {index === 3 && post.images.length > 4 && (
                <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-bold text-white">+{post.images.length - 4}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-[#0b1c22] p-2.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <InfoPill label="Localizacao" value={post.location || "Sem localizacao"} />
        <InfoPill label="Preco" value={money(post.price)} highlight />
        <InfoPill label="Tipo" value={label(propertyTypes, post.propertyType)} />
        <InfoPill label="Negocio" value={label(businessTypes, post.businessType)} />
      </div>
    </article>
  );
}

function InfoLine({ label: title, value }) {
  return <div className="flex flex-col gap-1 border-t border-white/10 pt-2 text-sm sm:flex-row sm:justify-between sm:gap-3"><span className="text-nexus-muted">{title}</span><span className="break-words sm:text-right">{value || "-"}</span></div>;
}

function Metric({ icon: Icon, label: title, value }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <Icon className="mx-auto mb-2 text-nexus-gold" size={18} />
      <b className="block text-lg">{value}</b>
      <span className="text-xs text-nexus-muted">{title}</span>
    </div>
  );
}

function MessagesPage({ me, conversations, activeConversation, setActiveConversationId, sendMessage }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState(null);
  const messageEndRef = useRef(null);
  const other = activeConversation ? (activeConversation.userAId === me.id ? activeConversation.userB : activeConversation.userA) : null;
  const activeLastMessageId = activeConversation?.messages?.[activeConversation.messages.length - 1]?.id;

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeConversation?.id, activeLastMessageId]);

  async function submit(event) {
    event.preventDefault();
    await sendMessage(activeConversation.id, body, files);
    setBody("");
    setFiles(null);
    event.currentTarget.reset();
  }

  return (
    <div className="grid min-h-[calc(100vh-120px)] gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(240px,300px)]">
      <Panel className="overflow-hidden">
        <div className="border-b border-white/10 p-4">
          <h1 className="font-semibold">Mensagens</h1>
          <TextInput className={inputClass} placeholder="Pesquisar conversas" />
        </div>
        <div className="scrollbar-soft max-h-[70vh] overflow-auto">
          {conversations.map((conversation) => {
            const person = conversation.userAId === me.id ? conversation.userB : conversation.userA;
            const last = conversation.messages?.[conversation.messages.length - 1];
            return (
              <button key={conversation.id} onClick={() => setActiveConversationId(conversation.id)} className={clsx("flex w-full gap-3 border-b border-white/10 p-3 text-left", activeConversation?.id === conversation.id && "bg-nexus-gold/10")}>
                <span className="relative"><Avatar user={person} />{person.isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-nexus-card bg-green-400" />}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm">{person.name}</b><span className="block truncate text-xs text-nexus-muted">{last?.body || (last?.attachments?.length ? `${last.attachments.length} anexo(s)` : "Sem mensagens")}</span></span>
                <span className="text-[11px] text-nexus-muted">{last ? shortDate(last.createdAt) : ""}</span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="flex min-h-[60vh] flex-col overflow-hidden lg:min-h-[70vh]">
        {activeConversation ? (
          <>
            <div className="flex min-w-0 items-center gap-3 border-b border-white/10 p-3 sm:p-4">
              <Avatar user={other} />
              <div className="min-w-0"><b className="block truncate">{other?.name}</b><p className="truncate text-xs text-nexus-muted">{other?.isOnline ? "Online" : "Offline"} · digitando aparece em tempo real via Socket.io</p></div>
            </div>
            <div className="scrollbar-soft flex-1 space-y-3 overflow-auto p-3 sm:p-4">
              {activeConversation.messages?.map((message) => (
                <div key={message.id} className={clsx("max-w-[88%] rounded-md p-3 text-sm sm:max-w-[78%]", message.senderId === me.id ? "ml-auto bg-nexus-gold text-[#07151d]" : "bg-white/5")}>
                  {message.body && <p>{message.body}</p>}
                  {!!message.attachments?.length && <MessageAttachments attachments={message.attachments} mine={message.senderId === me.id} />}
                  <span className="mt-1 block text-[11px] opacity-70">{shortDate(message.createdAt)} {message.readAt ? "· lida" : ""}</span>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>
            {!!files?.length && (
              <div className="border-t border-white/10 px-3 py-2 text-xs text-nexus-muted">
                {files.length} anexo(s) selecionado(s): {[...files].map((file) => file.name).join(", ")}
              </div>
            )}
            <form onSubmit={submit} className="grid gap-2 border-t border-white/10 p-3 sm:flex">
              <label className="grid cursor-pointer place-items-center rounded-md border border-white/10 bg-white/5 px-3" title="Anexar fotos ou documentos"><Upload size={16} /><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={(event) => setFiles(event.target.files)} /></label>
              <TextInput placeholder="Escreva uma mensagem" value={body} onChange={(event) => setBody(event.target.value)} />
              <Button disabled={!body && !files?.length}><Send size={16} /></Button>
            </form>
          </>
        ) : <div className="grid flex-1 place-items-center text-nexus-muted">Escolha uma conversa</div>}
      </Panel>
      <Panel className="h-fit p-4 lg:block">
        <h2 className="mb-3 font-semibold">Dados associados</h2>
        {other && (
          <div className="grid gap-3 text-sm">
            <Avatar user={other} size="lg" />
            <b>{other.name}</b>
            <span className="text-nexus-muted">{other.profile?.company}</span>
            <InfoLine label="Email" value={other.email} />
            <InfoLine label="Localizacao" value={other.profile?.location} />
            <Button variant="ghost">Arquivar conversa</Button>
            <Button variant="danger">Bloquear/reportar</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function MessageAttachments({ attachments, mine = false }) {
  return (
    <div className="mt-2 grid gap-2">
      {attachments.map((url) => {
        const href = mediaUrl(url);
        const name = String(url || "").split("/").pop();
        return (
          <a
            key={url}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={clsx(
              "block overflow-hidden rounded-md border text-xs underline-offset-2 hover:underline",
              mine ? "border-black/15 bg-black/10 text-[#07151d]" : "border-white/10 bg-black/20 text-white"
            )}
          >
            {isImageUrl(url) ? (
              <img src={href} alt={name || "Anexo"} className="max-h-44 w-full object-cover sm:max-h-56" />
            ) : (
              <span className="block p-2">{name || "Documento anexado"}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function FloatingChat({ me, users, onlineUsers, conversations, floatingChat, setFloatingChat, startConversation, sendMessage, setView }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [manageMode, setManageMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState([]);
  const [rowMenuId, setRowMenuId] = useState("");
  const floatingEndRef = useRef(null);
  const conversation = conversations.find((item) => item.id === floatingChat?.conversationId);
  const person =
    conversation
      ? conversation.userAId === me.id
        ? conversation.userB
        : conversation.userA
      : users.find((user) => user.id === floatingChat?.userId);
  const whatsapp = whatsappUrl(person?.profile?.whatsapp || person?.profile?.phone);
  const dockUser = me;
  const isChatOpen = !!floatingChat && !floatingChat.minimized && !!(conversation || person);
  const visibleConversations = conversations.filter((item) => {
    const other = item.userAId === me.id ? item.userB : item.userA;
    const last = item.messages?.[item.messages.length - 1];
    return matchesSearch([other?.name, other?.profile?.company, last?.body], messageQuery);
  });
  const suggestedUsers = users
    .filter((user) => user.id !== me.id)
    .filter((user) => matchesSearch([user.name, user.email, user.profile?.company, user.profile?.location, user.id], userQuery))
    .slice(0, 12);
  const floatingLastMessageId = conversation?.messages?.[conversation.messages.length - 1]?.id;

  useEffect(() => {
    if (floatingChat && !floatingChat.minimized) setDockOpen(true);
  }, [floatingChat?.conversationId, floatingChat?.minimized]);

  useEffect(() => {
    if (!isChatOpen) return;
    floatingEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isChatOpen, conversation?.id, floatingLastMessageId]);

  async function submit(event) {
    event.preventDefault();
    if (!conversation) return;
    await sendMessage(conversation.id, body, files);
    setBody("");
    setFiles(null);
    event.currentTarget.reset();
  }

  function otherUser(item) {
    return item.userAId === me.id ? item.userB : item.userA;
  }

  function openDock() {
    setDockOpen(true);
    setNewMessageOpen(false);
  }

  function closeDock() {
    setDockOpen(false);
    setShowOptions(false);
    setNewMessageOpen(false);
    setManageMode(false);
    setSelectedConversations([]);
    setRowMenuId("");
    setFloatingChat((state) => (state ? { ...state, minimized: true } : state));
  }

  function selectConversation(item) {
    const other = otherUser(item);
    setFloatingChat({ conversationId: item.id, userId: other?.id, minimized: false });
    setDockOpen(true);
    setNewMessageOpen(false);
    setManageMode(false);
    setRowMenuId("");
  }

  function openNewMessage() {
    setDockOpen(true);
    setNewMessageOpen(true);
    setShowOptions(false);
    setManageMode(false);
    setFloatingChat((state) => (state ? { ...state, minimized: true } : state));
  }

  function startNewConversation(userId) {
    startConversation(userId, {}, "floating");
    setNewMessageOpen(false);
    setDockOpen(true);
  }

  function toggleConversationSelection(id) {
    setSelectedConversations((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  }

  function openManageMode() {
    setDockOpen(true);
    setManageMode(true);
    setShowOptions(false);
    setNewMessageOpen(false);
    setRowMenuId("");
  }

  return (
    <div className="fixed bottom-0 right-2 z-50 flex max-w-[calc(100vw-16px)] items-end gap-2 text-[#1f1f1f] sm:right-3 sm:max-w-[calc(100vw-24px)]">
      {newMessageOpen && (
        <section className="absolute bottom-[42px] right-0 flex h-[calc(100vh-96px)] max-h-[500px] w-[calc(100vw-16px)] flex-col overflow-hidden rounded-t-lg border border-[#d8d3c8] bg-white shadow-[0_2px_18px_rgba(0,0,0,.22)] sm:w-[360px] md:static md:h-[500px]">
          <div className="flex h-11 items-center justify-between border-b border-[#e6e2dc] px-3">
            <b className="text-sm">Nova mensagem</b>
            <div className="flex items-center gap-2">
              <button className="rounded-full p-1 hover:bg-black/10" title="Expandir"><ChevronUp size={16} /></button>
              <button onClick={() => setNewMessageOpen(false)} className="rounded-full p-1 hover:bg-black/10" title="Fechar"><X size={16} /></button>
            </div>
          </div>
          <div className="border-b border-[#e6e2dc] p-2">
            <input
              autoFocus
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder="Insira um ou mais nomes"
              className="w-full rounded-full border border-[#1f1f1f] bg-white px-3 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="px-3 py-1.5 text-xs font-semibold text-[#666]">Sugestões</div>
          <div className="scrollbar-soft flex-1 overflow-auto">
            {suggestedUsers.map((user) => (
              <button key={user.id} onClick={() => startNewConversation(user.id)} className="flex w-full items-center gap-2 border-b border-[#e6e2dc] px-3 py-2 text-left hover:bg-[#f3f2ef]">
                <span className="relative">
                  <Avatar user={user} size="sm" />
                  {user.isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-sm">{user.name}</b>
                  <span className="block truncate text-xs text-[#666]">{user.profile?.company || user.profile?.bio || user.profile?.location || "Profissional RESIMOVEL"}</span>
                </span>
              </button>
            ))}
            {!suggestedUsers.length && <div className="p-4 text-sm text-[#666]">Nenhum utilizador encontrado.</div>}
          </div>
        </section>
      )}

      {isChatOpen && (
        <section className="absolute bottom-[42px] right-0 flex h-[calc(100vh-96px)] max-h-[500px] w-[calc(100vw-16px)] flex-col overflow-hidden rounded-t-lg border border-[#d8d3c8] bg-white shadow-[0_2px_18px_rgba(0,0,0,.22)] sm:w-[360px] md:static md:h-[500px]">
          <div className="flex h-11 items-center gap-2 border-b border-[#e6e2dc] px-3">
            <span className="relative">
              <Avatar user={person} size="sm" />
              {person?.isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{person?.name || "Conversa"}</b>
              <span className="block truncate text-[11px] text-[#666]">{person?.isOnline ? "Ativo agora" : "Dispositivo móvel"} · RESIMOVEL Nexus</span>
            </div>
            <button className="rounded-full p-1 hover:bg-black/10"><MoreHorizontal size={16} /></button>
            <button onClick={() => setFloatingChat((state) => ({ ...state, minimized: true }))} className="rounded-full p-1 hover:bg-black/10"><ChevronDown size={17} /></button>
            <button onClick={() => setFloatingChat(null)} className="rounded-full p-1 hover:bg-black/10"><X size={17} /></button>
          </div>
          <div className="scrollbar-soft flex-1 space-y-3 overflow-auto bg-white p-3">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                WhatsApp disponível
              </a>
            )}
            {(conversation?.messages || []).length ? (
              conversation.messages.map((message) => (
                <div key={message.id} className={clsx("flex gap-2", message.senderId === me.id && "justify-end")}>
                  {message.senderId !== me.id && <Avatar user={message.sender} size="sm" />}
                  <div className={clsx("max-w-[78%] rounded-lg px-2.5 py-1.5 text-sm", message.senderId === me.id ? "bg-[#e9e5df]" : "bg-[#f3f2ef]")}>
                    {message.body && <p className="whitespace-pre-line">{message.body}</p>}
                    {!!message.attachments?.length && <MessageAttachments attachments={message.attachments} mine={message.senderId === me.id} />}
                    <span className="mt-1 block text-[11px] text-[#666]">{shortDate(message.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-[#f3f2ef] p-3 text-sm text-[#666]">Conversa pronta. Envie a primeira mensagem.</div>
            )}
            <div ref={floatingEndRef} />
          </div>
          {!!files?.length && <div className="border-t border-[#e6e2dc] px-3 py-1.5 text-xs text-[#666]">{files.length} anexo(s) selecionado(s)</div>}
          <form onSubmit={submit} className="border-t border-[#e6e2dc] p-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escreva uma mensagem"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && (body || files?.length)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="min-h-16 w-full resize-none rounded-lg bg-[#f3f2ef] px-3 py-2 text-sm outline-none"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[#444]">
                <label className="cursor-pointer rounded-full p-1.5 hover:bg-black/10" title="Anexar fotos ou documentos">
                  <Upload size={16} />
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={(event) => setFiles(event.target.files)} />
                </label>
                <button type="button" className="rounded-full px-2 py-1 text-xs font-bold hover:bg-black/10">GIF</button>
                <button type="button" className="rounded-full p-1.5 hover:bg-black/10"><MoreHorizontal size={16} /></button>
              </div>
              <Button className="rounded-full px-4 py-1.5" disabled={!conversation || (!body && !files?.length)}>Enviar</Button>
            </div>
          </form>
        </section>
      )}

      <section className="relative w-[260px] max-w-[calc(100vw-16px)] overflow-visible rounded-t-lg border border-[#d8d3c8] bg-white shadow-[0_2px_18px_rgba(0,0,0,.22)] sm:w-[270px]">
        <div className="flex h-10 items-center gap-2 px-2.5">
          <button onClick={openDock} className="relative shrink-0">
            <Avatar user={dockUser} size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </button>
          <button onClick={openDock} className="min-w-0 flex-1 text-left text-sm font-semibold">
            Mensagens
          </button>
          <button onClick={() => setShowOptions((value) => !value)} className={clsx("rounded-full p-1 hover:bg-black/10", showOptions && "bg-[#eef3f8]")} title="Opcoes">
            <MoreHorizontal size={16} />
          </button>
          <button onClick={openNewMessage} className="rounded-full p-1 hover:bg-black/10" title="Nova mensagem">
            <Edit3 size={16} />
          </button>
          <button onClick={() => (dockOpen ? closeDock() : openDock())} className="rounded-full p-1 hover:bg-black/10" title={dockOpen ? "Minimizar" : "Abrir mensagens"}>
            {dockOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
        {showOptions && (
          <div className="absolute bottom-[42px] right-0 z-20 w-[260px] max-w-[calc(100vw-16px)] rounded-t-lg border border-[#d8d3c8] bg-white py-1.5 shadow-[0_2px_18px_rgba(0,0,0,.22)] sm:w-[270px]">
            <button onClick={openManageMode} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]">Gerenciar conversas</button>
            <button onClick={() => setView("messages")} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]">Abrir caixa de mensagens</button>
            <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]">Configurações de mensagens</button>
            <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]">Caixa de entrada de solicitações</button>
            <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]">Configurar ausência</button>
          </div>
        )}
        {dockOpen && (
          <div className="border-t border-[#e6e2dc]">
            {manageMode ? (
              <div className="flex h-10 items-center gap-2 border-b border-[#e6e2dc] px-2.5 text-sm text-[#666]">
                <button onClick={() => { setManageMode(false); setSelectedConversations([]); }} className="rounded-full p-1 hover:bg-black/10"><X size={17} /></button>
                <span className="flex-1">{selectedConversations.length} selecionada(s)</span>
                <button className="rounded-full p-1.5 hover:bg-black/10" title="Marcar como lida"><Mail size={16} /></button>
                <button onClick={() => setSelectedConversations([])} className="rounded-full p-1.5 hover:bg-black/10" title="Apagar seleção"><Trash2 size={16} /></button>
              </div>
            ) : (
              <div className="p-2">
                <div className="flex items-center gap-2 rounded bg-[#eef3f8] px-2.5 py-1.5">
                <Search size={16} className="text-[#666]" />
                <input value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} placeholder="Pesquisar mensagens" className="w-full bg-transparent text-sm outline-none placeholder:text-[#666]" />
                <Filter size={15} className="text-[#666]" />
                </div>
              </div>
            )}
            <div className="scrollbar-soft max-h-[55vh] overflow-auto sm:max-h-[330px]">
              {visibleConversations.map((item) => {
                const other = otherUser(item);
                const last = item.messages?.[item.messages.length - 1];
                const selected = selectedConversations.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={clsx("relative flex w-full gap-2 border-t border-[#e6e2dc] px-2.5 py-2 text-left hover:bg-[#f3f2ef]", conversation?.id === item.id && "bg-[#eef3f8]", selected && "bg-[#edf7f3]")}
                  >
                    {manageMode && (
                      <label className="mt-1 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border border-[#777] bg-white">
                        <input type="checkbox" checked={selected} onChange={() => toggleConversationSelection(item.id)} className="h-4 w-4 accent-[#0a66c2]" />
                      </label>
                    )}
                    <button onClick={() => (manageMode ? toggleConversationSelection(item.id) : selectConversation(item))} className="flex min-w-0 flex-1 gap-2 text-left">
                    <span className="relative">
                      <Avatar user={other} size="sm" />
                      {other?.isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <b className="truncate text-sm">{other?.name}</b>
                        <span className="shrink-0 text-[11px] text-[#666]">{last ? shortDate(last.createdAt) : ""}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#666]">{last?.body || (last?.attachments?.length ? `${last.attachments.length} anexo(s)` : other?.profile?.company || "Sem mensagens")}</span>
                    </span>
                    </button>
                    <button onClick={(event) => { event.stopPropagation(); setRowMenuId(rowMenuId === item.id ? "" : item.id); }} className="mt-1 h-6 shrink-0 rounded-full p-1 text-[#666] hover:bg-black/10">
                      <MoreHorizontal size={14} />
                    </button>
                    {rowMenuId === item.id && (
                      <div className="absolute right-2 top-8 z-30 w-40 rounded-md border border-[#d8d3c8] bg-white py-1 shadow-[0_2px_14px_rgba(0,0,0,.18)]">
                        <button onClick={() => selectConversation(item)} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[#f3f2ef]">Abrir conversa</button>
                        <button onClick={() => { setManageMode(true); toggleConversationSelection(item.id); setRowMenuId(""); }} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[#f3f2ef]">Selecionar</button>
                        <button className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[#f3f2ef]">Arquivar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!visibleConversations.length && <div className="border-t border-[#e6e2dc] p-4 text-sm text-[#666]">Nenhuma conversa encontrada.</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function UserProfileModal({ user, posts, requests, onClose, onContact, onConnect, connected, me }) {
  const [showOptions, setShowOptions] = useState(false);
  const isMe = user?.id === me?.id;
  if (!user) return null;
  return (
    <Modal title="Perfil profissional" onClose={onClose}>
      <div className="grid gap-5">
        <div className="overflow-hidden rounded-lg border border-white/10">
          <div className="h-28 bg-gradient-to-r from-[#0e2930] via-[#142f35] to-[#443a25] sm:h-36">
            {user.profile?.coverPhoto && <img src={mediaUrl(user.profile.coverPhoto)} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="-mt-8 flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-3 sm:gap-4">
              <Avatar user={user} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold sm:text-2xl">{user.name}</h2>
                <p className="text-sm text-nexus-muted">{user.profile?.company} · {user.profile?.location}</p>
              </div>
            </div>
            <div className="relative grid gap-2 sm:flex sm:flex-wrap">
              {!isMe && (
                <button
                  onClick={() => onConnect(user.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A66C2] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0755a3]"
                >
                  <UserPlus size={16} /> {connected ? "Conectado" : "Conectar"}
                </button>
              )}
              {!isMe && (
                <button
                  onClick={() => onContact(user.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#0A66C2] bg-white px-4 py-2 text-sm font-bold text-[#0A66C2] transition hover:bg-[#eef6ff]"
                >
                  <Send size={16} /> Enviar mensagem
                </button>
              )}
              <button
                onClick={() => setShowOptions((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white text-[#07151d] transition hover:border-nexus-gold"
                title="Mais opcoes"
              >
                <MoreHorizontal size={18} />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-12 z-10 w-52 rounded-lg border border-white/10 bg-[#0b1c22] p-2 shadow-premium">
                  <button onClick={() => navigator.clipboard?.writeText(user.id)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-nexus-muted hover:bg-white/5 hover:text-white">
                    Copiar ID do utilizador
                  </button>
                  {whatsappUrl(user.profile?.whatsapp || user.profile?.phone) && (
                    <button onClick={() => window.open(whatsappUrl(user.profile?.whatsapp || user.profile?.phone), "_blank")} className="block w-full rounded-md px-3 py-2 text-left text-sm text-nexus-muted hover:bg-white/5 hover:text-white">
                      Contactar por WhatsApp
                    </button>
                  )}
                  <button className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10">
                    Reportar perfil
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <Panel className="grid gap-3 p-4">
            <p className="text-sm text-nexus-muted">{user.profile?.bio || "Sem bio profissional."}</p>
            <InfoLine label="Avaliacao" value={`${user.profile?.rating || 4.8}/5`} />
            <InfoLine label="Reputacao" value={user.profile?.reputation} />
            <InfoLine label="Negocios fechados" value={user.profile?.closedDeals} />
            <InfoLine label="Tempo resposta" value={user.profile?.averageResponseTime} />
            <InfoLine label="Email" value={user.profile?.email || user.email} />
          </Panel>
          <div className="grid gap-4">
            <Panel className="p-4">
              <h3 className="mb-3 font-semibold">Publicacoes recentes</h3>
              <div className="grid gap-2">
                {posts.slice(0, 5).map((post) => (
                  <div key={post.id} className="rounded-md bg-white/5 p-3">
                    <b>{post.title}</b>
                    <p className="text-sm text-nexus-muted">{label(postTypes, post.type)} · {post.location || "Portugal"}</p>
                  </div>
                ))}
                {!posts.length && <p className="text-sm text-nexus-muted">Sem publicacoes recentes.</p>}
              </div>
            </Panel>
            <Panel className="p-4">
              <h3 className="mb-3 font-semibold">Pedidos criados</h3>
              <div className="grid gap-2">
                {requests.slice(0, 4).map((request) => (
                  <div key={request.id} className="rounded-md bg-white/5 p-3 text-sm">
                    {label(propertyTypes, request.propertyType)} em {request.location} · {money(request.budgetMax)}
                  </div>
                ))}
                {!requests.length && <p className="text-sm text-nexus-muted">Sem pedidos publicados.</p>}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ImageGalleryModal({ gallery, setGallery }) {
  const images = gallery.images || [];
  const current = images[gallery.index] || images[0];

  function move(delta) {
    setGallery((state) => {
      const next = (state.index + delta + state.images.length) % state.images.length;
      return { ...state, index: next };
    });
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-3 sm:p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-nexus-gold/30 bg-[#07151d] shadow-premium">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-semibold">Galeria de fotos</h2>
            <p className="text-xs text-nexus-muted">{gallery.index + 1} de {images.length}</p>
          </div>
          <button onClick={() => setGallery(null)} className="rounded-md p-2 text-nexus-muted hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="relative grid min-h-[260px] place-items-center bg-black/35 sm:min-h-[540px]">
          {images.length > 1 && (
            <button
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/45 text-2xl text-white hover:bg-black/65 sm:left-3 sm:h-11 sm:w-11"
            >
              &lsaquo;
            </button>
          )}
          <img src={mediaUrl(current)} alt="" className="max-h-[70vh] w-full object-contain" />
          {images.length > 1 && (
            <button
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/45 text-2xl text-white hover:bg-black/65 sm:right-3 sm:h-11 sm:w-11"
            >
              &rsaquo;
            </button>
          )}
        </div>

        {images.length > 1 && (
          <div className="scrollbar-soft flex gap-2 overflow-x-auto border-t border-white/10 p-3">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                onClick={() => setGallery((state) => ({ ...state, index }))}
                className={clsx("h-16 w-24 shrink-0 overflow-hidden rounded-md border", index === gallery.index ? "border-nexus-gold" : "border-white/10")}
              >
                <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DealRoomsPage({ rooms, activeRoom, users, requests, posts, setActiveDealRoomId, setModal, sendDealMessage, addDealTask, updateDealStatus, closeDeal }) {
  const [message, setMessage] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <Panel className="h-fit p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-semibold">Deal rooms</h1>
          <Button onClick={() => setModal({ type: "deal", seed: {} })}><Plus size={16} /></Button>
        </div>
        <div className="grid gap-3">
          {rooms.map((room) => (
            <button key={room.id} onClick={() => setActiveDealRoomId(room.id)} className={clsx("rounded-md border border-white/10 p-3 text-left", activeRoom?.id === room.id ? "bg-nexus-gold/10" : "bg-white/5")}>
              <b>{room.title}</b>
              <span className="block text-xs text-nexus-muted">{room.status} · {money(room.commissionAgreed)} · {room.sharePercentage || 0}%</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="p-4">
        {activeRoom ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-nexus-gold">{label(businessTypes, activeRoom.businessType)} · {activeRoom.status}</div>
                <h1 className="text-xl font-semibold sm:text-2xl">{activeRoom.title}</h1>
                <p className="text-nexus-muted">{activeRoom.observations}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => addDealTask(activeRoom.id)}><Plus size={16} /> Tarefa</Button>
                <Button variant="ghost"><UsersRound size={16} /> Convidar</Button>
                <Button onClick={() => closeDeal(activeRoom.id)}><CheckCircle2 size={16} /> Fechar</Button>
                <Button variant="danger" onClick={() => closeDeal(activeRoom.id, true)}>Cancelar</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={UserRound} label="Comprador" value={activeRoom.buyerClient || "-"} />
              <Metric icon={CircleDollarSign} label="Comissao" value={money(activeRoom.commissionAgreed)} />
              <Metric icon={Handshake} label="Partilha" value={`${activeRoom.sharePercentage || 0}%`} />
              <Metric icon={CalendarDays} label="Prazo" value={activeRoom.deadline ? new Date(activeRoom.deadline).toLocaleDateString("pt-PT") : "-"} />
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              <div className="grid gap-4">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <h2 className="mb-3 font-semibold">Estado do negocio</h2>
                  <div className="flex flex-wrap gap-2">
                    {dealStatuses.map((status) => <Button key={status} variant={activeRoom.status === status ? "primary" : "ghost"} onClick={() => updateDealStatus(activeRoom.id, status)}>{status}</Button>)}
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <h2 className="mb-3 font-semibold">Chat interno</h2>
                  <div className="mb-3 grid max-h-72 gap-2 overflow-auto">
                    {activeRoom.messages?.map((item) => <p key={item.id} className="rounded bg-black/20 p-2 text-sm"><b>{item.sender?.name || "User"}:</b> {item.body}</p>)}
                  </div>
                  <form className="grid gap-2 sm:flex" onSubmit={async (event) => { event.preventDefault(); await sendDealMessage(activeRoom.id, message); setMessage(""); }}>
                    <TextInput value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mensagem da deal room" />
                    <Button><Send size={16} /></Button>
                  </form>
                </div>
              </div>
              <div className="grid h-fit gap-4">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <h2 className="mb-3 font-semibold">Tarefas</h2>
                  <div className="grid gap-2">{activeRoom.tasks?.map((task) => <span key={task.id} className="rounded bg-black/20 p-2 text-sm">{task.done ? "OK" : "Pendente"} · {task.title}</span>)}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <h2 className="mb-3 font-semibold">Documentos</h2>
                  <div className="grid gap-2">{(activeRoom.requiredDocs || []).map((doc) => <span key={doc} className="rounded bg-black/20 p-2 text-sm">{doc}</span>)}</div>
                  <Button variant="ghost" className="mt-3"><Upload size={16} /> Upload</Button>
                </div>
              </div>
            </div>
          </div>
        ) : <div className="p-10 text-center text-nexus-muted">Sem deal rooms.</div>}
      </Panel>
    </div>
  );
}

function GroupsPage({ groups, activeGroup, setActiveGroupId, joinGroup, createGroupPost, sendGroupMessage }) {
  const [message, setMessage] = useState("");
  const isLegalGroup = activeGroup?.name?.toLowerCase().includes("jurid");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
      <Panel className="h-fit p-4">
        <h1 className="mb-4 font-semibold">Grupos profissionais</h1>
        <div className="grid gap-2">
          {groups.map((group) => (
            <button key={group.id} onClick={() => setActiveGroupId(group.id)} className={clsx("rounded-md border border-white/10 p-3 text-left", activeGroup?.id === group.id ? "bg-nexus-gold/10" : "bg-white/5")}>
              <b>{group.name}</b>
              <span className="block text-xs text-nexus-muted">{group.members?.length || 0} membros</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="p-4">
        {activeGroup ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="text-xl font-semibold sm:text-2xl">{activeGroup.name}</h1><p className="text-nexus-muted">{activeGroup.description}</p></div>
              <div className="grid gap-2 sm:flex"><Button variant="ghost" onClick={() => joinGroup(activeGroup.id)}>{activeGroup.joined ? "Sair" : "Entrar"}</Button><Button onClick={() => createGroupPost(activeGroup.id)}><Plus size={16} /> Publicar</Button></div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <div className="grid gap-3">
                <h2 className="font-semibold">Feed interno e pedidos partilhados</h2>
                {activeGroup.posts?.map((post) => <div key={post.id} className="rounded-md border border-white/10 bg-white/5 p-3"><b>{post.title}</b><p className="text-sm text-nexus-muted">{post.description}</p></div>)}
              </div>
              <div className="grid gap-4">
                {isLegalGroup && <SuggestedLawyersCard />}
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <h2 className="mb-3 font-semibold">Chat do grupo</h2>
                  <div className="mb-3 grid max-h-72 gap-2 overflow-auto">
                    {activeGroup.messages?.map((item) => <p key={item.id} className="rounded bg-black/20 p-2 text-sm">{item.body}</p>)}
                  </div>
                  <form className="grid gap-2 sm:flex" onSubmit={async (event) => { event.preventDefault(); await sendGroupMessage(activeGroup.id, message); setMessage(""); }}>
                    <TextInput value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mensagem para o grupo" />
                    <Button><Send size={16} /></Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : <div className="text-nexus-muted">Escolha um grupo.</div>}
      </Panel>
    </div>
  );
}

function SuggestedLawyersCard() {
  const lawyers = [
    { name: "Ines Carvalho", area: "Imobiliario e urbanismo", city: "Lisboa", rating: "4.9" },
    { name: "Rui Matos", area: "Contratos e due diligence", city: "Cascais", rating: "4.8" },
    { name: "Helena Duarte", area: "Fiscalidade internacional", city: "Porto", rating: "4.9" }
  ];

  return (
    <div className="rounded-md border border-nexus-gold/25 bg-nexus-gold/10 p-3">
      <div className="mb-3 flex items-center gap-2">
        <Scale size={17} className="text-nexus-gold" />
        <div>
          <h2 className="font-semibold">Advogados sugeridos por nos</h2>
          <p className="text-xs text-nexus-muted">Parceiros validados para transacoes imobiliarias.</p>
        </div>
      </div>
      <div className="grid gap-2">
        {lawyers.map((lawyer) => (
          <div key={lawyer.name} className="rounded-md border border-white/10 bg-[#0b1c22] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <b className="text-sm">{lawyer.name}</b>
                <p className="text-xs text-nexus-muted">{lawyer.area} · {lawyer.city}</p>
              </div>
              <span className="rounded bg-nexus-gold px-2 py-1 text-xs font-bold text-[#07151d]">{lawyer.rating}</span>
            </div>
            <Button variant="ghost" className="mt-3 w-full"><PhoneCall size={15} /> Solicitar contacto</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapPage({ posts, requests }) {
  const [filters, setFilters] = useState({ location: "", type: "" });
  const coords = { lisboa: [38.7223, -9.1393], cascais: [38.6979, -9.4215], porto: [41.1579, -8.6291], sintra: [38.8029, -9.3817], oeiras: [38.6968, -9.3146] };
  const points = [
    ...posts.filter((post) => post.type === "PROPERTY").map((post) => ({ kind: "Imovel", title: post.title, location: post.location, price: post.price })),
    ...requests.map((request) => ({ kind: "Pedido", title: `${label(propertyTypes, request.propertyType)} procurado`, location: request.location, price: request.budgetMax }))
  ].filter((point) => !filters.location || point.location?.toLowerCase().includes(filters.location.toLowerCase()));

  function position(location = "Lisboa") {
    const key = Object.keys(coords).find((item) => location.toLowerCase().includes(item));
    return coords[key || "lisboa"];
  }

  return (
    <div className="grid gap-4">
      <Panel className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        <TextInput placeholder="Localizacao" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} />
        <TextInput placeholder="Preco maximo" />
        <SelectInput value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
          <option value="">Tipo</option>
          {propertyTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </SelectInput>
        <Button variant="ghost">Aplicar filtros</Button>
      </Panel>
      <Panel className="overflow-hidden">
        <MapContainer center={[38.7223, -9.1393]} zoom={10} scrollWheelZoom>
          <TileLayer attribution="OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.map((point, index) => (
            <Marker key={`${point.kind}-${index}`} icon={markerIcon} position={position(point.location)}>
              <Popup><b>{point.kind}</b><br />{point.title}<br />{point.location} · {money(point.price)}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </Panel>
    </div>
  );
}

function CreateRequestModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    businessType: "BUY",
    propertyType: "APARTMENT",
    location: "",
    budgetMin: "",
    budgetMax: "",
    bedrooms: "",
    bathrooms: "",
    urgency: "MEDIUM",
    description: "",
    clientValidated: "true",
    contactPreference: "WhatsApp"
  });
  return (
    <Modal title="Criar pedido de cliente" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tipo de negocio"><SelectInput value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })}>{businessTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</SelectInput></Field>
          <Field label="Tipo de imovel"><SelectInput value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>{propertyTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</SelectInput></Field>
          <Field label="Localizacao"><TextInput required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Orcamento minimo"><TextInput type="number" value={form.budgetMin} onChange={(event) => setForm({ ...form, budgetMin: event.target.value })} /></Field>
          <Field label="Orcamento maximo"><TextInput type="number" value={form.budgetMax} onChange={(event) => setForm({ ...form, budgetMax: event.target.value })} /></Field>
          <Field label="Quartos"><TextInput type="number" value={form.bedrooms} onChange={(event) => setForm({ ...form, bedrooms: event.target.value })} /></Field>
          <Field label="Casas de banho"><TextInput type="number" value={form.bathrooms} onChange={(event) => setForm({ ...form, bathrooms: event.target.value })} /></Field>
          <Field label="Urgencia"><SelectInput value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value })}>{urgencies.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</SelectInput></Field>
          <Field label="Cliente validado"><SelectInput value={form.clientValidated} onChange={(event) => setForm({ ...form, clientValidated: event.target.value })}><option value="true">Sim</option><option value="false">Nao</option></SelectInput></Field>
          <Field label="Preferencia de contacto"><TextInput value={form.contactPreference} onChange={(event) => setForm({ ...form, contactPreference: event.target.value })} /></Field>
          <Field label="Anexos opcionais"><TextInput type="file" multiple onChange={(event) => setForm({ ...form, attachments: event.target.files })} /></Field>
        </div>
        <Field label="Descricao do que o cliente procura"><TextArea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <div className="grid gap-2 sm:flex sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button><Plus size={16} /> Criar pedido</Button></div>
      </form>
    </Modal>
  );
}

function CreateDealRoomModal({ onClose, onSubmit, users, requests, posts, seed = {} }) {
  const [form, setForm] = useState({
    title: "",
    businessType: "SALE",
    buyerClient: seed.buyerClient || "",
    professionalName: "",
    invitedUserId: "",
    propertyPostId: seed.propertyPostId || "",
    requestId: seed.requestId || "",
    commissionAgreed: "",
    sharePercentage: "50",
    deadline: "",
    requiredDocs: "Caderneta predial, Certificado energetico, Licenca de utilizacao",
    observations: ""
  });
  return (
    <Modal title="Abrir deal room" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, requiredDocs: form.requiredDocs.split(",").map((item) => item.trim()).filter(Boolean) }); }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Titulo do negocio"><TextInput required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Tipo de negocio"><SelectInput value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })}>{businessTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</SelectInput></Field>
          <Field label="Comprador/cliente"><TextInput value={form.buyerClient} onChange={(event) => setForm({ ...form, buyerClient: event.target.value })} /></Field>
          <Field label="Profissional convidado"><SelectInput value={form.invitedUserId} onChange={(event) => setForm({ ...form, invitedUserId: event.target.value, professionalName: users.find((user) => user.id === event.target.value)?.name || "" })}><option value="">Selecionar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</SelectInput></Field>
          <Field label="Imovel relacionado"><SelectInput value={form.propertyPostId} onChange={(event) => setForm({ ...form, propertyPostId: event.target.value })}><option value="">Nenhum</option>{posts.filter((post) => post.type === "PROPERTY").map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</SelectInput></Field>
          <Field label="Pedido relacionado"><SelectInput value={form.requestId} onChange={(event) => setForm({ ...form, requestId: event.target.value })}><option value="">Nenhum</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.location} · {money(request.budgetMax)}</option>)}</SelectInput></Field>
          <Field label="Comissao acordada"><TextInput type="number" value={form.commissionAgreed} onChange={(event) => setForm({ ...form, commissionAgreed: event.target.value })} /></Field>
          <Field label="Percentagem de partilha"><TextInput type="number" value={form.sharePercentage} onChange={(event) => setForm({ ...form, sharePercentage: event.target.value })} /></Field>
          <Field label="Prazo previsto"><TextInput type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></Field>
        </div>
        <Field label="Documentos necessarios"><TextInput value={form.requiredDocs} onChange={(event) => setForm({ ...form, requiredDocs: event.target.value })} /></Field>
        <Field label="Observacoes"><TextArea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></Field>
        <div className="grid gap-2 sm:flex sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button><BriefcaseBusiness size={16} /> Abrir deal room</Button></div>
      </form>
    </Modal>
  );
}

function EditPostModal({ post, onClose, onSubmit }) {
  const [form, setForm] = useState({
    type: post.type || "ANNOUNCEMENT",
    title: post.title || "",
    description: post.description || "",
    location: post.location || "",
    price: post.price || "",
    propertyType: post.propertyType || "APARTMENT",
    businessType: post.businessType || "SALE",
    bedrooms: post.bedrooms || "",
    bathrooms: post.bathrooms || "",
    images: null
  });
  const selectedImages = [...(form.images || [])].map((file) => URL.createObjectURL(file));
  const previewImages = selectedImages.length ? selectedImages : post.images || [];

  return (
    <Modal title="Editar publicacao" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <div className="rounded-md border border-nexus-gold/20 bg-nexus-gold/10 p-3 text-sm text-nexus-gold">
          ID da publicacao: <span className="font-mono">{post.id}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de publicacao">
            <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {postTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </SelectInput>
          </Field>
          <Field label="Negocio">
            <SelectInput value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })}>
              {businessTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </SelectInput>
          </Field>
          <Field label="Titulo"><TextInput value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Localizacao"><TextInput value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Preco"><TextInput type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
          <Field label="Tipo de imovel">
            <SelectInput value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
              {propertyTypes.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </SelectInput>
          </Field>
          <Field label="Quartos"><TextInput type="number" value={form.bedrooms} onChange={(event) => setForm({ ...form, bedrooms: event.target.value })} /></Field>
          <Field label="Casas de banho"><TextInput type="number" value={form.bathrooms} onChange={(event) => setForm({ ...form, bathrooms: event.target.value })} /></Field>
        </div>
        <Field label="Descricao"><TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        {!!previewImages.length && (
        <div className="grid max-w-xs grid-cols-3 gap-2 sm:max-w-md sm:grid-cols-4">
            {previewImages.slice(0, 4).map((image, index) => (
              <div key={`${image}-${index}`} className="aspect-square overflow-hidden rounded-md border border-white/10 bg-black/20">
                <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold hover:border-nexus-gold/60">
          <ImagePlus size={16} /> Substituir fotos
          <input type="file" multiple accept="image/*" className="hidden" onChange={(event) => setForm({ ...form, images: event.target.files })} />
        </label>
        <p className="text-xs text-nexus-muted">Se nao escolher novas fotos, as fotos atuais da publicacao continuam guardadas.</p>
        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button><Edit3 size={16} /> Guardar publicacao</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditProfileModal({ me, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: me.name || "",
    company: me.profile?.company || "",
    location: me.profile?.location || "",
    bio: me.profile?.bio || "",
    phone: me.profile?.phone || "",
    whatsapp: me.profile?.whatsapp || "",
    email: me.profile?.email || me.email || "",
    website: me.profile?.website || "",
    socialLinks: me.profile?.socialLinks || {}
  });
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [coverPhotoFile, setCoverPhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(mediaUrl(me.profile?.profilePhoto) || "");
  const [coverPhotoPreview, setCoverPhotoPreview] = useState(mediaUrl(me.profile?.coverPhoto) || "");
  const initials = (form.name || me.name || "R").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  function pickProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  }

  function pickCoverPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverPhotoFile(file);
    setCoverPhotoPreview(URL.createObjectURL(file));
  }

  return (
    <Modal title="Editar perfil profissional" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, profilePhotoFile, coverPhotoFile }); }}>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
          <div className="relative h-28 bg-gradient-to-r from-[#0e2930] via-[#142f35] to-[#443a25] sm:h-36">
            {coverPhotoPreview && <img src={mediaUrl(coverPhotoPreview)} alt="" className="h-full w-full object-cover" />}
            <label className="absolute bottom-3 right-3 cursor-pointer rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white hover:border-nexus-gold/60">
              Trocar capa
              <input type="file" accept="image/*" className="hidden" onChange={pickCoverPhoto} />
            </label>
          </div>
          <div className="-mt-8 flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex items-end gap-3 sm:gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[#07151d] bg-nexus-gold font-bold text-[#07151d]">
                {profilePhotoPreview ? <img src={mediaUrl(profilePhotoPreview)} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold hover:border-nexus-gold/60">
                  <ImagePlus size={16} /> Trocar foto
                  <input type="file" accept="image/*" className="hidden" onChange={pickProfilePhoto} />
                </label>
                <p className="mt-2 text-xs text-nexus-muted">A foto de perfil e a capa serao guardadas no perfil do utilizador.</p>
              </div>
            </div>
            <div className="rounded-md bg-black/20 px-3 py-2 font-mono text-xs text-nexus-gold">ID utilizador: {shortId(me.id)}</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Empresa/agencia"><TextInput value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></Field>
          <Field label="Localizacao"><TextInput value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Telefone"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="WhatsApp"><TextInput value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} /></Field>
          <Field label="Email"><TextInput value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Website"><TextInput value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></Field>
          <Field label="LinkedIn"><TextInput value={form.socialLinks.linkedin || ""} onChange={(event) => setForm({ ...form, socialLinks: { ...form.socialLinks, linkedin: event.target.value } })} /></Field>
        </div>
        <Field label="Bio profissional"><TextArea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></Field>
        <div className="grid gap-2 sm:flex sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button><Edit3 size={16} /> Guardar perfil</Button></div>
      </form>
    </Modal>
  );
}
