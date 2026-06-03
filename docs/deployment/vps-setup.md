# Single-host VPS deployment (Option A)

Runs the **whole app on one always-on Node host**: the custom `server.ts` serves
both Next and Socket.IO from one origin, alongside the BullMQ worker, Postgres, and
Redis. Because everything is same-origin, the mobile-scanner realtime flow works with
plain cookie auth — no `NEXT_PUBLIC_SOCKET_URL`, no cross-origin token dance.

Uploaded files stay on **Cloudflare R2** (the host never proxies file bytes).

> ⚠️ The Docker assets here are an **untested scaffold** — expect to tune them at the
> first real deploy (native deps, image size, build-time env). They were authored
> from the repo's scripts, not run.

## What runs

| Service    | Image / source           | Role                                  |
| ---------- | ------------------------ | ------------------------------------- |
| `caddy`    | `caddy:2-alpine`         | Reverse proxy + automatic HTTPS (TLS) |
| `web`      | this repo (`Dockerfile`) | `tsx server.ts` — Next + Socket.IO    |
| `worker`   | same image               | `node dist/index.js` — BullMQ jobs    |
| `migrate`  | same image (one-shot)    | `prisma migrate deploy`, then exits   |
| `postgres` | `postgres:16-alpine`     | Database (volume `pg_data`)           |
| `redis`    | `redis:7-alpine`         | Queues + cache (volume `redis_data`)  |

Files: `Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`, `.env.production.vps.example`.

## Prerequisites

1. A VPS with a Jakarta/Singapore DC for low ID latency (e.g. Biznet Gio, IDCloudHost,
   Vultr Jakarta, Contabo SG). **≥ 2 GB RAM** (4 GB comfortable — `next build` needs
   ~2 GB; on a 1–2 GB box add swap or build elsewhere).
2. A domain with a DNS **A record → the server IP** (Caddy needs it for TLS).
3. Cloudflare R2 bucket + credentials.
4. Ports **80** and **443** open in the firewall.

## 1. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login afterwards
docker compose version            # verify Compose v2
```

## 2. Get the code and configure env

```bash
git clone <your-repo-url> olshop && cd olshop
cp .env.production.vps.example .env.production
# Edit .env.production — fill DOMAIN, AUTH_SECRET (openssl rand -base64 32),
# POSTGRES_PASSWORD, DATABASE_URL, R2_*, and set NEXT_PUBLIC_APP_URL=https://<DOMAIN>.
```

`DATABASE_URL` host is `postgres`, `REDIS_URL` host is `redis` (the compose service names).

## 3. Add swap if the box has < 4 GB (so `next build` doesn't OOM)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Order: `postgres`/`redis` become healthy → `migrate` applies migrations and exits →
`web` + `worker` start → `caddy` fronts `web` and issues TLS for `DOMAIN`.

## 5. Verify

```bash
docker compose -f docker-compose.prod.yml ps          # all healthy/running, migrate Exited(0)
docker compose -f docker-compose.prod.yml logs -f web  # "Server listening on 0.0.0.0:3000"
curl -I https://<DOMAIN>                                # 200/redirect with valid TLS
```

Then open `https://<DOMAIN>` and exercise the two happy flows (manual recording, and —
since same-origin — the mobile scanner: QR → scan → countdown → record).

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` re-runs (idempotent). Set `SKIP_DB_MIGRATE=1` to skip it.

## Backups (do this early)

```bash
# Postgres dump
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
```

Schedule via cron. R2 has its own durability; Postgres + Redis volumes are yours to back up.

## Notes & gotchas

- **`NEXT_PUBLIC_*` is build-time.** It is inlined into the client bundle during
  `next build`, so it is passed as a Docker **build arg** (see `docker-compose.prod.yml`).
  Changing `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_ENABLE_MOBILE_SCANNER` ⇒ rebuild
  (`up -d --build`), not just a restart.
- **Mobile scanner.** On a single host it works out of the box; the env template sets
  `NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=true`. (It is hidden by default only on serverless
  hosts like Vercel where no socket server runs — see `socket-server.md`.)
- **HTTPS for the phone camera.** Caddy serves real TLS, so the mobile camera/QR scan
  works (no self-signed cert warning unlike local `DEV_HTTPS`).
- **Image size / build speed.** The runtime image keeps the full workspace + dev deps
  (the web server runs via `tsx`). Fine for early stage; optimize later (prune, compile
  the web server, or Next standalone for a non-custom-server variant) if it matters.
- **Going global later.** Add a CDN in front, move Postgres/Redis to managed services,
  or split web/worker onto separate hosts — the same image and compose scale up.
