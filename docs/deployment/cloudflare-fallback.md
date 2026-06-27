# Cloudflare-in-Indonesia — resilience & fallback runbook

> **STATUS: documented fallback (2026-06-28), not an active migration.** Indonesian enforcement
> (Komdigi anti-online-gambling) has **threatened** Cloudflare (Nov 2025 PSE-registration dispute) but
> **NOT executed a nationwide block** as of mid-2026 — it went to dialogue. This is a "have a ready
> fallback," not "redesign now." **Re-check the Komdigi–Cloudflare status before any irreversible call.**

## Why Falka's exposure is LOW

The app runs as a **direct Jakarta-origin VPS, not behind Cloudflare's orange-cloud proxy** — so the
sharpest vector (ISPs blocking shared proxy IP ranges to catch judol sites) does **not** touch
dashboard/Socket.IO traffic. Only **two** Cloudflare dependencies remain, and both are swappable:

| Surface                                   | Risk                | Note                                     |
| ----------------------------------------- | ------------------- | ---------------------------------------- |
| App / Socket.IO (direct origin)           | Low                 | not proxied                              |
| R2 S3 API (`*.r2.cloudflarestorage.com`)  | Low                 | no ID block reports                      |
| R2 public `*.r2.dev`                      | **Medium**          | not for production — use a custom domain |
| Cloudflare authoritative DNS (grey-cloud) | Low                 | not the disputed surface                 |
| `1.1.1.1` resolver                        | **Real (separate)** | TelkomGroup blocks it since 2022         |

## The architecture is already Cloudflare-OPTIONAL

1. **Object storage** — behind the S3-SDK `StorageProvider` abstraction → swapping is a config change
   (`endpoint` / `region` / keys / `forcePathStyle` / public-URL base + bucket name, all env-driven),
   ~½–1 day incl. presign test + `rclone` copy. Not a rewrite.
2. **DNS/TLS** — **TLS is issued by Let's Encrypt on Falka's own Caddy; Cloudflare is NOT the CA.** The
   only Cloudflare dependency is the DNS provider for the DNS-01 wildcard. Customer bring-your-own
   domains use on-demand **HTTP-01** → no DNS API at all; only the `*.palka.app` wildcard needs DNS-01.
3. **CDN/DDoS** — for ID buyers served from a Jakarta origin, a CDN is practically unnecessary for
   latency. DDoS: Biznet's free L3/L4 + `caddy-ratelimit` + fail2ban.

## The fallback plan (ready-to-switch)

### Object storage

- **PRIMARY (keep): Cloudflare R2** — $0.015/GB-mo, zero egress; unbeatable for video-heavy uploads.
- **FALLBACK (in-country): Biznet Gio NEO Object Storage** — same vendor as the VPS, Jakarta DC,
  S3-compatible, presign + ACL, ~Rp1.000/GB-mo, no bandwidth fee. One bill, one support, in-country.
  - ⚠️ **LANDMINE — test before trusting:** Biznet's docs show **Signature V2**, but aws-sdk v3 presign
    **requires SigV4** (no downgrade). Ceph RadosGW usually supports SigV4, but **run one aws-sdk-v3
    presigned-PUT to the Biznet endpoint and confirm it works** before relying on it.
- **Backup-to-backup:** AWS S3 Jakarta (`ap-southeast-3`, most SDK-faithful but pricier + metered
  egress); IDCloudHost IS3 (~Rp507/GB, rougher — ok for the public bucket).

### DNS / TLS

- **PRIMARY (keep): Cloudflare DNS in grey-cloud / DNS-only mode** for the DNS-01 wildcard. TLS is always
  Let's Encrypt on the box.
- **FALLBACK: deSEC** (free, non-profit, anycast, DNSSEC, first-class `caddy-dns/desec` module). Swap =
  rebuild the Caddy image (xcaddy with the new plugin) + change the token.
- Keep **one** wildcard cert for `*.palka.app` (LE limit: 50 certs/registered-domain/week); never
  per-subdomain. Customer custom domains use on-demand HTTP-01 (no DNS API).

## Do NOW (cheap insurance, hours — not days)

1. Serve all public images via a **custom domain** (`cdn.palka.app`), **stop using `r2.dev` URLs.**
2. **Pre-provision Biznet NEO Object Storage** + run **one SigV4 presigned-PUT test**. Save the working
   config block + `rclone` copy commands here.
3. Don't hardcode `1.1.1.1` as the VPS/container resolver — use the provider's resolver or `8.8.8.8`/`9.9.9.9`.

## Document-only (flip when/if needed)

- Storage flip: `rclone sync` R2 → Biznet/IDCloudHost, change the `StorageProvider` env, redeploy.
- DNS flip: move the zone (or just the DNS-01 challenge) to deSEC, rebuild Caddy with `caddy-dns/desec`.

## Sources

Jakarta Post (2025-11-20) "Cloudflare services may be blocked, govt warns"; Komdigi siaran pers
(audiensi 2025-11-25); Biznet NEO Object Storage product page; Cloudflare ISP-blocking troubleshooting;
deSEC (desec.io). Figures are mid-2026 — re-confirm at purchase / before flipping.

---

_Last updated 2026-06-28. A documented fallback; Cloudflare R2 + DNS remain primary._
