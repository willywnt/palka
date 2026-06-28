# Vercel → self-hosted VPS migration

> **✅ Migration COMPLETE (2026-06-28) — production is live on the VPS+Coolify at
> https://app.trypalka.com. This is the historical record of how we got there.**

**Decision (2026-06-16): production moved off Vercel+Neon to a self-hosted VPS.** Vercel was a
stopgap — it couldn't run the BullMQ **worker** or **Socket.IO**, so marketplace sync, scheduled jobs, the
scanner, and (later) WhatsApp stayed dormant there. The always-on VPS now runs all of it.

> **UPDATE (2026-06-28): the chosen control plane is Coolify, staged from a 4 GB dev box.** The
> step-by-step runbook is now [`coolify-setup.md`](./coolify-setup.md) (start on Biznet MS 4.2 + Coolify,
> grow to 8 GB at go-live). Cost ladder: [`vps-cost-packages.md`](./vps-cost-packages.md). Object-storage +
> DNS resilience fallback: [`cloudflare-fallback.md`](./cloudflare-fallback.md).

This migration was a **clean start** — no data was carried over from the old DB (no `pg_dump`/restore; Lazada was
re-authorized via OAuth on the new domain, so encryption-secret continuity was moot).

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

1. Stand up the VPS per [`coolify-setup.md`](./coolify-setup.md): shared Caddy → prod app stack → bootstrap admin.
2. Point DNS (`palka.app` A record) at the VPS; Caddy issues TLS.
3. Re-register the **Lazada OAuth callback** at `https://<domain>/api/v1/marketplaces/lazada/oauth/callback`
   and re-authorize the shop.
4. Decommission the Vercel project + Neon DB once the VPS is verified. (If you ever migrate _with_ data
   instead: `pg_dump` Neon → restore into the VPS Postgres, and keep `MARKETPLACE_ENCRYPTION_SECRET` identical.)

## Rollback

Keep the Vercel project alive during cutover. With low DNS TTL: verify the VPS via a hosts-file override
first, switch the DNS record, and keep Vercel as a fallback for ~48 h before tearing it down.

## Monitoring on the VPS

- Pino logs → stdout → Coolify's built-in log viewer; **Dozzle + Sentry** as the day-one tier, Grafana
  Cloud later (see [`coolify-setup.md`](./coolify-setup.md) §6).
- Uptime monitoring (Uptime Kuma / Better Stack) hitting `https://<domain>/api/health`; Coolify
  notifications (Telegram/Discord) for deploy/backup/disk/reachability.
- Sentry (optional) via `SENTRY_DSN`, in both web and worker.

## Scaling path

Start small (Biznet MS 4.2, 4 GB, Coolify, one env — dev/testing), grow to 8 GB (prod + staging) at
go-live, then 16 GB at growth. When one box bottlenecks: split Postgres and/or the worker onto their own
hosts (just change `DATABASE_URL` / `REDIS_URL`), add a CDN, and scale web horizontally (needs the
Socket.IO Redis adapter + sticky sessions). The same image scales up without code changes. Full ladder +
setup: [`coolify-setup.md`](./coolify-setup.md).
