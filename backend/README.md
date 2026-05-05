# RESIMOVEL Nexus Backend

Backend Node.js + Express + Prisma + Socket.io do RESIMOVEL Nexus.

## Desenvolvimento local

```bash
npm install
cp .env.example .env
npm run db:push
npm run seed
npm run dev
```

API local:

```text
http://localhost:4000/api/health
```

## Variaveis de ambiente

```env
DATABASE_URL="file:./prod.db"
JWT_SECRET="trocar-este-segredo-em-producao"
PORT=4000
CLIENT_URL="https://www.seu-dominio.com"
```

## Publicacao sugerida

Render, Railway, Fly.io, VPS, DigitalOcean, AWS, Azure ou outro servidor Node.js.

Build command:

```bash
npm install
npm run db:push
```

Start command:

```bash
npm start
```

## Uploads

Os uploads sao gravados em `server/uploads`.
Em producao, use disco persistente ou armazenamento externo como S3/Cloudinary.

