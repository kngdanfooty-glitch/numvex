# NumVex

Virtual numbers, account boosting, gift cards and number rentals — one wallet, instant delivery, automatic refunds.

Monorepo (npm workspaces):

- `apps/web` — Next.js 16 landing page and auth screens
- `apps/api` — Express 5 + MongoDB auth API
- `packages/shared` — Zod schemas and money helpers shared by both

## Run it

```
npm install
cp apps/api/.env.example apps/api/.env
npm run db:mem   # terminal 1: local MongoDB (no Docker needed)
npm run dev      # terminal 2: API (:4000) + web (:3000)
npm test         # API tests
```

In development, emailed 6-digit codes are printed in the API terminal.
