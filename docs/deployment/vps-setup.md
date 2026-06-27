# Single-host VPS deployment (Option A) — runbook

> **Note (2026-06-28): the chosen path is Coolify, not raw `docker compose`.** See
> [`coolify-setup.md`](./coolify-setup.md). This document remains the **plain-compose reference** — the
> same image/Dockerfile/compose services Coolify orchestrates under the hood, useful for understanding
> the stack or as a no-PaaS fallback.

The whole app runs on **one always-on host**: the custom `server.ts` serves Next **and**
Socket.IO from one origin, alongside the **BullMQ worker**, **Postgres**, and **Redis**.
Same-origin ⇒ the mobile-scanner realtime flow works with plain cookie auth (no
`NEXT_PUBLIC_SOCKET_URL`, no cross-origin token dance). Uploaded files stay on **Cloudflare R2**.

This is the **HEMAT** package from [`vps-cost-packages.md`](./vps-cost-packages.md): a Biznet Gio
NEO Lite (8 GB) box, **2 environments (prod + staging)** as separate compose projects behind one
shared Caddy. Clean start — no data migrated from the old Vercel/Neon stack.

> Scaffold status: the Docker assets are correct-by-design but **not yet run on a real box** — expect
> to tune native deps / image size / build memory at the first deploy.

## Architecture

```
                      Internet
                         │  :80 / :443  (DNS A record → VPS IP)
                ┌────────▼─────────┐
                │  caddy (proxy)   │  docker-compose.proxy.yml  · auto-TLS · network: edge
                └───┬──────────┬───┘
       edge alias   │          │   edge alias
   palka-prod-web   │          │   palka-staging-web
   ┌────────────────▼──┐   ┌───▼──────────────────┐
   │ PROD app stack    │   │ STAGING app stack     │   docker-compose.prod.yml  (run per env)
   │ web · worker      │   │ web · worker          │
   │ postgres · redis  │   │ postgres · redis      │   ← each env: own DB + Redis + volumes
   │ migrate · backup  │   │ migrate · backup      │
   └───────────────────┘   └───────────────────────┘
```

| Service    | Image / source           | Role                                            |
| ---------- | ------------------------ | ----------------------------------------------- |
| `caddy`    | `caddy:2-alpine`         | Shared reverse proxy + auto HTTPS for ALL envs  |
| `web`      | this repo (`Dockerfile`) | `tsx server.ts` — Next + Socket.IO              |
| `worker`   | same image               | BullMQ jobs (marketplace sync, daily schedules) |
| `migrate`  | same image (one-shot)    | `prisma migrate deploy`, then exits             |
| `postgres` | `postgres:16-alpine`     | Database (volume `pg_data`)                     |
| `redis`    | `redis:7-alpine`         | Queues + cache (volume `redis_data`)            |
| `backup`   | `postgres:16-alpine`     | Scheduled `pg_dump` → `pg_backups` volume       |

Files: `Dockerfile`, `docker-compose.prod.yml` (app stack, per env), `docker-compose.proxy.yml`
(shared Caddy), `Caddyfile`, `.env.production.vps.example`, `.env.proxy.example`, `scripts/backup-db.sh`.

## Prerequisites

1. A VPS in a **Jakarta** DC for lowest ID latency — HEMAT pick: **Biznet Gio NEO Lite MM 8.4**
   (4 vCPU / 8 GB / 60 GB SSD). **8 GB** comfortably runs prod + staging + on-host builds.
2. A domain with a DNS **A record → the server IP** per environment (e.g. `palka.app`,
   `staging.palka.app`). Caddy needs it for TLS.
3. A Cloudflare R2 bucket + credentials (files) — and a separate R2 bucket/prefix for DB backups.
4. Firewall: ports **80** and **443** open.

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login afterwards
docker compose version            # verify Compose v2
```

## 2. Add swap (on-host `next build` peaks ~2 GB; two stacks share 8 GB)

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Create the shared network + start the proxy (once)

```bash
docker network create edge

git clone <your-repo-url> ~/apps/palka-proxy && cd ~/apps/palka-proxy
cp .env.proxy.example .env.proxy        # set PROD_DOMAIN=palka.app  (STAGING_DOMAIN later)
docker compose -f docker-compose.proxy.yml --env-file .env.proxy up -d
```

Caddy is now listening on 80/443 and will issue TLS for `PROD_DOMAIN` once an app stack is up
behind it.

## 4. Deploy PROD

```bash
git clone <your-repo-url> ~/apps/palka-prod && cd ~/apps/palka-prod
cp .env.production.vps.example .env.production
# Fill .env.production — see the checklist below. Key per-env values for PROD:
#   APP_IMAGE=falka-app:prod   WEB_ALIAS=palka-prod-web
#   NEXT_PUBLIC_APP_URL=https://palka.app   AUTH_URL=https://palka.app
docker compose -p palka-prod --env-file .env.production up -d --build
```

Order: `postgres`/`redis` healthy → `migrate` applies ALL migrations (incl. the notifications
tables) and exits → `web` + `worker` start + join `edge` as `palka-prod-web` → Caddy fronts it.

### .env.production checklist (per environment)

- `APP_IMAGE` + `WEB_ALIAS` — distinct per env (`falka-app:prod`/`palka-prod-web` vs `:staging`/`palka-staging-web`).
- `NEXT_PUBLIC_APP_URL`, `AUTH_URL` — this env's `https://<domain>`.
- `AUTH_SECRET` — `openssl rand -base64 32`.
- `MARKETPLACE_ENCRYPTION_SECRET` — `openssl rand -base64 32`, **kept stable forever** (it decrypts
  marketplace tokens; rotating it orphans them). Use a DIFFERENT secret per env is fine on a clean start.
- `POSTGRES_PASSWORD` + matching `DATABASE_URL`/`DIRECT_URL` (host `postgres`, the service name).
- `REDIS_URL=redis://redis:6379`.
- `WORKER_ENABLE_SCHEDULERS=true` (the VPS runs the worker — daily reconcile + token refresh).
- `R2_*` (files). `BACKUP_INTERVAL_SECONDS` / `BACKUP_KEEP` (defaults 86400 / 7).
- `NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=true`.
- Lazada (when connecting): `LAZADA_APP_KEY/SECRET/API_BASE_URL` + `LAZADA_OAUTH_REDIRECT_URI=https://<domain>/api/v1/marketplaces/lazada/oauth/callback`.

## 5. Bootstrap the first platform admin (fresh DB only)

A freshly-migrated DB is empty. Registration is invite-only and shops are provisioned from `/admin`,
which needs a platform admin. Mint it once (idempotent; creates only the admin + its own org, no demo
data); pass the password inline so it never lands in `.env.production`:

```bash
docker compose -p palka-prod --env-file .env.production run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL=ops@yourco.com \
  -e BOOTSTRAP_ADMIN_PASSWORD='<a strong 12+ char password>' \
  migrate pnpm --filter @falka/db db:bootstrap-admin
```

Then sign in at `https://palka.app/admin`, provision the first shop org + its OWNER from the admin-ops
console; the OWNER logs in and invites the team.

## 6. Connect Lazada (clean start ⇒ re-authorize)

1. In the Lazada console, set the app's OAuth callback to
   `https://palka.app/api/v1/marketplaces/lazada/oauth/callback` and whitelist the seller short code.
2. Put `LAZADA_*` in `.env.production`, redeploy (`up -d --build`), then in the shop go to
   **Marketplace → Hubungkan dengan Lazada (OAuth)** and authorize. Set the **sync warehouse** in the
   connection detail.

## 7. Verify

```bash
docker compose -p palka-prod ps               # all healthy, migrate Exited(0)
docker compose -p palka-prod logs -f web      # "Server listening on 0.0.0.0:3000"
curl -I https://palka.app                      # 200/redirect with valid TLS
```

Open `https://palka.app` and exercise the two happy flows (manual recording; and — same-origin — the
mobile scanner: QR → scan → countdown → record).

## 8. Backups (do this on day one)

The `backup` service writes a daily gzip `pg_dump` to the `pg_backups` volume with retention. That's
on the same disk — for **offsite** durability, sync the volume to R2 from the host with cron + rclone:

```bash
# one-time: install + configure rclone with an R2 (S3-compatible) remote named "r2"
curl https://rclone.org/install.sh | sudo bash
rclone config   # type=s3, provider=Cloudflare, endpoint=https://<accountid>.r2.cloudflarestorage.com

# crontab -e — every day at 02:30, mirror prod backups to R2:
30 2 * * * docker run --rm -v palka-prod_pg_backups:/b:ro -v ~/.config/rclone:/c rclone/rclone \
  --config /c/rclone.conf sync /b r2:<your-backup-bucket>/palka-prod
```

Restore: `gunzip -c db-YYYYMMDD.sql.gz | docker compose -p palka-prod exec -T postgres psql -U falka -d falka`.

## 9. Add the STAGING environment (optional, same box)

```bash
# DNS: A record staging.palka.app → VPS IP. Set STAGING_DOMAIN in ~/apps/palka-proxy/.env.proxy,
# uncomment the staging block in Caddyfile, then reload Caddy:
cd ~/apps/palka-proxy
docker compose -f docker-compose.proxy.yml --env-file .env.proxy up -d   # picks up STAGING_DOMAIN
docker compose -f docker-compose.proxy.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# staging app stack (its own checkout + .env.production with the staging values):
git clone <your-repo-url> ~/apps/palka-staging && cd ~/apps/palka-staging
git checkout staging                              # or whatever your staging branch is
cp .env.production.vps.example .env.production     # APP_IMAGE=falka-app:staging,
                                                  # WEB_ALIAS=palka-staging-web, staging domain/URLs
docker compose -p palka-staging --env-file .env.production up -d --build
```

Staging gets its own DB/Redis/volumes — fully isolated from prod (just sharing CPU/RAM on the box).

## Updating

```bash
cd ~/apps/palka-prod && git pull
docker compose -p palka-prod --env-file .env.production up -d --build   # migrate re-runs (idempotent)
```

## Notes & gotchas

- **`NEXT_PUBLIC_*` is build-time** → per-env URL means a per-env image (`APP_IMAGE`). Changing it ⇒
  rebuild (`up -d --build`), not just restart.
- **HTTPS for the phone camera** — Caddy serves real TLS, so the mobile camera/QR works.
- **Resource pressure** — two full stacks on 8 GB is workable with swap; if builds get tight, build the
  image on a beefier machine / CI and `docker pull` it, or upgrade the box (NEO Lite Pro / 16 GB).
- **Scaling later** — split Postgres/worker onto their own box, or add a CDN; the same image + compose
  scale up. See [`vps-migration.md`](./vps-migration.md).
- **Brand** — keep the `Falka` / `@falka/*` / `falka-app` names for now; the rename to "Palka" is
  pending legal (the domain may go live ahead of the code rename).
