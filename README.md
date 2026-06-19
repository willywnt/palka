# Falka Monorepo

Production-ready Turborepo for a browser-based operational recording and marketplace integration SaaS platform.

## Stack

| Layer                | Technology                           |
| -------------------- | ------------------------------------ |
| Monorepo             | Turborepo + pnpm workspaces          |
| App                  | Next.js 15 (App Router) + TypeScript |
| Styling              | Tailwind CSS v4 + shadcn/ui          |
| Database             | Prisma + PostgreSQL                  |
| Cache/Queue (future) | Redis                                |
| Storage              | Cloudflare R2                        |
| Auth                 | Auth.js v5                           |
| Logging              | Pino (structured JSON)               |
| Deployment           | Vercel + Neon + R2                   |

## Structure

```
apps/
  web/                  # Next.js fullstack application
packages/
  db/                   # Prisma schema + client + migrations
  config/               # Zod env validation, constants, limits
  utils/                # Pure utilities + Pino logger
  types/                # Domain TypeScript types
  ui/                   # Shared React components
docs/
  onboarding.md         # Local setup guide
  environment.md        # Env variable reference
  deployment/           # Production deployment guides
docker-compose.yml      # Local PostgreSQL + Redis
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

| Command                     | Description                       |
| --------------------------- | --------------------------------- |
| `pnpm dev`                  | Start development servers         |
| `pnpm build`                | Build all packages and apps       |
| `pnpm setup`                | Start infra + migrate + seed      |
| `pnpm infra:up`             | Start PostgreSQL + Redis (Docker) |
| `pnpm infra:down`           | Stop infrastructure containers    |
| `pnpm infra:reset -- --yes` | Reset volumes + migrate + seed    |
| `pnpm db:migrate:dev`       | Create/apply dev migrations       |
| `pnpm db:migrate:deploy`    | Apply migrations (production)     |
| `pnpm db:seed`              | Seed sample data                  |
| `pnpm db:studio`            | Open Prisma Studio                |

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
  running + the demo seed (`pnpm db:seed-demo`). First run only:
  `pnpm --filter @falka/web exec playwright install chromium`. Override the login
  via `E2E_EMAIL` / `E2E_PASSWORD`. See [docs/onboarding.md](docs/onboarding.md#testing).

## Deployment

| Environment | Hosting       | Database             | Storage       |
| ----------- | ------------- | -------------------- | ------------- |
| Local       | `pnpm dev`    | Docker Postgres      | Cloudflare R2 |
| Production  | Vercel        | Neon PostgreSQL      | Cloudflare R2 |
| Future      | VPS / Coolify | Self-hosted Postgres | MinIO         |

- **Vercel root directory:** `apps/web`
- **Production migrations:** `pnpm db:migrate:deploy` (never `db push`)
- **Deploy guide:** [docs/deployment/README.md](docs/deployment/README.md)

## Environment variables

| File                      | Purpose                         |
| ------------------------- | ------------------------------- |
| `.env.example`            | Local development template      |
| `.env.production.example` | Production reference for Vercel |
| `apps/web/.env.example`   | Public client variables         |

See [docs/environment.md](docs/environment.md).

## Architecture

Business logic lives in `apps/web/src/modules/`:

```
modules/
  auth/         Authentication + sessions
  recordings/   Webcam recording lifecycle + dashboard
  marketplace/  Encrypted marketplace connections
  storage/      Cloudflare R2 presigned uploads
  audit/        Audit logging
```

API routes: `/api/v1/{resource}`

## Git workflow

| Branch      | Vercel     | Database        |
| ----------- | ---------- | --------------- |
| `main`      | Production | Neon production |
| `develop`   | Preview    | Neon dev        |
| `feature/*` | Preview    | Neon dev        |

## License

Private — all rights reserved.
