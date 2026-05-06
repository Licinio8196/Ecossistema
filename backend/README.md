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
CLIENT_URL="https://ecossistema-chi.vercel.app"
CLIENT_URLS="https://ecossistema-chi.vercel.app,https://www.seu-dominio.com,http://localhost:5173"
```

## Publicacao sugerida

Render, Railway, Fly.io, VPS, DigitalOcean, AWS, Azure ou outro servidor Node.js.

Build command:

```bash
npm install && npm run db:push && npm run seed
```

Start command:

```bash
npm start
```

## Configuracao no Render

Se o frontend na Vercel mostrar `Failed to fetch` no login, o backend esta a falhar ou a base de dados ainda nao foi criada.

No Render, configure:

```text
Build Command: npm install && npm run db:push && npm run seed
Start Command: npm start
```

Variaveis obrigatorias:

```env
DATABASE_URL="file:./prod.db"
JWT_SECRET="crie-um-segredo-forte"
CLIENT_URL="https://ecossistema-chi.vercel.app"
CLIENT_URLS="https://ecossistema-chi.vercel.app,http://localhost:5173"
```

Para producao real, recomenda-se PostgreSQL no Render em vez de SQLite, porque ficheiros SQLite podem ser reiniciados em servicos gratuitos sem disco persistente.

## Uploads

Os uploads sao gravados em `server/uploads`.
Em producao, use disco persistente ou armazenamento externo como S3/Cloudinary.

## Deal Rooms

Inclui API para negociacao privada, mensagens, documentos, tarefas e reunioes:

- `GET /api/deal-rooms`
- `POST /api/deal-rooms`
- `GET /api/deal-rooms/:id`
- `PUT /api/deal-rooms/:id`
- `GET /api/deal-rooms/:id/messages`
- `GET /api/deal-rooms/:id/documents`
- `GET /api/deal-rooms/:id/meetings`
- `POST /api/deal-rooms/:id/meetings`
- `PUT /api/deal-rooms/:id/meetings/:meetingId`
- `DELETE /api/deal-rooms/:id/meetings/:meetingId`
- `PATCH /api/deal-rooms/:id/meetings/:meetingId/status`
