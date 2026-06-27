# VPS cost packages (self-host migration)

> **UPDATE (2026-06-28) — staged plan + Coolify chosen.** The deploy is staged: **start NOW (dev/testing,
> pre-go-live) on Biznet NEO Lite MS 4.2 (2 vCPU / 4 GB / 60 GB SSD, ~Rp139rb/mo) with Coolify from day
> one, a single environment**; grow to the 8 GB box (prod + staging) at go-live; 16 GB at growth; split
> tiers at scale. The control plane is **Coolify** (chosen over Dokploy — maturity/security/community for
> a solo, money-handling go-live). Full ladder + setup: [`coolify-setup.md`](./coolify-setup.md). On a 4 GB
> box, **build the image off-box in CI/GHCR** (never `next build` on the box) and run one env only. The
> 8 GB "HEMAT" figures below are the **go-live** target, not the starting box.
>
> Decision context (2026-06-16): the owner is moving the production deploy **off Vercel+Neon to a
> self-hosted VPS** (final direction, not a maybe). **Clean start** — no data migration from Neon.
> Postgres + Redis self-hosted as containers on the VPS; files stay on **Cloudflare R2** (with an
> in-country fallback documented in [`cloudflare-fallback.md`](./cloudflare-fallback.md)). This file is
> the cost reference the choice was made from.

Prices are IDR/month. Biznet figures are from its public pricelist (verified 2026-06-16) and take −10% on
annual billing (code `DISKON10`). IDCloudHost's full per-tier matrix isn't publicly scrapeable (confirm in
its console); DomaiNesia is listed as a cheaper-NVMe alternative. R2 ≈ free (free tier 10 GB), Coolify =
free (self-hosted open-source), `pg_dump`→R2 backup = free.

## Summary

|                   | **HEMAT** ✅ (chosen)   | **SEIMBANG**       | **NYAMAN**   |
| ----------------- | ----------------------- | ------------------ | ------------ |
| Boxes             | 1 (shared)              | 1 (NVMe)           | 2 (separate) |
| Disk              | SSD                     | NVMe               | NVMe         |
| Deploy            | manual `docker compose` | Coolify (git-push) | Coolify      |
| Staging isolation | shares resources        | shares (kept lean) | full         |
| **Total/month**   | **~Rp290rb**            | ~Rp620rb           | ~Rp950rb     |
| Annual (−10%)     | ~Rp263rb                | ~Rp560rb           | ~Rp855rb     |

## 🟢 HEMAT — ~Rp290rb/mo (CHOSEN, temporary)

- **VPS**: 1× Biznet **NEO Lite MM 8.4** — 4 vCPU / 8 GB / 60 GB **SSD** = **Rp269rb/mo** (annual ~242rb)
- **Setup**: prod + staging as **two compose projects on the same box** (`palka.app` + `staging.palka.app`),
  self-host Postgres + Redis, files on R2, Caddy auto-TLS, plain `docker compose`.
- **Domain**: `palka.app` ~Rp250rb/yr (≈21rb/mo); staging = subdomain (free).
- **Total ≈ Rp290rb/mo**.
- ➕ cheapest with 2 envs. ➖ SSD (not NVMe); two stacks share 8 GB (tight during `next build` → **2–4 GB
  swap required**); manual deploys, no UI.
- 💡 Same-price NVMe swap: IDCloudHost Basic NVMe 8 GB ~Rp300rb.

## ⭐ SEIMBANG — ~Rp620rb/mo (recommended upgrade)

- **VPS**: 1× Biznet **NEO Lite Pro MM.8.4** — 4 vCPU / 8 GB / 80 GB **NVMe** = **Rp599rb/mo** (annual ~539rb)
- **Setup**: **Coolify** on the box → git-push deploy, 2 environments (prod + staging from branches),
  auto-TLS, scheduled DB backups from the UI. PG+Redis managed by Coolify, files on R2.
- **Domain**: `palka.app` + `staging.palka.app`.
- **Total ≈ Rp620rb/mo**.
- ➕ NVMe (DB fast, ~80k IOPS), automated deploy/TLS/backup, Biznet scaling ladder. ➖ 8 GB is tight for
  Coolify + 2 full envs (for headroom → 16 GB **ML.16.8 = Rp1.099jt**); Biznet premium.
- 💡 Value variant (cheaper NVMe): IDCloudHost Basic NVMe 8 GB ~Rp300rb + Coolify → **~Rp320rb/mo**.

## 🔵 NYAMAN — ~Rp950rb/mo (full isolation)

- **VPS prod**: Biznet **NEO Lite Pro MM.8.4** (4/8/80 NVMe) = Rp599rb
- **VPS staging**: Biznet **NEO Lite Pro MS.4.2** (2/4/60 NVMe) = Rp329rb
- **Setup**: Coolify (or compose) per box; staging cannot affect prod; headroom for builds + traffic.
- **Domain**: `palka.app` + `staging.palka.my.id` (cheap ID TLD).
- **Total ≈ Rp950rb/mo**.
- ➕ clean isolation, performance + headroom, NVMe both. ➖ most expensive.
- 💡 Thrifty staging: run staging on IDCloudHost **hourly**, powered off when idle → ~Rp700rb/mo.

## Provider price reference

### Biznet Gio NEO Lite (SSD) — verified

| Tier       | vCPU | RAM   | Storage   | Rp/mo     |
| ---------- | ---- | ----- | --------- | --------- |
| XS 1.1     | 1    | 1 GB  | 60 GB SSD | 59rb      |
| SS 2.1     | 1    | 2 GB  | 60 GB     | 80rb      |
| SS 2.2     | 2    | 2 GB  | 60 GB     | 109rb     |
| MS 4.2     | 2    | 4 GB  | 60 GB     | 139rb     |
| MS 4.4     | 4    | 4 GB  | 60 GB     | 179rb     |
| **MM 8.4** | 4    | 8 GB  | 60 GB     | **269rb** |
| MM 8.8     | 8    | 8 GB  | 60 GB     | 289rb     |
| LL 16.8    | 8    | 16 GB | 60 GB     | 459rb     |
| LL 16.16   | 16   | 16 GB | 60 GB     | 499rb     |

Add-ons: disk +Rp1.650/GB/mo · snapshot Rp1.500/GB/mo. Bandwidth 10 Gbps IIX no quota, dedicated public IP, KVM.

### Biznet Gio NEO Lite Pro (NVMe, AMD EPYC, ~80k IOPS) — verified

| Tier       | vCPU | RAM   | Storage    | Rp/mo     |
| ---------- | ---- | ----- | ---------- | --------- |
| SS.1.1     | 1    | 1 GB  | 30 GB NVMe | 129rb     |
| SS.2.1     | 1    | 2 GB  | 40 GB      | 169rb     |
| MS.2.2     | 2    | 2 GB  | 40 GB      | 239rb     |
| MS.4.2     | 2    | 4 GB  | 60 GB      | 329rb     |
| MM.4.4     | 4    | 4 GB  | 60 GB      | 439rb     |
| **MM.8.4** | 4    | 8 GB  | 80 GB      | **599rb** |
| ML.16.8    | 8    | 16 GB | 90 GB      | 1.099jt   |
| ML.24.8    | 8    | 24 GB | 100 GB     | 1.429jt   |
| LL.24.12   | 12   | 24 GB | 100 GB     | 1.649jt   |
| LL.48.12   | 12   | 48 GB | 120 GB     | 2.659jt   |

Add-ons: disk +Rp2.200/GB/mo · snapshot Rp2.000/GB/mo.

### IDCloudHost Cloud VPS — partial (confirm in console)

Regions Indonesia (Bogor) + Singapore + London, same price all regions, **hourly** pay-as-you-grow, Basic = NVMe.

| Line                  | example spec          | Rp/mo (≈/hr)       |
| --------------------- | --------------------- | ------------------ |
| Basic Standard (NVMe) | 2 vCPU / 2 GB / 20 GB | ~87rb (~Rp120/hr)  |
| eXtreme Intel/AMD     | 2 vCPU / 2 GB / 20 GB | ~149rb (~Rp204/hr) |
| Managed VPS           | —                     | from ~480rb        |

~4 GB ≈ Rp150–175rb, ~8 GB ≈ Rp300rb (estimate — verify). Base storage 20 GB (add disk as needed).

### DomaiNesia (cheaper-NVMe alternative)

- VPS Lite 1: 1/1/20 NVMe (Intel Xeon) → ~Rp48rb
- VPS Turbo 1: 1/1/20 NVMe (AMD EPYC) + 3× replication → ~Rp80rb (discount codes available)

## Cutover gotchas (clean start)

1. **`MARKETPLACE_ENCRYPTION_SECRET`** — set it on the VPS and never lose it; Lazada tokens are stored
   encrypted. (Clean start = no tokens carried over, so just re-authorize Lazada on the new domain.)
2. **`LAZADA_OAUTH_REDIRECT_URI`** must point at `https://<vps-domain>/...` and be **re-registered** in the
   Lazada console.
3. **`NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=true`** (build arg — the VPS hosts Socket.IO, unlike Vercel).
4. **Build RAM**: `next build` peaks ~2 GB; on an 8 GB box running two stacks, add **2–4 GB swap** (or build
   in CI / locally and pull the image).
5. **Migrations auto-apply** via the compose `migrate` one-shot (`db:migrate:deploy`) — including the
   pending notifications migration `20260616120000_add_notifications`.

## Open items / next steps

- Confirm **Coolify vs plain-compose** (HEMAT implies plain-compose for now).
- Pick + register the domain (`palka.app` leading candidate; see brand note — the brand will become
  "Palka", legal pending, so the domain may sit ahead of the code rename).
- Then: step-by-step deploy runbook, harden `docker-compose.prod.yml` (+ `pg_dump`→R2 backup cron),
  `.env.production` checklist.

Sources: [Biznet NEO Lite](https://www.biznetgio.com/product/neo-lite) · [Biznet NEO Lite Pro](https://www.biznetgio.com/product/neo-lite-pro) · [Biznet pricelist](https://www.biznetgio.com/pricelist) · [IDCloudHost pricing](https://idcloudhost.com/pricing/) · [VPS Indonesia 2026 comparison](https://cekipsaya.com/artikel/vps-indonesia-terbaik-2026/)
