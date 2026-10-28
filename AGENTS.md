# Agent notes

Monorepo (npm workspaces): `apps/web` (Next.js), `apps/api` (Express + MongoDB), `packages/shared` (Zod schemas, money helpers).

- **Validation**: Zod schemas live in `packages/shared/src/schemas/*` and are used by BOTH the web forms
  and the API. Change a rule once, it changes everywhere. Types come from `z.infer`.
- **Money**: currency is Nigerian naira (₦). Always an integer number of **kobo** (1 naira = 100 kobo). Format with `formatNaira` from `@numvexs/shared`.
- **API errors**: throw helpers from `apps/api/src/lib/errors.ts`; `app.ts` renders them as
  `{ error: { code, message, details? } }`.
- **Never reveal providers**: no user-facing error, toast, or message may name an upstream provider
  (DaisySMS, 5sim, SMSPool, panels, etc.) or an env var. Use generic wording such as
  "This server is temporarily unavailable. Try another server." and put the specific detail
  in `console.error` on the server instead.
- **Auth**: httpOnly cookies `mhub_access` (JWT, 15 min) + `mhub_refresh` (random, 7 days, hash stored in DB).
  Email verification and password reset use 6-digit codes (see `services/auth.service.ts`).
- **Brand**: blue + white, light theme. Tokens live in `apps/web/app/globals.css`.
- **Next.js 16**: read `node_modules/next/dist/docs/` before using unfamiliar APIs.

## Run it

```
npm run db:mem      # terminal 1: local MongoDB (no Docker needed)
npm run dev         # terminal 2: API (:4200) + web (:3300)
npm test            # API tests (in-memory MongoDB)
```

In dev, emailed codes are printed in the API terminal (no email key needed).
If `mongodb-memory-server` tries to download MongoDB, point it at a local binary:
`MONGOMS_SYSTEM_BINARY=/path/to/mongod`.
