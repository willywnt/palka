# Coolify on the VPS — setup runbook & staged plan

> **STATUS: ✅ LIVE & VALIDATED (2026-06-28)** — first real deploy succeeded on a Biznet MS 4.2 box at
> **`https://app.trypalka.com`** (product/POS/R2-upload/recording all working, worker schedulers active).
> **Read §9 "Field notes" for the real-deploy corrections** (some steps below differ from what actually
> worked — esp. the Biznet Security Group, the managed-DB network connection, and setting a service domain).
> Production deploys to a **self-hosted Biznet VPS managed by Coolify**. Decision basis: **Coolify chosen over Dokploy** for a solo-operated,
> money-handling go-live (maturity + community + security track-record outweigh Dokploy's lighter
> footprint; Dokploy's worst CVE wave landed May–Jun 2026 and its restore path has open data-loss
> bugs — revisit only if RAM becomes a measured constraint or go-live slips past Q4 2026).
>
> This runbook covers: the staged box plan, post-purchase hardening, installing + configuring
> Coolify, deploying Palka (web + worker + migrate from a CI-built GHCR image), managed
> Postgres/Redis + R2 backups, log monitoring, the known warts + mitigations, and the
> Cloudflare-in-Indonesia resilience fallback. Cost ladder: [`vps-cost-packages.md`](./vps-cost-packages.md).
> The under-the-hood plain-compose reference is [`vps-setup.md`](./vps-setup.md).

---

## 0. The staged plan (start small, grow at go-live)

| Stage                     | When                              | Box (Biznet NEO Lite)                        | Coolify                     | Envs                           | ~Cost/mo                         |
| ------------------------- | --------------------------------- | -------------------------------------------- | --------------------------- | ------------------------------ | -------------------------------- |
| **1 — NOW (dev/testing)** | pre-go-live, just owner + testers | **MS 4.2** — 2 vCPU / **4 GB** / 60 GB SSD   | **yes, from day one**       | **prod-only (no staging yet)** | **~Rp139rb**                     |
| **2 — Go-live**           | publish, real sellers onboard     | **MM 8.4** — 4 / 8 / 60 SSD (or NVMe Pro)    | yes                         | prod + staging                 | ~Rp269rb (SSD) / ~Rp599rb (NVMe) |
| **3 — Growth**            | load grows, DB heavier            | 16 GB (LL 16.8 SSD / ML.16.8 NVMe)           | yes                         | prod + staging                 | ~Rp459rb–1.1jt                   |
| **4 — Scale**             | one box bottlenecks               | split: DB box (NVMe) + Redis + worker, + CDN | Coolify multi-resource/host | —                              | ~Rp1.5jt+                        |

**Decision: install Coolify from day one (even in dev)** to get familiar with the real workflow
before go-live. Dev/testing load is light, so the control-plane overhead is acceptable.

### ⚠️ The 4 GB reality (read this)

Coolify's official floor is 2 vCPU / 2 GB **for itself**, and it idles at ~0.5–1.2 GB. On a 4 GB
box you are **comfortable for a single dev environment, not for prod+staging**. To make 4 GB work:

- **Run ONE environment only** (prod-style). Add staging at Stage 2 (8 GB).
- **Build the image OFF the box in CI → GHCR** (§3). Never run `next build` on the box — it peaks
  ~2 GB and will OOM next to Coolify + Postgres.
- **Add 2–3 GB swap** (§1.2) as a safety net.
- **Watch RAM** (`free -h`, Coolify Sentinel host metrics). If it’s routinely tight, that’s the
  signal to bump to 8 GB earlier — don’t fight an OOM box.

---

## 1. Post-purchase VPS hardening (BEFORE installing Coolify)

Do all of this **as root, before the Coolify installer** (Docker's iptables rules only exist after
install, so the ufw-docker fix comes last).

### 1.1 Base

```bash
hostnamectl set-hostname palka-prod
timedatectl set-timezone Asia/Jakarta
apt update && apt -y full-upgrade && apt -y autoremove
apt -y install curl ca-certificates ufw fail2ban unattended-upgrades
```

### 1.2 Swap (before any heavy work)

```bash
fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' > /etc/sysctl.d/99-swap.conf && sysctl --system
```

### 1.3 Non-root sudo user + SSH key

```bash
adduser deploy && usermod -aG sudo deploy
# from your laptop: ssh-keygen -t ed25519 -C palka-deploy ; ssh-copy-id deploy@<ip>
```

**Confirm `ssh deploy@<ip>` + `sudo -v` work in a second terminal before touching sshd.**

### 1.4 The Coolify root-login caveat (important)

Coolify manages even its own host **over SSH as root** (`host.docker.internal`). The default install
needs root reachable **by key** → use `PermitRootLogin prohibit-password`, **not** `no`. Copy your key
to root:

```bash
mkdir -p /root/.ssh && cp /home/deploy/.ssh/authorized_keys /root/.ssh/authorized_keys
chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
```

### 1.5 Harden sshd — `/etc/ssh/sshd_config.d/99-hardening.conf`

```
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
MaxAuthTries 3
PermitRootLogin prohibit-password
```

`sshd -t && systemctl restart ssh` — re-test in a new terminal before closing the old one.

### 1.6 Firewall

```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp 80/tcp 443/tcp
ufw allow 8000/tcp 6001/tcp 6002/tcp     # Coolify dashboard / realtime-ws / terminal
ufw enable
```

### 1.7 fail2ban + unattended upgrades

```bash
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local   # [sshd] enabled=true maxretry=3 bantime=1h
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

### 1.8 DNS before install

A records → VPS IP: `palka.app`, `coolify.palka.app` (to TLS-front the dashboard). (Staging
subdomain only at Stage 2.)

---

## 2. Install + first-run hardening of Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash   # installs Docker + Coolify
```

1. Open `http://<ip>:8000` and **create the owner account immediately** (the URL is unauthenticated
   until you do).
2. **Update Coolify on day one** (clears the Jan-2026 CVE batch, fixed in beta.467; a current v4.1.x
   install is already past it — verify).
3. **Settings → Updates → DISABLE automatic updates.** The proxy is Coolify's #1 upgrade-breakage
   surface (a past release silently flipped Caddy→Traefik → HTTPS outage). Upgrade manually, after a
   backup, and verify `docker ps | grep coolify-proxy` afterward.
4. Bind `coolify.palka.app` as the instance domain so the dashboard is TLS-fronted; then restrict the
   raw `8000/6001/6002` ports (allow only your IP, or use Tailscale — Indonesian residential IPs
   rotate, so a hard IP allowlist can lock you out; prefer Tailscale/VPN or Biznet's security group).
5. ⚠️ **DO NOT run `ufw-docker`** — in the first real deploy it **broke external access to every Coolify
   port** (it blocks Docker-published ports including 80/443/8000, which conflicts with how Coolify
   publishes its proxy/dashboard). Firewall at **Biznet's network Security Group** instead (see §9).
   The box's own ufw (default-deny + the §1.6 allows) **plus** Coolify keeping Postgres/Redis internal
   (never host-published) is enough. **Never publish Postgres/Redis host ports.**

**Proxy/TLS:** the managed proxy (Traefik default) auto-issues Let's Encrypt certs per domain. Traefik
passes Socket.IO WebSocket upgrades out of the box for a single replica.

> **Storefront note:** the future multi-tenant storefront needs wildcard + arbitrary custom-domain
> TLS, which Coolify's Traefik does **not** do natively. Plan to run a **dedicated Caddy** in front of
> the storefront app for that (see [`../roadmap/storefront-builder.md`](../roadmap/storefront-builder.md) §3);
> only one process binds :443, so keep them off each other.

---

## 3. Build the image in CI (GHCR) — not on the box

This is the decisive 4 GB rule. `next build` peaks ~2 GB; building on-box next to Coolify + Postgres
OOMs. Instead:

1. **GitHub Actions** builds the monorepo image, pushes `ghcr.io/willywnt/palka:<sha>` + `:prod`.
2. The compose resource references the **GHCR image** for web/worker → Coolify **pulls**, never compiles.
3. After push, trigger Coolify via its resource webhook:
   ```bash
   curl --request GET "$COOLIFY_WEBHOOK" --header "Authorization: Bearer $COOLIFY_TOKEN"
   ```
4. On the box, `docker login ghcr.io -u <user> -p <PAT-read:packages>` once (the coolify user in the
   `docker` group) so Coolify can pull the private image. Use a long-lived PAT or automate re-login.

Connect Git via the **GitHub App** (auto webhooks + private-repo access).

---

## 4. Deploy Palka — the compose-resource shape

Deploy as **ONE Docker Compose resource = `web` + `worker` + `migrate`** (keep Postgres/Redis as
managed resources, §5). This preserves the single Dockerfile, the one-shot migrate, and the least churn.

**Build args for `NEXT_PUBLIC_*` (critical):** every `NEXT_PUBLIC_*` must have **Build Variable
enabled** so `next build` inlines it. Since you build in CI/GHCR, this happens in GitHub Actions —
which also sidesteps the Coolify build-arg regression (#8873). Secrets (`DATABASE_URL`, `AUTH_SECRET`,
`MARKETPLACE_ENCRYPTION_SECRET`, `R2_*`, `SHOPEE_*`, `TOKOPEDIA_*`, `SENTRY_DSN`) stay runtime.

**The migrate step:** keep it in compose; gate web/worker with
`depends_on: { migrate: { condition: service_completed_successfully } }` (Docker enforces ordering).
Set `exclude_from_hc: true` + `restart: "no"` on migrate so its by-design exit doesn't fail the deploy.
_Validate on the first real deploy_ that web/worker actually wait for migrate.

**WebSocket / Socket.IO:** single replica + same-origin → works with no extra labels. Expose **only
web's `:3000`** with FQDN `https://palka.app`. ⚠️ If routing 404s ("no available server"), add the
Traefik port label manually: `traefik.http.services.<svc>.loadbalancer.server.port=3000` (a known
Coolify gap for non-80 apps, #6233).

**The worker:** same image, BullMQ command, **no `ports:` / no domain** → automatically excluded from
the proxy (internal-only). Health on `:3001/health`.

**Self-heal (important):** Coolify does **NOT** auto-restart unhealthy containers (its healthcheck only
gates proxy routing). So:

- Keep `restart: unless-stopped` on web + worker (recovers process crash/exit/OOM).
- Make the **worker exit non-zero on fatal states** so the restart policy fires — an "unhealthy but
  still running" worker won't self-heal otherwise (or add an `autoheal` sidecar).

**Deploys are stop-then-start** (no rolling update for compose) → Socket.IO scanner clients drop +
auto-reconnect. Deploy in quiet hours. Rollback = redeploy a previous GHCR image SHA (don't aggressively
prune old SHAs).

---

## 5. Databases + backups

**Run Postgres 16 + Redis 7 as separate Coolify-managed resources** (NOT services inside the app
compose). Two reasons: (a) reliable native scheduled backup + restore + Sentinel metrics; (b) avoids
Coolify's whole-project env leak into every compose service (#7655, deferred to v5) reaching the
datastores. Default images already match (`postgres:16-alpine` / `redis:7-alpine`). Paste the internal
connection strings into **web AND worker**; leave "Publicly Accessible" OFF.

**Backups to R2:**

1. Pre-create an R2 backup bucket (separate from uploads). Coolify verifies with `ListObjectsV2`, so it
   must exist first.
2. Global **S3 Storages** → add R2: endpoint `https://<accountid>.r2.cloudflarestorage.com`,
   **region `auto`**, access/secret from an R2 token. ⚠️ Do **not** use an R2 EU (`.eu.`) endpoint (#9305).
3. Per-DB **Backups** tab → `0 3 * * *`, tick **Save to S3** → R2, retention (e.g. 14 days).
4. **Verify an object actually lands in R2** — don't trust the "Success" badge (silent-failure reports).

**Back up Coolify itself:** (a) Settings → Backup (its own DB → R2); (b) a host cron `tar czf` of
**`/data/coolify`** (DB + SSH keys + proxy config), **encrypted before upload**.

**Notifications:** Profile → Notifications → Telegram/Discord → subscribe **Deployment Failure, Backup
Failure, Server Disk Usage** (the 60 GB SSD is the squeeze — `docker system prune` periodically),
**Server Unreachable**. This is Palka's first real alerting.

---

## 6. Log monitoring (pino) — tiered

Pino already emits JSON to stdout in prod (`LOG_LEVEL=info`). Ship logs from stdout with a Docker-level
collector — **never bolt `pino-loki` into `server.ts`**.

- **Now (Tier 0):** set Docker log rotation on every service so logs can't fill the disk:
  `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }`. Coolify's built-in
  per-resource log viewer covers "what is it doing right now."
- **Day one (Tier 1) — FIRST PICK: Dozzle + Sentry.** Dozzle (~10 MB) = a live multi-container log web
  UI with search + pattern-alert webhooks (gate it behind auth/SSH tunnel — the socket mount is a host
  control surface; mount read-only; it has zero retention). Sentry (`SENTRY_DSN`, already optional) in
  **web AND worker** = stack-traced, alertable exceptions that survive restarts (scope to
  `['error','fatal']`). This is where worker job failures surface as alerts.
- **Graduate (Tier 2):** Grafana Cloud Free (50 GB/mo, 14-day retention) via one Grafana **Alloy** (or
  Vector) container — NOT Promtail (EOL). Keep labels low-cardinality (env/service/level); query
  requestId/userId via `| json`.
- **Sentinel** = host CPU/RAM/disk metrics only (NOT per-container for compose) — use `docker stats`
  for per-service.

---

## 7. Known Coolify warts + mitigations (cheat-sheet)

| Wart                                                   | Mitigation                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Env vars leak into every compose service (#7655)       | keep Postgres/Redis as managed resources, not compose services (§5)                    |
| No auto-restart of unhealthy containers                | `restart: unless-stopped` + worker exits non-zero on fatal (§4)                        |
| Proxy can flip/break on auto-update (#9127)            | disable auto-update; verify `coolify-proxy` after each manual upgrade; test on staging |
| No rolling update for compose (stop-start)             | deploy in quiet hours; scanner auto-reconnects                                         |
| Traefik port label not auto-emitted for non-80 (#6233) | set domain `https://host:3000` + add the `loadbalancer.server.port=3000` label         |
| `exclude_from_hc` was buggy on some betas (#6591)      | verify migrate's exit doesn't fail the deploy on your version                          |
| Compose health not surfaced in UI (#9524)              | debug via SSH `docker inspect`, not the Coolify UI                                     |
| Sentinel metrics exclude compose                       | host-level metrics only; `docker stats` per-service                                    |

---

## 8. Resilience: Cloudflare-in-Indonesia fallback

Indonesian enforcement (Komdigi anti-judol) has threatened Cloudflare (Nov 2025) but **not actually
blocked it** as of mid-2026 — this is a "have a fallback," not "redesign now." Palka's exposure is low
(the app is a direct Jakarta origin, **not** behind Cloudflare's orange-cloud proxy). The architecture
is already Cloudflare-OPTIONAL — see [`cloudflare-fallback.md`](./cloudflare-fallback.md) for the full
runbook. Cheap insurance to set up now:

- Serve public images via a **custom domain** (`cdn.palka.app`), **not** `r2.dev` URLs.
- **Pre-provision Biznet NEO Object Storage** + test ONE aws-sdk-v3 **SigV4** presigned-PUT (Biznet docs
  show SigV2 — confirm SigV4 works before trusting it as the R2 fallback).
- Don't hardcode `1.1.1.1` as the server/container resolver (TelkomGroup blocks it).

---

## 9. Field notes — first real deploy (2026-06-28, Biznet MS 4.2 → app.trypalka.com)

What actually bit, in order. **These override the idealized steps above where they conflict.**

1. **Biznet gives you a non-root sudo user, not root.** The provisioned box logs you in as a sudo user
   (the username you set, e.g. `willywnt`) — `apt` etc. need `sudo -i`. Root's `authorized_keys` carries
   a forced-command key (`Please login as <user>…`) that **intentionally blocks direct root SSH** — that's
   fine. **Skip the §1.3 `deploy` user + §1.4 key-copy-to-root**; just use the existing sudo user. Coolify
   adds **its own** root key at install (a clean line, no forced command), so it self-manages regardless.

2. **Biznet network Security Group defaults to `Any / Any / DROP` (inbound) — this is the real firewall,
   not ufw.** Symptom: SSH (22) works but 80/443/8000 connections **reset after the TCP handshake** (DPI-style),
   from every ISP. Fix: in the Biznet panel → **Security Group → Inbound Rules**, ADD ACCEPT rules
   (Protocol TCP, Action ACCEPT, **Source `0.0.0.0/0`** — the Source is required, blank = "Not valid CIDR"):
   **22, 80, 443, 8000, 6001, 6002**. The default `Any/DROP` rule is a non-deletable catch-all (kept last).
   ⚠️ **A VPS restart was needed to APPLY the new SG rules** (they didn't take effect live). After that,
   external access worked. **Do NOT run `ufw-docker` (§2.5)** — it compounds the lockout.

3. **Managed Postgres/Redis live on the `coolify` Docker network; the app compose resource does NOT by
   default** → migrate fails `P1001: Can't reach database server at <pg-uuid>:5432`. Fix: on the compose
   resource, tick **"Connect To Predefined Network"** (General config), AND/OR add to the compose:

   ```yaml
   networks:
     coolify:
       external: true
       # …and on every service:
       networks: [default, coolify]
   ```

   Verify with `docker inspect <pg-container> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`
   (should show `coolify`) vs the app's `web-*` container (its own network until connected).

4. **Set a compose service's domain via the per-service `Settings → Domains` field in the UI — NOT the
   compose `SERVICE_FQDN_*` env** (Coolify auto-generates + LOCKS that to a `<svc>-<uuid>.<ip>.sslip.io`
   default; your compose value is ignored). Symptom if unset: `app.trypalka.com` returns **"no available
   server"**. In the resource → Services → **Web → Settings → Domains** → `https://app.trypalka.com` →
   Save → Redeploy. Coolify then routes the domain → web:3000 and issues the LE cert (needs port 80 open
   externally per #2).

5. **The dashboard's own domain (`coolify.trypalka.com`) HTTPS is finicky** (Traefik had no cert/route even
   from a neutral network) — it's cosmetic. Access the dashboard via `http://<ip>:8000` or, securely, an
   **SSH tunnel**: `ssh -L 8000:127.0.0.1:8000 <user>@<ip>` → `http://localhost:8000` (encrypted over SSH).

6. **`NEXT_PUBLIC_APP_URL` is baked at build time** → set the GitHub repo **Variable**
   `NEXT_PUBLIC_APP_URL=https://app.trypalka.com` and **re-run the build-image workflow** before deploying,
   so the client bundle has the right origin (the placeholder `palka.app` is otherwise baked in).

7. **Bootstrap the first platform admin** (fresh DB, invite-only registration):

   ```bash
   WEB=$(sudo docker ps --format '{{.Names}}' | grep '^web-')
   sudo docker exec -e BOOTSTRAP_ADMIN_EMAIL='ops@trypalka.com' -e BOOTSTRAP_ADMIN_PASSWORD='<strong>' \
     "$WEB" pnpm --filter @palka/db db:bootstrap-admin
   ```

   Then sign in at `https://app.trypalka.com/admin` → provision the first shop org + its OWNER.

8. **The validated compose is committed at [`../../docker-compose.coolify.yml`](../../docker-compose.coolify.yml)**
   (web + worker + migrate, GHCR image, `networks: coolify`). Paste it into the Coolify Docker-Compose resource.

> Cosmetic, non-blocking: the base image is `node:20-slim`; the AWS SDK v3 warns it'll need node ≥22 after
> Jan 2027 — bump the Dockerfile base to `node:22-slim` eventually.

---

## Ringkasan (Bahasa Indonesia)

Produksi pakai **VPS Biznet + Coolify** (Coolify dipilih ketimbang Dokploy karena lebih matang & komunitas
besar — penting buat solo dev yang pegang uang seller). **Tahap sekarang (dev/testing): box MS 4.2 (4 GB,
~Rp139rb) + Coolify dari hari pertama, satu environment saja.** Naik ke 8 GB (prod+staging) saat go-live.

Kunci di box 4 GB: **build image di GitHub Actions (CI), jangan di box** (biar nggak OOM), tambah swap,
satu environment dulu. Deploy Palka sebagai **satu Docker Compose resource = web+worker+migrate** dari image
GHCR; **Postgres + Redis dijalankan sebagai resource Coolify terpisah** (backup andal + hindari kebocoran
env). Backup DB terjadwal ke R2 (verifikasi object beneran masuk). Worker harus **exit non-zero saat fatal**
karena Coolify nggak auto-restart container unhealthy. Matikan auto-update Coolify (proxy sering rusak).
Monitoring log: **Dozzle + Sentry** dulu → Grafana Cloud nanti. Fallback Cloudflare (R2→Biznet NEO, DNS→deSEC):
lihat `cloudflare-fallback.md`.

---

_Last updated 2026-06-28. Decision: Coolify (over Dokploy), start on Biznet MS 4.2 (4 GB) from day one,
grow to 8 GB at go-live._
