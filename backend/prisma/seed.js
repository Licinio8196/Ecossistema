import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const password = await bcrypt.hash("resimovel123", 10);

async function upsertUser({ email, name, role, company, location, bio, closedDeals }) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      password,
      role,
      profile: {
        create: {
          accountType: role === "ADMIN" ? "ADMIN" : role === "PREMIUM" ? "PREMIUM" : role === "PROFESSIONAL" ? "PROFESSIONAL" : "NORMAL",
          company,
          location,
          bio,
          email,
          phone: "+351 210 000 000",
          whatsapp: "+351 910 000 000",
          website: "https://resimovel.pt",
          socialLinks: JSON.stringify({ linkedin: "https://linkedin.com/company/resimovel", instagram: "https://instagram.com/resimovel" }),
          closedDeals,
          reputation: 90 + Math.floor(Math.random() * 8)
        }
      }
    },
    include: { profile: true }
  });
}

const admin = await upsertUser({
  email: "admin@resimovel.pt",
  name: "Admin RESIMOVEL",
  role: "ADMIN",
  company: "RESIMOVEL",
  location: "Lisboa",
  bio: "Gestao da rede profissional RESIMOVEL Nexus.",
  closedDeals: 128
});

const premium = await upsertUser({
  email: "premium@resimovel.pt",
  name: "Marta Azevedo",
  role: "PREMIUM",
  company: "RESIMOVEL Prime",
  location: "Cascais",
  bio: "Especialista em residencial premium, investidores internacionais e private inventory.",
  closedDeals: 74
});

const professional = await upsertUser({
  email: "pro@resimovel.pt",
  name: "Diogo Ferreira",
  role: "PROFESSIONAL",
  company: "RESIMOVEL Lisboa",
  location: "Lisboa",
  bio: "Consultor imobiliario focado em comprador qualificado, referrals e produto urbano.",
  closedDeals: 39
});

await upsertUser({
  email: "normal@resimovel.pt",
  name: "Utilizador Normal",
  role: "USER",
  company: "Cliente",
  location: "Porto",
  bio: "Conta sem acesso ao Nexus.",
  closedDeals: 0
});

const groups = [
  ["Corretores", "Rede de corretores e consultores imobiliarios.", "broker"],
  ["Investidores", "Oportunidades para capital privado e family offices.", "investor"],
  ["Promotores", "Lancamentos, empreendimentos e parcerias de promocao.", "developer"],
  ["Credito", "Brokers e especialistas em financiamento.", "finance"],
  ["Juridico", "Advogados, solicitadores e compliance transacional.", "legal"],
  ["Empreendimentos", "Produto novo, projetos e inventario reservado.", "development"]
];

for (const [name, description, category] of groups) {
  const group = await prisma.group.upsert({
    where: { name },
    update: {},
    create: { name, description, category }
  });
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: admin.id } },
    update: {},
    create: { groupId: group.id, userId: admin.id, role: "admin" }
  });
}

const propertyPost = await prisma.post.create({
  data: {
    type: "PROPERTY",
    title: "T3 premium com vista rio no Chiado",
    description: "Imovel pronto a escriturar, ideal para cliente internacional com procura central e acabamento premium.",
    location: "Lisboa",
    price: 1450000,
    propertyType: "APARTMENT",
    businessType: "SALE",
    bedrooms: 3,
    bathrooms: 3,
    images: JSON.stringify([]),
    authorId: premium.id
  }
});

const request = await prisma.request.create({
  data: {
    businessType: "BUY",
    propertyType: "APARTMENT",
    location: "Lisboa",
    budgetMin: 900000,
    budgetMax: 1600000,
    bedrooms: 3,
    bathrooms: 2,
    urgency: "HIGH",
    description: "Cliente validado procura T3 ou T4 no centro de Lisboa, com garagem e bom acesso a escolas internacionais.",
    clientValidated: true,
    contactPreference: "WhatsApp",
    attachments: JSON.stringify([]),
    authorId: professional.id
  }
});

await prisma.post.create({
  data: {
    type: "CLIENT_REQUEST",
    title: "Pedido: apartamento em Lisboa ate 1.6M",
    description: request.description,
    location: "Lisboa",
    price: request.budgetMax,
    propertyType: "APARTMENT",
    businessType: "BUY",
    bedrooms: 3,
    bathrooms: 2,
    authorId: professional.id,
    requestId: request.id
  }
});

await prisma.post.create({
  data: {
    type: "PARTNERSHIP",
    title: "Procuro parceiro juridico para operacoes internacionais",
    description: "Tenho clientes de Franca e Reino Unido com compras em pipeline. Preciso de resposta rapida e experiencia fiscal.",
    location: "Lisboa",
    businessType: "INVESTMENT",
    images: JSON.stringify([]),
    authorId: premium.id
  }
});

await prisma.dealRoom.create({
  data: {
    title: "Deal room: Chiado T3 para cliente internacional",
    businessType: "SALE",
    propertyType: "APARTMENT",
    location: "Lisboa",
    estimatedPrice: 1450000,
    buyerClient: "Cliente relocation Londres",
    professionalName: professional.name,
    commissionAgreed: 43500,
    commissionPercent: 3,
    commissionSplit: JSON.stringify(["RESIMOVEL Prime 50%", "RESIMOVEL Lisboa 50%"]),
    sharePercentage: 50,
    participantIds: JSON.stringify([professional.id]),
    status: "NEGOTIATING",
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
    requiredDocs: JSON.stringify(["Caderneta predial", "Certificado energetico", "Licenca de utilizacao"]),
    observations: "Visita tecnica e proposta ate sexta-feira.",
    ownerId: premium.id,
    invitedUserId: professional.id,
    propertyPostId: propertyPost.id,
    requestId: request.id,
    tasks: {
      create: [
        { title: "Confirmar prova de fundos", createdById: premium.id },
        { title: "Agendar visita com cliente", createdById: premium.id }
      ]
    },
    meetings: {
      create: [
        {
          title: "Alinhamento inicial com cliente",
          type: "Reuniao inicial",
          date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10),
          time: "10:30",
          duration: 45,
          participants: JSON.stringify([premium.id, professional.id]),
          meetLink: "https://meet.google.com/",
          description: "Validar perfil do cliente, proximos passos e documentos.",
          createdById: premium.id
        }
      ]
    }
  }
});

console.log("Seed concluido. Logins: pro@resimovel.pt / premium@resimovel.pt / admin@resimovel.pt com password resimovel123");
await prisma.$disconnect();
