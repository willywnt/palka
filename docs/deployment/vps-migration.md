# Vercel → self-hosted VPS migration

**Decision (2026-06-16): production is moving off Vercel+Neon to a self-hosted VPS.** Vercel was a
stopgap — it can't run the BullMQ **worker** or **Socket.IO**, so marketplace sync, scheduled jobs, the
scanner, and (later) WhatsApp stay dormant there. The VPS unblocks all of it. The step-by-step runbook is
[`vps-setup.md`](./vps-setup.md); the provider/cost comparison + chosen package (HEMAT) is
[`vps-cost-packages.md`](./vps-cost-packages.md).

This migration is a **clean start** — no data is carried over from Neon (no `pg_dump`/restore; Lazada is
re-authorized via OAuth on the new domain, so encryption-secret continuity is moot).

## Architecture: current → target

| Component | Current (stopgap) | Target VPS (Option A, single host)          |
| --------- | ----------------- | ------------------------------------------- |
| App       | Vercel serverless | Docker: `web` (Next + Socket.IO) via Caddy  |
| Worker    | (does not run)    | `apps/worker` BullMQ container — now active |
| Database  | Neon PostgreSQL   | Self-hosted PostgreSQL 16 (container)       |
| Redis     | Upstash / none    | Self-hosted Redis 7 (container)             |
| Storage   | Cloudflare R2     | **Cloudflare R2 (unchanged — keep it)**     |
| TLS/proxy | Vercel            | Caddy (auto Let's Encrypt)                  |

## Why this is low-risk

The app was built vendor-portable: a modular monolith with no Vercel-only runtime APIs, a
`StorageProvider` abstraction (R2 today, swappable), Prisma (any Postgres), standard env vars, and Docker
Compose already used for local infra. Files stay on R2, so there's no object migration.

## What NOT to change

- Prisma schema + the `migrate deploy` workflow (the compose `migrate` service runs it).
- Auth.js JWT config — only `AUTH_URL` changes to the new domain.
- API route structure (`/api/v1/*`) and the Socket.IO event contracts.
- `MARKETPLACE_ENCRYPTION_SECRET` — keep it stable per env (it decrypts marketplace tokens).
- R2 key structure.

## Cutover (clean start)

1. Stand up the VPS per [`vps-setup.md`](./vps-setup.md): shared Caddy → prod app stack → bootstrap admin.
2. Point DNS (`palka.app` A record) at the VPS; Caddy issues TLS.
3. Re-register the **Lazada OAuth callback** at `https://<domain>/api/v1/marketplaces/lazada/oauth/callback`
   and re-authorize the shop.
4. Decommission the Vercel project + Neon DB once the VPS is verified. (If you ever migrate _with_ data
   instead: `pg_dump` Neon → restore into the VPS Postgres, and keep `MARKETPLACE_ENCRYPTION_SECRET` identical.)

## Rollback

Keep the Vercel project alive during cutover. With low DNS TTL: verify the VPS via a hosts-file override
first, switch the DNS record, and keep Vercel as a fallback for ~48 h before tearing it down.

## Monitoring on the VPS

- Pino logs → stdout → `docker compose logs` (or ship to Loki later).
- Uptime monitoring (Uptime Kuma / Better Stack) hitting `https://<domain>/api/health`.
- Sentry (optional) via `SENTRY_DSN`.

## Scaling path

Single box now (HEMAT). When load grows: upgrade the box (Biznet NEO Lite Pro / 16 GB), then split
Postgres and/or the worker onto their own hosts (just change `DATABASE_URL` / `REDIS_URL`), and add a CDN
in front. The same image + compose scale up without code changes. A managed PaaS layer (Coolify) is the
SEIMBANG upgrade — it adds git-push deploys, per-env management, and a backup UI on the same VPS.
