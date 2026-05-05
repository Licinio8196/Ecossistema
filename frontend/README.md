# RESIMOVEL Nexus Frontend

Frontend React + Vite + Tailwind do RESIMOVEL Nexus.

## Desenvolvimento local

```bash
npm install
cp .env.example .env
npm run dev
```

Abra `http://localhost:5173`.

## Variaveis de ambiente

```env
VITE_API_URL="https://api.seu-dominio.com"
VITE_SOCKET_URL="https://api.seu-dominio.com"
```

Em desenvolvimento local pode deixar vazio se usar o proxy do Vite, ou usar:

```env
VITE_API_URL="http://localhost:4000"
VITE_SOCKET_URL="http://localhost:4000"
```

## Build

```bash
npm run build
```

A pasta final e `dist/`.

## Publicacao sugerida

Vercel, Netlify, Cloudflare Pages ou qualquer hospedagem estatica.

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

