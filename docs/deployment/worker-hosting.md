# Worker deployment guide

Olshop background jobs run in a **persistent Node.js worker process** (`apps/worker`). They must **not** run inside Vercel serverless functions.

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

## Environment variables

Required for the worker (same as web, plus Redis):

```env

DATABASE_URL=

REDIS_URL=

R2_ACCOUNT_ID=

R2_ACCESS_KEY_ID=

R2_SECRET_ACCESS_KEY=

R2_BUCKET_NAME=

MARKETPLACE_ENCRYPTION_SECRET=

WORKER_HEALTH_PORT=3001

WORKER_ENABLE_SCHEDULERS=true

```

`AUTH_SECRET` is still required by `@olshop/config/env.server` validation today.

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

2. **Build command:** `pnpm install --prod=false && pnpm --filter @olshop/worker build`

3. **Start command:** `pnpm --filter @olshop/worker start`

4. Attach Redis plugin or set `REDIS_URL` to Upstash/Redis Cloud.

5. Set all env vars from Vercel + `REDIS_URL`.

6. Configure HTTP health check on `/health` port `3001`.

### Render

1. **Background Worker** service (not Web Service).

2. Root directory: repository root.

3. Build: same as Railway.

4. Start: `pnpm --filter @olshop/worker start`

5. Add managed Redis or external `REDIS_URL`.

### VPS (systemd)

```ini

[Unit]

Description=Olshop Worker

After=network.target



[Service]

Type=simple

User=olshop

WorkingDirectory=/opt/olshop

EnvironmentFile=/opt/olshop/.env

ExecStart=/usr/bin/pnpm --filter @olshop/worker start

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

## Future-ready queues (not implemented)

The `@olshop/queue` package reserves architecture for:

- Marketplace token refresh

- Stock synchronization

- AI processing / thumbnails / OCR

See `FUTURE_QUEUE_CAPABILITIES` in `packages/queue/src/types/index.ts`.
