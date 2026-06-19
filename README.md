# Falka Monorepo

Turborepo for an Indonesian small-shop operations platform: inventory (a `StockLedger`
source-of-truth synced to marketplaces), offline POS/sales, purchasing, returns/RMA,
stock opname, packing-video recordings, reporting, and multi-tenant org/RBAC — plus a
background worker for marketplace sync and scheduled jobs.

## Stack

| Layer           | Technology                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Monorepo        | Turborepo + pnpm workspaces (pnpm@9, Node ≥20)                                                             |
| Web app         | Next.js 15 (App Router) + React 19 + custom Node server                                                    |
| Worker          | BullMQ background jobs (`apps/worker`)                                                                     |
| Styling         | Tailwind CSS v4 + shadcn/ui                                                                                |
| Server/UI state | TanStack Query v5 / Zustand v5                                                                             |
| Database        | Prisma + PostgreSQL                                                                                        |
| Cache/Queue     | Redis + BullMQ (marketplace sync, token refresh, cleanup)                                                  |
| Realtime        | Socket.IO (scanner pairing) — dev/VPS only                                                                 |
| Storage         | Cloudflare R2 (presigned uploads)                                                                          |
| Auth            | Auth.js v5 (JWT) + multi-org RBAC (Organization + OrgRole + permission catalog)                            |
| Logging         | Pino (structured JSON) via `@falka/logger`                                                                 |
| Tests           | Vitest (unit/integration) + Playwright (E2E)                                                               |
| Deployment      | Vercel + Neon today; **migrating to a self-hosted VPS** (see [docs/deployment](docs/deployment/README.md)) |

## Structure

```
apps/
  web/                  # Next.js fullstack app + custom Socket.IO server (server.ts)
  worker/               # BullMQ worker: marketplace sync, token refresh, drift, cleanup
packages/
  db/                   # Prisma schema + client + migrations
  config/               # Zod env validation, constants, limits
  logger/               # Pino structured logger
  utils/                # Pure utilities (crypto, money, etc.)
  types/                # Domain TypeScript types
  ui/                   # Shared React components
  queue/                # BullMQ queues/workers + marketplace-sync engine
  redis/ rate-limit/    # ioredis connection + rate limiting
  storage/              # R2 / S3 object helpers
  marketplace-providers/# Lazada / Shopee / TikTok(Tokopedia) API clients
  metrics/ health/      # Observability + health snapshots
  eslint-config/ typescript-config/  # Shared configs
docs/
  onboarding.md         # Local setup guide
  environment.md        # Env variable reference
  roadmap/              # Product roadmap + scoping
  deployment/           # Production deployment guides (Vercel today → VPS)
docker-compose.yml      # Local PostgreSQL + Redis
docker-compose.prod.yml # Self-hosted VPS stack (web + worker + PG + Redis + backup)
docker-compose.proxy.yml# Shared Caddy reverse proxy (VPS)
```

## Quick start

```bash
corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Sync server vars from .env → apps/web/.env.local (see docs/environment.md)
pnpm setup
pnpm dev
```

Full guide: [docs/onboarding.md](docs/onboarding.md)

## Scripts

| Command                                                               | Description                              |
| --------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm dev`                                                            | Start web + worker dev servers           |
| `pnpm build`                                                          | Build all packages and apps              |
| `pnpm setup`                                                          | Start infra + migrate + seed             |
| `pnpm infra:up` / `infra:down`                                        | Start / stop PostgreSQL + Redis (Docker) |
| `pnpm infra:reset -- --yes`                                           | Reset volumes + migrate + seed           |
| `pnpm db:migrate:dev`                                                 | Create/apply dev migrations              |
| `pnpm db:migrate:deploy`                                              | Apply migrations (production)            |
| `pnpm db:seed`                                                        | Seed base accounts + sample data         |
| `pnpm db:seed-demo-full`                                              | Seed the rich demo org "Toko Falka Demo" |
| `pnpm db:reset-demo`                                                  | Reset the demo orders/sales/stock loop   |
| `pnpm db:studio`                                                      | Open Prisma Studio                       |
| `pnpm lazada:smoke` (+ `:token` / `:products` / `:stock` / `:seller`) | Lazada adapter smoke scripts             |

## Testing

| Command                             | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `pnpm typecheck`                    | TypeScript across the workspace             |
| `pnpm lint`                         | ESLint (`--max-warnings 0`)                 |
| `pnpm test`                         | Unit/integration (Vitest) — `web` + `queue` |
| `pnpm --filter @falka/web test:e2e` | End-to-end (Playwright)                     |

- **The four gates** — `typecheck` · `lint` · `build` · `test` — must be green after
  every change. CI (`.github/workflows/ci.yml`) re-runs them on push/PR to `main`.
- **Unit/integration** tests mock Prisma (Node env, no DB/R2), so a DB- or
  runtime-level regression (e.g. a bad raw query) won't surface here — cover those
  with E2E or a real-DB probe.
- **E2E** (Playwright, `apps/web/e2e`) drives the real app. Prereqs: `pnpm dev`
  running + the demo seed (`pnpm --filter @falka/db db:seed-demo`). First run only:
  `pnpm --filter @falka/web exec playwright install chromium`. Override the login
  via `E2E_EMAIL` / `E2E_PASSWORD`. See [docs/onboarding.md](docs/onboarding.md#testing).

## Deployment

> **Transitional.** Production runs on Vercel + Neon today, but the committed
> direction is a **self-hosted single-host VPS** (Docker Compose: web + worker +
> Postgres + Redis, keeping Cloudflare R2) — which unblocks the worker + Socket.IO
> that don't run on Vercel. See [docs/deployment/vps-migration.md](docs/deployment/vps-migration.md)
> and [vps-setup.md](docs/deployment/vps-setup.md); the Vercel/Neon guides are the
> current stopgap.

| Environment         | Hosting                  | Database             | Storage       |
| ------------------- | ------------------------ | -------------------- | ------------- |
| Local               | `pnpm dev`               | Docker Postgres      | Cloudflare R2 |
| Production (today)  | Vercel                   | Neon PostgreSQL      | Cloudflare R2 |
| Production (target) | Self-hosted VPS (Docker) | Self-hosted Postgres | Cloudflare R2 |

- **On Vercel the custom server + worker do NOT run** → marketplace sync, scheduled
  jobs, and the scanner socket are dormant in prod until the VPS cutover.
- **Production migrations:** `pnpm db:migrate:deploy` (never `db push`).
- **Deploy guide:** [docs/deployment/README.md](docs/deployment/README.md)

## Environment variables

| File                          | Purpose                                |
| ----------------------------- | -------------------------------------- |
| `.env.example`                | Local development template             |
| `.env.production.example`     | Production reference (Vercel)          |
| `.env.production.vps.example` | Production reference (self-hosted VPS) |
| `apps/web/.env.example`       | Public client variables                |

See [docs/environment.md](docs/environment.md).

## Architecture

Business logic lives in `apps/web/src/modules/<feature>` (layered: `components/` ·
`hooks/` · `services/` · `repositories/` where present · `validators/` · `types/` ·
`errors/` · `store/`):

```
modules/
  catalog/      Products, variants, bundles, labels, deletion preflight
  inventory/    StockLedger (source of truth) + Inventory cache, opname, reorder
  marketplace/  Connections, mapping, health/drift, OAuth (Lazada live)
  orders/       Inbound marketplace orders + stock lifecycle + departure board
  sales/        Offline POS sales, refunds, receipts
  purchasing/   Purchase orders, suppliers, receiving
  returns/      Returns/RMA processing
  recordings/   Webcam packing-video lifecycle + dashboard
  reporting/    Profit/margin, channel, valuation, dead-stock/ABC
  notifications/In-app notification tray
  scanner-pairing/ Phone-as-scanner pairing (Socket.IO)
  users/ admin/ Org/RBAC permissions + platform admin-ops
  auth/ audit/ storage/  Sessions, audit log, R2 uploads
```

Background jobs run in `apps/worker` (BullMQ): marketplace stock propagation, token
refresh, drift reconciliation, and cleanup. API routes: `/api/v1/{resource}`.

## Git workflow

Solo-dev: branch off `main` (one branch per session, e.g. `session/<date>-<topic>`),
keep commits per-action, keep the four gates green. CI enforces the gates on PRs to
`main`. (Vercel preview deploys per branch apply only while on the Vercel stopgap.)

## License

Private — all rights reserved.
