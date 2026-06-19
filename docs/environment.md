# Environment Variables

Falka separates **public** (client) and **server-only** environment variables with Zod validation in `@falka/config`.

## File layout

| File                      | Scope                       | Committed |
| ------------------------- | --------------------------- | --------- |
| `.env.example`            | Local dev template (root)   | Yes       |
| `.env.production.example` | Production reference        | Yes       |
| `.env`                    | Local server secrets (root) | No        |
| `apps/web/.env.example`   | Client template             | Yes       |
| `apps/web/.env.local`     | Next.js local overrides     | No        |

## Local development

1. Copy `.env.example` → `.env` at monorepo root
2. Copy `apps/web/.env.example` → `apps/web/.env.local`
3. **Sync server variables** into `apps/web/.env.local` — Next.js loads env from the app directory and root `.env` files, but `.env.local` overrides. Keep both in sync to avoid surprises.

## Variable reference

### Server-only (never expose to browser)

| Variable                        | Required | Description                                                            |
| ------------------------------- | -------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                  | Yes      | PostgreSQL connection string (pooled)                                  |
| `DIRECT_URL`                    | Migrate  | Direct (non-pooled) URL for `prisma migrate`; locally = `DATABASE_URL` |
| `AUTH_SECRET`                   | Yes      | Auth.js signing secret (min 32 chars)                                  |
| `AUTH_URL`                      | Prod     | Canonical app URL for Auth.js                                          |
| `NEXTAUTH_URL`                  | Prod     | Same as `AUTH_URL` for NextAuth compat                                 |
| `AUTH_COOKIE_DOMAIN`            | No       | Cookie domain override (e.g. shared subdomain on the VPS)              |
| `R2_ACCOUNT_ID`                 | Yes      | Cloudflare account ID                                                  |
| `R2_ACCESS_KEY_ID`              | Yes      | R2 API token access key                                                |
| `R2_SECRET_ACCESS_KEY`          | Yes      | R2 API token secret                                                    |
| `R2_RECORDINGS_BUCKET_NAME`     | Yes      | R2 bucket for recordings (private)                                     |
| `R2_PUBLIC_URL`                 | No       | Recordings bucket public base (own r2.dev/custom domain)               |
| `R2_PRODUCTS_BUCKET_NAME`       | No       | R2 bucket for product/variant images (public)                          |
| `R2_PRODUCTS_PUBLIC_URL`        | No       | Products bucket public base (own r2.dev/custom domain)                 |
| `REDIS_URL`                     | Prod     | Redis URL for BullMQ, rate limits, metrics                             |
| `MARKETPLACE_ENCRYPTION_SECRET` | Yes      | AES-256-GCM key for marketplace tokens (min 32 chars)                  |
| `SENTRY_DSN`                    | Prod     | Server/worker Sentry DSN                                               |
| `SENTRY_ENVIRONMENT`            | No       | Sentry environment tag (server)                                        |
| `SENTRY_TRACES_SAMPLE_RATE`     | No       | Sentry traces sample rate 0–1 (server)                                 |
| `WORKER_HEALTH_PORT`            | No       | Port the worker's health server listens on (default 3001)              |
| `WORKER_HEALTH_URL`             | No       | Worker health URL for the web healthcheck                              |
| `WORKER_ENABLE_SCHEDULERS`      | No       | `true`/`false` — register repeatable jobs (default true)               |
| `WORKER_SHUTDOWN_TIMEOUT_MS`    | No       | Graceful-shutdown drain timeout (default 30000)                        |
| `LOG_LEVEL`                     | No       | `debug` \| `info` \| `warn` \| `error`                                 |
| `LOG_PRETTY`                    | No       | Pretty logs in dev (`true` / `false`)                                  |
| `APP_VERSION`                   | No       | Version shown in health responses                                      |
| `NODE_ENV`                      | Auto     | Set by runtime (`development`/`test`/`production`)                     |

Marketplace adapter creds (all optional — unset ⇒ the Dev/stub fallback) are listed
under [Marketplace OAuth](#marketplace-oauth) below.

### Public (embedded in client bundle)

| Variable                                | Required | Description                                               |
| --------------------------------------- | -------- | --------------------------------------------------------- |
| Variable                                | Required | Description                                               |
| -----------------------------------     | -------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                   | Yes      | Public app URL (desktop in dev: `http://localhost:3000`)  |
| `NEXT_PUBLIC_APP_NAME`                  | No       | Display name (defaults to `Falka`)                        |
| `NEXT_PUBLIC_SENTRY_DSN`                | Prod     | Client Sentry DSN                                         |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`        | No       | Client Sentry environment tag                             |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No       | Client Sentry traces sample rate 0–1                      |
| `NEXT_PUBLIC_SOCKET_URL`                | No       | Socket.IO origin when hosted separately (multi-host only) |
| `NEXT_PUBLIC_PAIRING_URL`               | Dev      | Mobile scanner / QR URL only (`http://192.168.x.x:3000`)  |
| `NEXT_PUBLIC_ENABLE_MOBILE_SCANNER`     | No       | Feature flag for the mobile scanner reader                |
| `PAIRING_LAN_HOST`                      | Dev      | PC LAN IPv4 if `NEXT_PUBLIC_PAIRING_URL` omitted          |
| `DEV_HTTPS`                             | Dev      | `false` for http; default enables https for mobile camera |

> Only `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_APP_NAME` are Zod-validated by
> `getClientEnv()`. The other `NEXT_PUBLIC_*` / pairing vars are read ad-hoc at the
> point of use (not centrally validated), so a typo silently no-ops the feature.

### Marketplace OAuth

Adapter creds are **env-gated**: when a provider's keys are unset the adapter falls
back to the Dev/stub. **Lazada is live** (OAuth-validated); **Shopee + Tokopedia are
scaffolded** (Tokopedia runs on the **TikTok Shop Open API**).

| Provider  | Variables                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Lazada    | `LAZADA_APP_KEY`, `LAZADA_APP_SECRET`, `LAZADA_API_BASE_URL`, `LAZADA_OAUTH_REDIRECT_URI`                                     |
| Shopee    | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_API_BASE_URL`, `SHOPEE_OAUTH_REDIRECT_URI`                                 |
| Tokopedia | `TOKOPEDIA_APP_KEY`, `TOKOPEDIA_APP_SECRET`, `TOKOPEDIA_SERVICE_ID`, `TOKOPEDIA_API_BASE_URL`, `TOKOPEDIA_OAUTH_REDIRECT_URI` |

`TOKOPEDIA_CLIENT_ID` / `TOKOPEDIA_CLIENT_SECRET` are **legacy/unused** (the standalone
Tokopedia API is terminated) — kept only to avoid churn; do not set them.

## Validation

Server env is validated at runtime via `getServerEnv()` in `@falka/config/env.server`.

Client env is validated via `getClientEnv()` in `@falka/config/env.client`.

## Generating secrets

```bash
# Auth.js + marketplace encryption
openssl rand -base64 32
```

## Environment matrix

> **Transitional.** The Preview/Production rows below describe the current Vercel +
> Neon stopgap. The committed target is a self-hosted VPS (self-hosted Postgres +
> Redis in Docker, keeping R2) — see [deployment/vps-migration.md](./deployment/vps-migration.md)
> and the `.env.production.vps.example` reference.

| Environment         | Database             | Redis              | Storage        | Hosting           |
| ------------------- | -------------------- | ------------------ | -------------- | ----------------- |
| Local               | Docker Postgres      | Docker Redis       | Cloudflare R2  | `pnpm dev`        |
| Preview (today)     | Neon (branch)        | Upstash (optional) | R2 dev bucket  | Vercel preview    |
| Production (today)  | Neon (main)          | Upstash (optional) | R2 prod bucket | Vercel production |
| Production (target) | Self-hosted Postgres | Self-hosted Redis  | Cloudflare R2  | VPS (Docker)      |

Use **separate Neon databases** for development and production. Never point preview/production at your local Docker Postgres.

## Vercel configuration

Set all server variables in **Project Settings → Environment Variables**:

- **Production**: `main` branch deploys
- **Preview**: `develop` and `feature/*` branches
- **Development**: optional, for `vercel dev`

Mark secrets as **Sensitive**. Do not commit `.env` files.
