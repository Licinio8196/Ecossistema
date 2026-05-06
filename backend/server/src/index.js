import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const defaultClientOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://ecossistema-chi.vercel.app"
];
const configuredClientOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedClientOrigins = new Set([...defaultClientOrigins, ...configuredClientOrigins]);

function isAllowedClientOrigin(origin) {
  if (!origin) return true;
  if (allowedClientOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedClientOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
const io = new Server(server, {
  cors: corsOptions
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-");
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsDir));

const JWT_SECRET = process.env.JWT_SECRET || "resimovel-dev-secret";
const PORT = Number(process.env.PORT || 4000);
const nexusRoles = new Set(["PROFESSIONAL", "PREMIUM", "ADMIN"]);
const onlineUsers = new Map();

function fileUrls(files = []) {
  return files.map((file) => `/uploads/${file.filename}`);
}

function jsonText(value, fallback = []) {
  if (value === undefined || value === null || value === "") return JSON.stringify(fallback);
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value.split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return JSON.stringify(value);
}

function parseJsonValue(value, fallback = []) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeList(value) {
  const parsed = parseJsonValue(value, value ? [value] : []);
  return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
}

function coerceNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Autenticacao obrigatoria." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { profile: true } });
    if (!user) return res.status(401).json({ error: "Utilizador invalido." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Sessao invalida." });
  }
}

function nexusOnly(req, res, next) {
  if (!nexusRoles.has(req.user.role)) {
    return res.status(403).json({ error: "Acesso reservado a profissionais e contas premium." });
  }
  next();
}

function canEdit(req, ownerId) {
  return req.user.role === "ADMIN" || req.user.id === ownerId;
}

function postInclude(userId) {
  return {
    author: { include: { profile: true } },
    comments: { include: { author: { include: { profile: true } } }, orderBy: { createdAt: "asc" } },
    savedBy: userId ? { where: { userId } } : true
  };
}

const conversationInclude = {
  userA: { include: { profile: true } },
  userB: { include: { profile: true } },
  messages: { include: { sender: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }
};

const dealRoomInclude = {
  owner: { include: { profile: true } },
  invitedUser: { include: { profile: true } },
  messages: { include: { sender: { include: { profile: true } } }, orderBy: { createdAt: "asc" } },
  tasks: { orderBy: { createdAt: "asc" } },
  documents: { orderBy: { uploadedAt: "desc" } },
  meetings: { include: { createdBy: { include: { profile: true } } }, orderBy: [{ date: "asc" }, { time: "asc" }] },
  request: true
};

function isConversationParticipant(conversation, userId) {
  return conversation.userAId === userId || conversation.userBId === userId;
}

function isDealParticipant(dealRoom, userId, role) {
  const participants = parseJsonValue(dealRoom.participantIds, []);
  return role === "ADMIN" || dealRoom.ownerId === userId || dealRoom.invitedUserId === userId || participants.includes(userId);
}

async function createNotification(userId, type, title, body, link) {
  if (!userId) return null;
  const notification = await prisma.notification.create({ data: { userId, type, title, body, link } });
  io.to(`user:${userId}`).emit("notification:new", notification);
  return notification;
}

function dealParticipantIds(room) {
  return [...new Set([room.ownerId, room.invitedUserId, ...parseJsonValue(room.participantIds, [])].filter(Boolean))];
}

async function notifyDealParticipants(room, actorId, type, title, body) {
  const recipients = dealParticipantIds(room).filter((id) => id !== actorId);
  await Promise.all(recipients.map((userId) => createNotification(userId, type, title, body, `/deal-rooms/${room.id}`)));
}

async function withDealParticipants(room) {
  if (!room) return room;
  const ids = dealParticipantIds(room);
  const participants = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, include: { profile: true } })
    : [];
  return {
    ...room,
    participantIds: jsonText(ids),
    participants: participants.map(publicUser)
  };
}

async function compatiblePosts(request) {
  const posts = await prisma.post.findMany({
    where: {
      type: "PROPERTY",
      ...(request.location ? { location: { contains: request.location } } : {}),
      ...(request.propertyType ? { propertyType: request.propertyType } : {}),
      ...(request.bedrooms ? { bedrooms: { gte: request.bedrooms } } : {}),
      ...(request.budgetMax ? { price: { lte: request.budgetMax } } : {})
    },
    include: postInclude(),
    orderBy: { createdAt: "desc" },
    take: 12
  });
  return posts.map((post) => ({
    ...post,
    matchScore:
      45 +
      (post.location?.toLowerCase().includes(request.location.toLowerCase()) ? 20 : 0) +
      (post.propertyType === request.propertyType ? 15 : 0) +
      (request.budgetMax && post.price && post.price <= request.budgetMax ? 10 : 0) +
      (request.bedrooms && post.bedrooms && post.bedrooms >= request.bedrooms ? 10 : 0)
  }));
}

async function notifyCompatibleMatches(request) {
  const matches = await compatiblePosts(request);
  const uniqueAuthors = [...new Set(matches.map((post) => post.authorId).filter((id) => id !== request.authorId))];
  await Promise.all(
    uniqueAuthors.map((userId) =>
      createNotification(
        userId,
        "compatible_request",
        "Novo pedido compativel",
        `Existe um pedido em ${request.location} que pode encaixar no teu imovel.`,
        `/requests/${request.id}`
      )
    )
  );
  return matches;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "RESIMOVEL Nexus API" }));

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name, role = "PROFESSIONAL", company, location } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Nome, email e password sao obrigatorios." });

  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        role,
        profile: {
          create: {
            accountType: role === "ADMIN" ? "ADMIN" : role === "PREMIUM" ? "PREMIUM" : role === "PROFESSIONAL" ? "PROFESSIONAL" : "NORMAL",
            company,
            location,
            email
          }
        }
      },
      include: { profile: true }
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch {
    res.status(409).json({ error: "Email ja registado." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Credenciais invalidas." });
  }
  await prisma.user.update({ where: { id: user.id }, data: { isOnline: true, lastSeen: new Date() } });
  res.json({ token: signToken(user), user: publicUser({ ...user, isOnline: true }) });
});

app.get("/api/auth/me", auth, async (req, res) => {
  res.json({ user: publicUser(req.user), canAccessNexus: nexusRoles.has(req.user.role) });
});

app.get("/api/users", auth, nexusOnly, async (_req, res) => {
  const users = await prisma.user.findMany({ include: { profile: true }, orderBy: { createdAt: "desc" } });
  res.json(users.map(publicUser));
});

app.get("/api/users/:id", auth, nexusOnly, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { profile: true, posts: true, requests: true } });
  if (!user) return res.status(404).json({ error: "Utilizador nao encontrado." });
  res.json(publicUser(user));
});

app.get("/api/connections", auth, nexusOnly, async (req, res) => {
  const connections = await prisma.userConnection.findMany({
    where: { followerId: req.user.id },
    include: { following: { include: { profile: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(connections);
});

app.post("/api/users/:id/connect", auth, nexusOnly, async (req, res) => {
  const followingId = req.params.id;
  if (!followingId || followingId === req.user.id) return res.status(400).json({ error: "Utilizador invalido." });

  const user = await prisma.user.findUnique({ where: { id: followingId } });
  if (!user) return res.status(404).json({ error: "Utilizador nao encontrado." });

  const existing = await prisma.userConnection.findUnique({
    where: { followerId_followingId: { followerId: req.user.id, followingId } }
  });

  if (existing) {
    await prisma.userConnection.delete({ where: { id: existing.id } });
    return res.json({ connected: false });
  }

  const connection = await prisma.userConnection.create({
    data: { followerId: req.user.id, followingId },
    include: { following: { include: { profile: true } } }
  });
  await createNotification(followingId, "connection", "Novo contacto", `${req.user.name} conectou-se contigo.`, `/users/${req.user.id}`);
  res.status(201).json({ connected: true, connection });
});

app.put("/api/users/me", auth, nexusOnly, async (req, res) => {
  const { name, company, location, bio, phone, whatsapp, email, website, socialLinks } = req.body;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(name ? { name } : {}),
      profile: {
        upsert: {
          create: { company, location, bio, phone, whatsapp, email, website, socialLinks: jsonText(socialLinks, {}), accountType: req.user.profile?.accountType || "PROFESSIONAL" },
          update: { company, location, bio, phone, whatsapp, email, website, socialLinks: socialLinks === undefined ? undefined : jsonText(socialLinks, {}) }
        }
      }
    },
    include: { profile: true }
  });
  res.json(publicUser(user));
});

app.put("/api/users/me/photo", auth, nexusOnly, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Foto obrigatoria." });
  const profilePhoto = `/uploads/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      profile: {
        upsert: {
          create: { accountType: req.user.profile?.accountType || "PROFESSIONAL", profilePhoto },
          update: { profilePhoto }
        }
      }
    },
    include: { profile: true }
  });
  res.json(publicUser(user));
});

app.put("/api/users/me/cover", auth, nexusOnly, upload.single("cover"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Capa obrigatoria." });
  const coverPhoto = `/uploads/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      profile: {
        upsert: {
          create: { accountType: req.user.profile?.accountType || "PROFESSIONAL", coverPhoto },
          update: { coverPhoto }
        }
      }
    },
    include: { profile: true }
  });
  res.json(publicUser(user));
});

app.post("/api/posts", auth, nexusOnly, upload.array("images", 8), async (req, res) => {
  const post = await prisma.post.create({
    data: {
      type: req.body.type || "ANNOUNCEMENT",
      title: req.body.title,
      description: req.body.description,
      location: req.body.location,
      price: coerceNumber(req.body.price),
      propertyType: req.body.propertyType || null,
      businessType: req.body.businessType || null,
      bedrooms: coerceNumber(req.body.bedrooms),
      bathrooms: coerceNumber(req.body.bathrooms),
      images: jsonText(fileUrls(req.files)),
      authorId: req.user.id
    },
    include: postInclude(req.user.id)
  });
  res.status(201).json(post);
});

app.get("/api/posts", auth, nexusOnly, async (req, res) => {
  const { type, location, propertyType, businessType } = req.query;
  const posts = await prisma.post.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(location ? { location: { contains: String(location) } } : {}),
      ...(propertyType ? { propertyType } : {}),
      ...(businessType ? { businessType } : {})
    },
    include: postInclude(req.user.id),
    orderBy: { createdAt: "desc" }
  });
  res.json(posts);
});

app.get("/api/posts/:id", auth, nexusOnly, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id }, include: postInclude(req.user.id) });
  if (!post) return res.status(404).json({ error: "Publicacao nao encontrada." });
  res.json(post);
});

app.put("/api/posts/:id", auth, nexusOnly, upload.array("images", 8), async (req, res) => {
  const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Publicacao nao encontrada." });
  if (!canEdit(req, existing.authorId)) return res.status(403).json({ error: "Sem permissao para editar." });

  const images = req.files?.length ? jsonText(fileUrls(req.files)) : existing.images;
  const post = await prisma.post.update({
    where: { id: req.params.id },
    data: {
      type: req.body.type ?? existing.type,
      title: req.body.title ?? existing.title,
      description: req.body.description ?? existing.description,
      location: req.body.location ?? existing.location,
      price: req.body.price === undefined ? existing.price : coerceNumber(req.body.price),
      propertyType: req.body.propertyType ?? existing.propertyType,
      businessType: req.body.businessType ?? existing.businessType,
      bedrooms: req.body.bedrooms === undefined ? existing.bedrooms : coerceNumber(req.body.bedrooms),
      bathrooms: req.body.bathrooms === undefined ? existing.bathrooms : coerceNumber(req.body.bathrooms),
      images
    },
    include: postInclude(req.user.id)
  });
  res.json(post);
});

app.delete("/api/posts/:id", auth, nexusOnly, async (req, res) => {
  const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Publicacao nao encontrada." });
  if (!canEdit(req, existing.authorId)) return res.status(403).json({ error: "Sem permissao para apagar." });
  await prisma.post.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.post("/api/posts/:id/comments", auth, nexusOnly, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Publicacao nao encontrada." });
  const comment = await prisma.comment.create({
    data: { postId: post.id, authorId: req.user.id, body: req.body.body },
    include: { author: { include: { profile: true } } }
  });
  if (post.authorId !== req.user.id) {
    await createNotification(post.authorId, "post_comment", "Novo comentario", `${req.user.name} comentou a tua publicacao.`, `/posts/${post.id}`);
  }
  res.status(201).json(comment);
});

app.post("/api/posts/:id/save", auth, nexusOnly, async (req, res) => {
  const existing = await prisma.savedPost.findUnique({ where: { userId_postId: { userId: req.user.id, postId: req.params.id } } });
  if (existing) {
    await prisma.savedPost.delete({ where: { id: existing.id } });
    return res.json({ saved: false });
  }
  await prisma.savedPost.create({ data: { userId: req.user.id, postId: req.params.id } });
  res.json({ saved: true });
});

app.post("/api/requests", auth, nexusOnly, upload.array("attachments", 6), async (req, res) => {
  const request = await prisma.request.create({
    data: {
      businessType: req.body.businessType,
      propertyType: req.body.propertyType,
      location: req.body.location,
      budgetMin: coerceNumber(req.body.budgetMin),
      budgetMax: coerceNumber(req.body.budgetMax),
      bedrooms: coerceNumber(req.body.bedrooms),
      bathrooms: coerceNumber(req.body.bathrooms),
      urgency: req.body.urgency || "MEDIUM",
      description: req.body.description,
      clientValidated: req.body.clientValidated === "true" || req.body.clientValidated === true,
      contactPreference: req.body.contactPreference,
      attachments: jsonText(fileUrls(req.files)),
      authorId: req.user.id
    }
  });
  const post = await prisma.post.create({
    data: {
      type: "CLIENT_REQUEST",
      title: `Pedido: ${request.propertyType} em ${request.location}`,
      description: request.description,
      location: request.location,
      price: request.budgetMax,
      propertyType: request.propertyType,
      businessType: request.businessType,
      bedrooms: request.bedrooms,
      bathrooms: request.bathrooms,
      authorId: req.user.id,
      requestId: request.id
    }
  });
  const matches = await notifyCompatibleMatches(request);
  res.status(201).json({ ...request, post, matches });
});

app.get("/api/requests", auth, nexusOnly, async (req, res) => {
  const { location, propertyType, urgency, clientValidated, priceMin, priceMax } = req.query;
  const requests = await prisma.request.findMany({
    where: {
      ...(location ? { location: { contains: String(location) } } : {}),
      ...(propertyType ? { propertyType } : {}),
      ...(urgency ? { urgency } : {}),
      ...(clientValidated !== undefined ? { clientValidated: String(clientValidated) === "true" } : {}),
      ...(priceMin || priceMax
        ? {
            budgetMax: {
              ...(priceMin ? { gte: Number(priceMin) } : {}),
              ...(priceMax ? { lte: Number(priceMax) } : {})
            }
          }
        : {})
    },
    include: { author: { include: { profile: true } }, replies: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(requests);
});

app.get("/api/requests/:id", auth, nexusOnly, async (req, res) => {
  const request = await prisma.request.findUnique({
    where: { id: req.params.id },
    include: { author: { include: { profile: true } }, replies: { include: { author: { include: { profile: true } } } } }
  });
  if (!request) return res.status(404).json({ error: "Pedido nao encontrado." });
  res.json({ ...request, matches: await compatiblePosts(request) });
});

app.put("/api/requests/:id", auth, nexusOnly, upload.array("attachments", 6), async (req, res) => {
  const existing = await prisma.request.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Pedido nao encontrado." });
  if (!canEdit(req, existing.authorId)) return res.status(403).json({ error: "Sem permissao para editar." });
  const request = await prisma.request.update({
    where: { id: req.params.id },
    data: {
      businessType: req.body.businessType ?? existing.businessType,
      propertyType: req.body.propertyType ?? existing.propertyType,
      location: req.body.location ?? existing.location,
      budgetMin: req.body.budgetMin === undefined ? existing.budgetMin : coerceNumber(req.body.budgetMin),
      budgetMax: req.body.budgetMax === undefined ? existing.budgetMax : coerceNumber(req.body.budgetMax),
      bedrooms: req.body.bedrooms === undefined ? existing.bedrooms : coerceNumber(req.body.bedrooms),
      bathrooms: req.body.bathrooms === undefined ? existing.bathrooms : coerceNumber(req.body.bathrooms),
      urgency: req.body.urgency ?? existing.urgency,
      description: req.body.description ?? existing.description,
      clientValidated: req.body.clientValidated === undefined ? existing.clientValidated : req.body.clientValidated === "true" || req.body.clientValidated === true,
      contactPreference: req.body.contactPreference ?? existing.contactPreference,
      attachments: req.files?.length ? jsonText(fileUrls(req.files)) : existing.attachments
    }
  });
  res.json(request);
});

app.delete("/api/requests/:id", auth, nexusOnly, async (req, res) => {
  const existing = await prisma.request.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Pedido nao encontrado." });
  if (!canEdit(req, existing.authorId)) return res.status(403).json({ error: "Sem permissao para apagar." });
  await prisma.request.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.post("/api/requests/:id/reply", auth, nexusOnly, async (req, res) => {
  const request = await prisma.request.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Pedido nao encontrado." });
  const reply = await prisma.requestReply.create({
    data: { requestId: request.id, authorId: req.user.id, postId: req.body.postId || null, message: req.body.message },
    include: { author: { include: { profile: true } } }
  });
  if (request.authorId !== req.user.id) {
    await createNotification(request.authorId, "request_reply", "Resposta ao pedido", `${req.user.name} respondeu ao teu pedido.`, `/requests/${request.id}`);
  }
  res.status(201).json(reply);
});

app.get("/api/conversations", auth, nexusOnly, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: req.user.id }, { userBId: req.user.id }] },
    include: conversationInclude,
    orderBy: { updatedAt: "desc" }
  });
  res.json(conversations);
});

app.get("/api/conversations/:id", auth, nexusOnly, async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id }, include: conversationInclude });
  if (!conversation) return res.status(404).json({ error: "Conversa nao encontrada." });
  if (!isConversationParticipant(conversation, req.user.id) && req.user.role !== "ADMIN") return res.status(403).json({ error: "Conversa privada." });
  res.json(conversation);
});

app.post("/api/conversations", auth, nexusOnly, async (req, res) => {
  const otherUserId = req.body.userId;
  if (!otherUserId || otherUserId === req.user.id) return res.status(400).json({ error: "Utilizador invalido." });
  const existing = await prisma.conversation.findFirst({
    where: {
      OR: [
        { userAId: req.user.id, userBId: otherUserId },
        { userAId: otherUserId, userBId: req.user.id }
      ]
    },
    include: conversationInclude
  });
  if (existing) return res.json(existing);
  const conversation = await prisma.conversation.create({
    data: {
      userAId: req.user.id,
      userBId: otherUserId,
      relatedPostId: req.body.relatedPostId || null,
      relatedRequestId: req.body.relatedRequestId || null,
      relatedDealRoomId: req.body.relatedDealRoomId || null
    },
    include: conversationInclude
  });
  res.status(201).json(conversation);
});

app.post("/api/messages", auth, nexusOnly, upload.array("attachments", 6), async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.body.conversationId } });
  if (!conversation) return res.status(404).json({ error: "Conversa nao encontrada." });
  if (!isConversationParticipant(conversation, req.user.id) && req.user.role !== "ADMIN") return res.status(403).json({ error: "Conversa privada." });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: req.user.id,
      body: req.body.body || "",
      attachments: jsonText(fileUrls(req.files))
    },
    include: { sender: { include: { profile: true } } }
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  const recipient = conversation.userAId === req.user.id ? conversation.userBId : conversation.userAId;
  const notificationBody = message.body ? `${req.user.name}: ${message.body.slice(0, 80)}` : `${req.user.name} enviou anexo(s).`;
  await createNotification(recipient, "message", "Nova mensagem", notificationBody, `/messages/${conversation.id}`);
  io.to(`conversation:${conversation.id}`).emit("message:new", message);
  io.to(`user:${conversation.userAId}`).to(`user:${conversation.userBId}`).emit("message:new", message);
  res.status(201).json(message);
});

app.post("/api/deal-rooms", auth, nexusOnly, async (req, res) => {
  const participantIds = [...new Set([...normalizeList(req.body.participantIds), ...normalizeList(req.body.participants)].filter(Boolean))];
  const invitedUserId = req.body.invitedUserId || participantIds.find((id) => id !== req.user.id) || null;
  const dealRoom = await prisma.dealRoom.create({
    data: {
      title: req.body.title,
      businessType: req.body.businessType,
      propertyType: req.body.propertyType || null,
      location: req.body.location || null,
      estimatedPrice: coerceNumber(req.body.estimatedPrice ?? req.body.price),
      buyerClient: req.body.buyerClient,
      professionalName: req.body.professionalName,
      commissionAgreed: coerceNumber(req.body.commissionAgreed),
      commissionPercent: coerceNumber(req.body.commissionPercent),
      commissionSplit: jsonText(req.body.commissionSplit || []),
      sharePercentage: coerceNumber(req.body.sharePercentage),
      deadline: coerceDate(req.body.deadline),
      participantIds: jsonText(participantIds),
      requiredDocs: jsonText(req.body.requiredDocs || []),
      observations: req.body.observations || req.body.description,
      status: req.body.status || "OPEN",
      ownerId: req.user.id,
      invitedUserId,
      propertyPostId: req.body.propertyPostId || null,
      requestId: req.body.requestId || null
    },
    include: dealRoomInclude
  });
  await Promise.all(
    dealParticipantIds(dealRoom)
      .filter((id) => id !== req.user.id)
      .map((userId) => createNotification(userId, "deal_invite", "Convite para deal room", `${req.user.name} convidou-te para ${dealRoom.title}.`, `/deal-rooms/${dealRoom.id}`))
  );
  res.status(201).json(await withDealParticipants(dealRoom));
});

app.get("/api/deal-rooms", auth, nexusOnly, async (req, res) => {
  const rooms = await prisma.dealRoom.findMany({
    where: req.user.role === "ADMIN" ? {} : { OR: [{ ownerId: req.user.id }, { invitedUserId: req.user.id }, { participantIds: { contains: req.user.id } }] },
    include: dealRoomInclude,
    orderBy: { updatedAt: "desc" }
  });
  res.json(await Promise.all(rooms.map(withDealParticipants)));
});

app.get("/api/deal-rooms/:id", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({
    where: { id: req.params.id },
    include: dealRoomInclude
  });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  res.json(await withDealParticipants(room));
});

app.put("/api/deal-rooms/:id", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const nextParticipantIds =
    req.body.participantIds === undefined && req.body.participants === undefined
      ? parseJsonValue(room.participantIds, [])
      : [...new Set([...normalizeList(req.body.participantIds), ...normalizeList(req.body.participants)].filter(Boolean))];
  const updated = await prisma.dealRoom.update({
    where: { id: room.id },
    data: {
      title: req.body.title ?? room.title,
      status: req.body.status ?? room.status,
      businessType: req.body.businessType ?? room.businessType,
      propertyType: req.body.propertyType ?? room.propertyType,
      location: req.body.location ?? room.location,
      estimatedPrice: req.body.estimatedPrice === undefined ? room.estimatedPrice : coerceNumber(req.body.estimatedPrice),
      observations: req.body.observations ?? room.observations,
      invitedUserId: req.body.invitedUserId ?? room.invitedUserId,
      commissionAgreed: req.body.commissionAgreed === undefined ? room.commissionAgreed : coerceNumber(req.body.commissionAgreed),
      commissionPercent: req.body.commissionPercent === undefined ? room.commissionPercent : coerceNumber(req.body.commissionPercent),
      commissionSplit: req.body.commissionSplit === undefined ? room.commissionSplit : jsonText(req.body.commissionSplit || []),
      sharePercentage: req.body.sharePercentage === undefined ? room.sharePercentage : coerceNumber(req.body.sharePercentage),
      participantIds: jsonText(nextParticipantIds)
    },
    include: dealRoomInclude
  });
  await notifyDealParticipants(updated, req.user.id, "deal_updated", `Nova atividade na Deal Room ${updated.title}`, `${req.user.name} atualizou o negocio.`);
  res.json(await withDealParticipants(updated));
});

app.get("/api/deal-rooms/:id/messages", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const messages = await prisma.dealRoomMessage.findMany({
    where: { dealRoomId: room.id },
    include: { sender: { include: { profile: true } } },
    orderBy: { createdAt: "asc" }
  });
  res.json(messages);
});

app.post("/api/deal-rooms/:id/messages", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const message = await prisma.dealRoomMessage.create({
    data: { dealRoomId: room.id, senderId: req.user.id, body: req.body.body },
    include: { sender: { include: { profile: true } } }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  await notifyDealParticipants(room, req.user.id, "deal_message", `Nova atividade na Deal Room ${room.title}`, `${req.user.name}: ${(req.body.body || "Nova mensagem").slice(0, 90)}`);
  io.to(`deal:${room.id}`).emit("deal-message:new", message);
  dealParticipantIds(room).forEach((userId) => io.to(`user:${userId}`).emit("deal-message:new", message));
  res.status(201).json(message);
});

app.post("/api/deal-rooms/:id/tasks", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const task = await prisma.dealRoomTask.create({
    data: { dealRoomId: room.id, title: req.body.title, dueDate: coerceDate(req.body.dueDate), createdById: req.user.id }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  await notifyDealParticipants(room, req.user.id, "deal_task", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} adicionou uma tarefa.`);
  res.status(201).json(task);
});

app.patch("/api/deal-rooms/:id/tasks/:taskId/status", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const existingTask = await prisma.dealRoomTask.findFirst({ where: { id: req.params.taskId, dealRoomId: room.id } });
  if (!existingTask) return res.status(404).json({ error: "Tarefa nao encontrada." });
  const task = await prisma.dealRoomTask.update({
    where: { id: req.params.taskId },
    data: { done: req.body.done === undefined ? true : Boolean(req.body.done) }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  res.json(task);
});

app.get("/api/deal-rooms/:id/documents", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const documents = await prisma.dealRoomDocument.findMany({
    where: { dealRoomId: room.id },
    orderBy: { uploadedAt: "desc" }
  });
  res.json(documents);
});

app.post("/api/deal-rooms/:id/documents", auth, nexusOnly, upload.single("document"), async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  if (!req.file) return res.status(400).json({ error: "Documento obrigatorio." });
  const document = await prisma.dealRoomDocument.create({
    data: { dealRoomId: room.id, title: req.body.title || req.file.originalname, url: `/uploads/${req.file.filename}` }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  await notifyDealParticipants(room, req.user.id, "deal_document", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} enviou um documento.`);
  res.status(201).json(document);
});

app.post("/api/deal-rooms/:id/close", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const updated = await prisma.dealRoom.update({ where: { id: room.id }, data: { status: req.body.lost ? "LOST" : "CLOSED" } });
  await notifyDealParticipants(updated, req.user.id, "deal_updated", `Nova atividade na Deal Room ${updated.title}`, `${req.user.name} marcou o negocio como ${updated.status}.`);
  res.json(updated);
});

app.get("/api/deal-rooms/:id/meetings", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const meetings = await prisma.dealRoomMeeting.findMany({
    where: { dealRoomId: room.id },
    include: { createdBy: { include: { profile: true } } },
    orderBy: [{ date: "asc" }, { time: "asc" }]
  });
  res.json(meetings);
});

app.post("/api/deal-rooms/:id/meetings", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const meeting = await prisma.dealRoomMeeting.create({
    data: {
      dealRoomId: room.id,
      title: req.body.title,
      type: req.body.type,
      date: req.body.date,
      time: req.body.time,
      duration: coerceNumber(req.body.duration),
      participants: jsonText(req.body.participants || []),
      meetLink: req.body.meetLink,
      description: req.body.description,
      createdById: req.user.id
    },
    include: { createdBy: { include: { profile: true } } }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  await notifyDealParticipants(room, req.user.id, "deal_meeting", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} agendou uma chamada.`);
  res.status(201).json(meeting);
});

app.put("/api/deal-rooms/:id/meetings/:meetingId", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const existingMeeting = await prisma.dealRoomMeeting.findFirst({ where: { id: req.params.meetingId, dealRoomId: room.id } });
  if (!existingMeeting) return res.status(404).json({ error: "Chamada nao encontrada." });
  const meeting = await prisma.dealRoomMeeting.update({
    where: { id: req.params.meetingId },
    data: {
      title: req.body.title,
      type: req.body.type,
      date: req.body.date,
      time: req.body.time,
      duration: coerceNumber(req.body.duration),
      participants: req.body.participants === undefined ? undefined : jsonText(req.body.participants || []),
      meetLink: req.body.meetLink,
      description: req.body.description
    }
  });
  await notifyDealParticipants(room, req.user.id, "deal_meeting", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} atualizou uma chamada.`);
  res.json(meeting);
});

app.delete("/api/deal-rooms/:id/meetings/:meetingId", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const existingMeeting = await prisma.dealRoomMeeting.findFirst({ where: { id: req.params.meetingId, dealRoomId: room.id } });
  if (!existingMeeting) return res.status(404).json({ error: "Chamada nao encontrada." });
  await prisma.dealRoomMeeting.delete({ where: { id: req.params.meetingId } });
  await notifyDealParticipants(room, req.user.id, "deal_meeting", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} removeu uma chamada.`);
  res.status(204).end();
});

app.patch("/api/deal-rooms/:id/meetings/:meetingId/status", auth, nexusOnly, async (req, res) => {
  const room = await prisma.dealRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Deal room nao encontrada." });
  if (!isDealParticipant(room, req.user.id, req.user.role)) return res.status(403).json({ error: "Deal room privada." });
  const existingMeeting = await prisma.dealRoomMeeting.findFirst({ where: { id: req.params.meetingId, dealRoomId: room.id } });
  if (!existingMeeting) return res.status(404).json({ error: "Chamada nao encontrada." });
  const meeting = await prisma.dealRoomMeeting.update({
    where: { id: req.params.meetingId },
    data: { status: req.body.status || "SCHEDULED" }
  });
  await prisma.dealRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  await notifyDealParticipants(room, req.user.id, "deal_meeting", `Nova atividade na Deal Room ${room.title}`, `${req.user.name} atualizou o estado de uma chamada.`);
  res.json(meeting);
});

app.post("/api/groups", auth, nexusOnly, async (req, res) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Apenas admin pode criar grupos base." });
  const group = await prisma.group.create({ data: { name: req.body.name, description: req.body.description, category: req.body.category } });
  res.status(201).json(group);
});

app.get("/api/groups", auth, nexusOnly, async (req, res) => {
  const groups = await prisma.group.findMany({
    include: { members: true, posts: { orderBy: { createdAt: "desc" }, take: 3 }, messages: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { name: "asc" }
  });
  res.json(groups.map((group) => ({ ...group, joined: group.members.some((member) => member.userId === req.user.id) })));
});

app.get("/api/groups/:id", auth, nexusOnly, async (req, res) => {
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      members: { include: { user: { include: { profile: true } } } },
      posts: { include: { author: { include: { profile: true } } }, orderBy: { createdAt: "desc" } },
      messages: { include: { sender: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!group) return res.status(404).json({ error: "Grupo nao encontrado." });
  res.json(group);
});

app.post("/api/groups/:id/join", auth, nexusOnly, async (req, res) => {
  const existing = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: req.params.id, userId: req.user.id } } });
  if (existing) {
    await prisma.groupMember.delete({ where: { id: existing.id } });
    return res.json({ joined: false });
  }
  const member = await prisma.groupMember.create({ data: { groupId: req.params.id, userId: req.user.id } });
  res.status(201).json({ joined: true, member });
});

app.post("/api/groups/:id/posts", auth, nexusOnly, async (req, res) => {
  const post = await prisma.groupPost.create({
    data: { groupId: req.params.id, authorId: req.user.id, title: req.body.title, description: req.body.description },
    include: { author: { include: { profile: true } } }
  });
  res.status(201).json(post);
});

app.post("/api/groups/:id/messages", auth, nexusOnly, async (req, res) => {
  const message = await prisma.groupMessage.create({
    data: { groupId: req.params.id, senderId: req.user.id, body: req.body.body },
    include: { sender: { include: { profile: true } } }
  });
  io.to(`group:${req.params.id}`).emit("group-message:new", message);
  res.status(201).json(message);
});

app.get("/api/notifications", auth, nexusOnly, async (req, res) => {
  const notifications = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json(notifications);
});

app.post("/api/notifications/:id/read", auth, nexusOnly, async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user.id) return res.status(404).json({ error: "Notificacao nao encontrada." });
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  res.json(updated);
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !nexusRoles.has(user.role)) return next(new Error("unauthorized"));
    socket.user = user;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", async (socket) => {
  onlineUsers.set(socket.user.id, socket.id);
  socket.join(`user:${socket.user.id}`);
  await prisma.user.update({ where: { id: socket.user.id }, data: { isOnline: true, lastSeen: new Date() } });
  io.emit("presence:update", { userId: socket.user.id, isOnline: true });

  socket.on("conversation:join", (conversationId) => socket.join(`conversation:${conversationId}`));
  socket.on("deal:join", (dealRoomId) => socket.join(`deal:${dealRoomId}`));
  socket.on("group:join", (groupId) => socket.join(`group:${groupId}`));
  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to(`conversation:${conversationId}`).emit("typing", { userId: socket.user.id, isTyping });
  });
  socket.on("deal:typing", ({ dealRoomId, isTyping }) => {
    socket.to(`deal:${dealRoomId}`).emit("deal:typing", { dealRoomId, userId: socket.user.id, name: socket.user.name, isTyping });
  });

  socket.on("disconnect", async () => {
    onlineUsers.delete(socket.user.id);
    await prisma.user.update({ where: { id: socket.user.id }, data: { isOnline: false, lastSeen: new Date() } });
    io.emit("presence:update", { userId: socket.user.id, isOnline: false });
  });
});

server.listen(PORT, () => {
  console.log(`RESIMOVEL Nexus API running on http://localhost:${PORT}`);
});
