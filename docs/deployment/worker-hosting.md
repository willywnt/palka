# Worker deployment guide

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

Falka background jobs run in a **persistent Node.js worker process** (`apps/worker`). They must **not** run inside Vercel serverless functions.

## Architecture

| Component | Location | Role |

|-----------|----------|------|

| Web app | Vercel | API + UI |

| Redis | External provider | BullMQ queue backend |

| Worker | Persistent host | Job processors + schedulers |

| Postgres | External / Compose | Prisma data |

| R2 | Cloudflare | Object storage cleanup |

## Queues

| Queue | Schedule | Purpose |

|-------|----------|---------|

| `recording-cleanup` | Daily 02:00 UTC | Retention cleanup + R2 delete |

| `storage-recalculation` | Daily 03:00 UTC | Repair `storageUsedBytes` |

| `upload-recovery` | Every 6 hours | Stale sessions + failed upload cleanup |

| `audit-cleanup` | Daily 04:00 UTC | Audit log retention |

| `marketplace-reconcile` | Daily 05:00 + 06:00 UTC | Token refresh (`refresh-marketplace-tokens`, 05:00) + drift reconciliation (`reconcile-marketplace-drift`, 06:00) |

| `marketplace-propagate` | Event-driven | Fan-out a variant's stock change to its mappings (`propagate-inventory-stock`) |

| `marketplace-stock-sync` | Event-driven | Push one mapping's stock to the provider adapter (`sync-marketplace-stock`) |

## Environment variables

Required for the worker (same as web, plus Redis):

```env

DATABASE_URL=

REDIS_URL=

R2_ACCOUNT_ID=

R2_ACCESS_KEY_ID=

R2_SECRET_ACCESS_KEY=

R2_RECORDINGS_BUCKET_NAME=

MARKETPLACE_ENCRYPTION_SECRET=

WORKER_HEALTH_PORT=3001

WORKER_ENABLE_SCHEDULERS=true

```

`AUTH_SECRET` is still required by `@falka/config/env.server` validation today.

## Local development

```bash

pnpm infra:up          # Postgres + Redis

pnpm db:migrate:deploy

pnpm dev:worker        # BullMQ worker + /health on :3001

pnpm dev:web           # Next.js app

```

Health check:

```bash

curl http://localhost:3001/health

```

## Deployment options

### Railway

1. Create a **Worker** service from the monorepo root.

2. **Build command:** `pnpm install --prod=false && pnpm --filter @falka/worker build`

3. **Start command:** `pnpm --filter @falka/worker start`

4. Attach Redis plugin or set `REDIS_URL` to Upstash/Redis Cloud.

5. Set all env vars from Vercel + `REDIS_URL`.

6. Configure HTTP health check on `/health` port `3001`.

### Render

1. **Background Worker** service (not Web Service).

2. Root directory: repository root.

3. Build: same as Railway.

4. Start: `pnpm --filter @falka/worker start`

5. Add managed Redis or external `REDIS_URL`.

### VPS (systemd)

```ini

[Unit]

Description=Falka Worker

After=network.target



[Service]

Type=simple

User=falka

WorkingDirectory=/opt/falka

EnvironmentFile=/opt/falka/.env

ExecStart=/usr/bin/pnpm --filter @falka/worker start

Restart=always

RestartSec=5



[Install]

WantedBy=multi-user.target

```

### Coolify

1. Deploy as **Dockerfile** or **Nixpacks** worker app.

2. Disable serverless / scale-to-zero.

3. Map health check to `/health`.

4. Link Redis resource and share `.env` with web where appropriate.

## Operational notes

- **Concurrency:** destructive queues run with concurrency `1` to avoid double deletion.

- **Retries:** jobs use exponential backoff (5 attempts by default).

- **Dead letters:** permanently failed jobs are logged as `job.dead_letter` via Pino.

- **Graceful shutdown:** worker handles `SIGTERM` / `SIGINT`, closes BullMQ workers, Redis, and Prisma.

- **Schedulers:** set `WORKER_ENABLE_SCHEDULERS=false` on secondary worker replicas if you run multiple instances (only one scheduler owner recommended).

## Marketplace queues (live)

Marketplace sync runs on the worker today (`packages/queue/src/marketplace-sync/*`):

- **Token refresh** — `refresh-marketplace-tokens` job on the `marketplace-reconcile` queue (daily 05:00 UTC, plus lazy refresh-before-use in the sync engine).

- **Drift reconciliation** — `reconcile-marketplace-drift` job on the `marketplace-reconcile` queue (daily 06:00 UTC, read-only: surfaces drift, never writes back).

- **Stock synchronization** — a source-of-truth stock change enqueues `propagate-inventory-stock` (queue `marketplace-propagate`) → fans out to `sync-marketplace-stock` (queue `marketplace-stock-sync`) → provider adapter.

These run only on a persistent worker; on Vercel they are dormant until the VPS cutover (see the banner above).

## Future-ready queues (not implemented)

The `@falka/queue` package reserves architecture for:

- AI processing / thumbnails / OCR

See `FUTURE_QUEUE_CAPABILITIES` in `packages/queue/src/types/index.ts`.
