# Seller storefront / website builder — roadmap & research (v2)

> **STATUS: FUTURE / EPIC / NEXT-PHASE.** Research-complete, decision-first blueprint
> (**v2, 2026-06-27**). **Supersedes** the 2026-06-26 first-pass capture — it corrects the
> moat thesis, names the two code blockers, picks a separate `apps/storefront` app, de-risks
> v1 to manual-pay, and verifies the subdomain/custom-domain/TLS plan against primary docs.
> **NOT scheduled / NOT built.** This is the directed plan so that when implementation starts
> it's already scoped. Heavy, multi-session, VPS-era.
>
> Shares a spine with [`whatsapp-integration.md`](./whatsapp-integration.md): both need the
> **VPS custom server**, a **public (anonymous) checkout that reserves real stock**, and
> **per-org premium gating**. **Build that shared spine ONCE, and FIRST.** Infra context:
> [`vps-migration.md`](../deployment/vps-migration.md) + the Coolify research in the team memory.

---

## 0. Decisions locked (defaults — owner sign-off pending)

| #   | Decision                                                                                      | Default                                                    |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | A **separate** `apps/storefront` Next.js app (not bolted onto the authed dashboard)           | **YES**                                                    |
| 2   | v1 ships with **manual pay** ("Tandai dibayar"), **no payment gateway**                       | **YES**                                                    |
| 3   | Reverse proxy = **dedicated standalone Caddy** (not Traefik, not Coolify's Caddy)             | **YES**                                                    |
| 4   | Custom domain = **premium**, via seller **CNAME** + Caddy on-demand TLS                       | **YES**                                                    |
| 5   | v1 theming = **fixed theme set (2–3) + config tokens**, NO custom CSS/free fonts              | **YES**                                                    |
| 6   | Payment gateway (when added) = **Xendit Invoice** default, **Midtrans Snap** as a 2nd adapter | **YES**                                                    |
| 7   | Settlement = **seller-brings-own-key** (funds go to the seller; Falka never holds money)      | **YES**                                                    |
| 8   | Base domain `palka.app` for `*.palka.app`                                                     | **owner call** — pending the Palka rebrand legal clearance |

---

## 1. Vision + the moat (corrected)

Each seller-org gets a **public storefront website** that reads our existing source of truth
(catalog / inventory / orders) and lets anonymous buyers browse + order + pay — customisable by
the seller "like a web builder". Premium feature.

**Moat reframe (research CORRECTED a first-pass thesis error):** the edge is **NOT** "competitors
lack a storefront." **Desty Store** and **Jubelio Store** already ship free branded, custom-domain
storefronts wired to synced stock; **SIRCLO Store** (~IDR 375k/mo) and **Lynk.id** validate the
theme-first / link-in-bio model. Falka's real differentiator is:

- **Correctness — no oversell.** The append-only `StockLedger` + per-variant advisory lock means a
  web sale, a POS sale, and a Lazada order all serialize on ONE source of truth. Channel-sync tools
  reconcile _after the fact_; Falka prevents the oversell _at write time_.
- **Depth** — POS + packing-video dispute evidence + real Lazada order pull, in one system.
- **UMKM pricing/UX** in Bahasa.

Frame the storefront as **"your shopfront on top of the inventory brain you already trust,"** not
"a website builder" competing on themes.

---

## 2. Phase plan (the journey)

Every phase **stacks on the same foundation** — nothing is rebuilt. Effort is **planning-grade,
relative** (1 "session" ≈ one focused work block / branch).

| Phase                                 | Seller gets                   | Payment                   | Effort                   | Gating       |
| ------------------------------------- | ----------------------------- | ------------------------- | ------------------------ | ------------ |
| **1 — Foundation + theme storefront** | a store at `<slug>.palka.app` | manual ("Tandai dibayar") | **~2–3 sessions**        | base/free    |
| **1.1 — Paid checkout**               | online pay, auto status       | gateway (Xendit)          | **+1.5–2**               | base         |
| **1.2 — Custom domain**               | bring-your-own domain         | —                         | **+0.5–1**               | **premium**  |
| **2 — Visual builder (Puck)**         | drag-and-drop pages           | —                         | **~3–4** (separate epic) | **premium**  |
| 3 — Per-tenant isolated deploys       | —                             | —                         | —                        | **REJECTED** |

### Phase 1 — Foundation + theme storefront (the first ship)

Two layers: the invisible **shared spine** (the hard part) + the visible **theme store**.

**Layer A — the shared spine (build FIRST; reused by WhatsApp):**

- A `withPublicRoute` sibling to `withApiRoute` for **unauthenticated** requests: resolves the org
  **by host**, applies per-IP rate-limiting (`@falka/rate-limit`), and gates a submit-time captcha.
- `Order` schema migration so an order can exist **without** a marketplace (see §5) + a new
  **`channel = STOREFRONT`** discriminator and an order **`source`** value `STOREFRONT`.
- **Anonymous reserve-on-PAID** through the existing inventory service advisory-lock path — never a
  parallel pipeline (see §4).
- A **BullMQ** `release-stale-reservation` job + lazy expiry for abandoned/unpaid orders.
- A **dedicated Caddy** proxy doing wildcard subdomain TLS (see §3).

**Layer B — the theme storefront (what buyers see):**

- A new **`apps/storefront`** Next.js app; middleware resolves `<slug>.palka.app` → org, then renders.
- **A fixed shared block library** (`packages/storefront-blocks`): `StoreHeader` (logo + WA button +
  cart) · `HeroBanner` · `ProductGrid` (selector-driven: category | manual variant ids | all; shows
  **live** stock/price/sold-out) · `SingleProductFeature` · `PromoBanner` · `ContactWA` (`wa.me`
  deep-link) · `Footer`. **`ProductDetail` and `Cart/Checkout` are controlled ROUTES, not draggable
  blocks** — checkout stays one secure surface.
- A **config-JSON theme** stored on `Organization.storefrontConfig` (Json, mirrors the existing
  `Organization.permissions` pattern): 2–3 fixed themes + brand/accent color, logo/hero R2 keys, font
  from a curated 2–3 allowlist, WA number, section toggles. Edited with **RHF + Zod** (NOT drag-drop).
- **Checkout flow (manual pay):** anonymous browse → cart (client-only, holds ZERO stock) → checkout
  creates a `PENDING_PAYMENT` Order → buyer pays via the seller's QRIS image / transfer /
  WhatsApp deep-link → **seller clicks "Tandai dibayar"** (revive the parked `markOrderPaid` from
  `session/2026-06-26-manual-chat-orders`) → reserve stock → propagate to all channels.
- **Why manual pay first:** it ships every hard _shared_ part (public surface, anonymous order,
  reserve path, abuse limits) with **ZERO gateway / PCI / settlement / KYC risk**, and matches the
  mainstream Indonesian social-commerce habit (admin sends QRIS → buyer pays → admin processes;
  Permendag 31/2023). **Do NOT ship browse-only** — the order+reserve loop is the point.

### Phase 1.1 — Paid checkout (fast-follow)

- A gateway **adapter behind one interface**: **Xendit Invoice** default (one hosted URL covers
  QRIS + VA + e-wallet; `X-Callback-Token` static-secret verify; `external_id = orderId` for
  idempotency), **Midtrans Snap** as a second adapter (per-payload `SHA512(order_id + status_code +
gross_amount + ServerKey)` signature — stronger posture; native GoPay).
- Webhook reconcile **PENDING → PAID** → reserve-on-PAID automatically; make it **idempotent**
  (both gateways retry) and **re-verify status server-side**. Set the gateway's per-tx expiry
  (Snap `expiry_duration` / Xendit invoice expiry) as the single abandoned-cart timer.
- QRIS MDR is regulator-fixed (~0.7% regular tier) — gateway choice is DX, not price.

### Phase 1.2 — Custom domain (premium)

- Seller brings `toko.theirdomain.com`; CNAME + Caddy on-demand TLS (see §3). Premium-gated via
  `Organization.plan`. Subdomains stay free.

### Phase 2 — Visual builder, Puck (separate epic, premium)

- Swap fixed themes for a **drag-and-drop** builder using **Puck** (MIT, React/Next-native, JSON
  in/out, RSC + external-data `resolveData` so blocks pull **live** catalog/stock). The builder's
  output JSON is rendered by the **same Phase-1 block library** — so Phase-1 work compounds.
- The editor (`<Puck>`, client-only) is hosted **inside the authed dashboard**; the public render
  runs on the storefront. Generate Puck `fields` from each block's Zod schema.
- **Defer until Phase 1 proves demand.** Jumping straight to a visual builder is the project's named
  **over-engineering anti-pattern**. Pin `@puckeditor/core` (pre-1.0, fast-moving — renamed from
  `@measured/puck`, DropZone→slots) and budget a version migration; JSON-in/out keeps lock-in low.

### Phase 3 — Per-tenant isolated deploys — **REJECTED**

N separate deployments per tenant = far more ops than one multi-tenant app. Revisit only for an
enterprise tenant demanding hard isolation.

### Shared spine with WhatsApp

Build the **anonymous-reserve + external-pay + tenant-by-host** infra ONCE. Storefront is the first
consumer (visual, easy to QA); WhatsApp is the second (a WA Flow form POSTing into the same
`createStorefrontOrder` / `markStorefrontOrderPaid` with `channel = WHATSAPP`). **Sequence: spine +
storefront → WhatsApp → Puck builder.**

---

## 3. Subdomain / custom-domain / TLS plan (verified 2026-06-27)

**Proxy = a DEDICATED standalone Caddy** in front of the storefront, owning `:80`/`:443`. Caddy's
On-Demand TLS + `ask` is the cleanest self-host answer to per-seller custom-domain certs. **Do NOT
rely on Coolify's Caddy option** — it's _experimental_ and Coolify's auto-update can **silently
revert Caddy → Traefik** (HTTPS outage; coollabsio/coolify #3603, #9127). If Coolify runs the main
app, keep its Traefik **off** `:80`/`:443` (only one process binds 443) and forward HTTP-only with
`X-Forwarded-Proto https`.

Build the Caddy image with the Cloudflare DNS plugin (not in the stock binary):
`FROM caddy:builder → xcaddy build --with github.com/caddy-dns/cloudflare → copy into caddy:`.

**Two tiers, two mechanisms (do NOT conflate):**

1. **Free subdomains `*.palka.app` → ONE DNS-01 wildcard cert.** A single Let's Encrypt wildcard via
   the Cloudflare DNS API (token scopes `Zone:Read` + `DNS:Edit`, scoped to the zone). Create a
   **wildcard A record `* → VPS IP`** for routing (the `_acme-challenge` TXT is auto-managed by the
   plugin). Since **Caddy 2.10** one wildcard cert auto-serves matching subdomains — no per-tenant
   config. Caveat: a wildcard is **one label deep** (`acme.palka.app` ✅, `a.acme.palka.app` ❌).

2. **Premium custom domains → Caddy On-Demand TLS + a mandatory `ask` allowlist.** On the first TLS
   handshake for a new host, Caddy GETs `…/verify-domain?domain=<host>` and issues a cert **iff** the
   endpoint returns **2xx** (a fast, constant-time DB lookup: host is a VERIFIED + premium tenant
   domain). **The `ask` gate is mandatory in production** — without it, anyone pointing a hostname at
   the IP triggers real ACME orders → exhausts LE limits + handshake DoS. (The old `interval`/`burst`
   rate-limit keys are **deprecated** — don't use them; the `ask` endpoint is the gate.) Custom
   domains use **HTTP-01 / TLS-ALPN-01** (no access to the seller's DNS needed).

```caddyfile
{
    on_demand_tls {
        ask http://storefront:3000/api/internal/verify-domain   # MUST be fast; 2xx = allow
    }
}
*.palka.app {
    tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }            # DNS-01 wildcard
    reverse_proxy storefront:3000
}
:443 {
    tls { on_demand }                                           # catch-all = premium custom domains
    reverse_proxy storefront:3000
}
```

**Seller custom-domain onboarding (beats SIRCLO's nameserver+ticket flow):**

1. Seller enters `toko.theirdomain.com` in Settings → Storefront.
2. We store `StorefrontDomain { orgId, domain @unique, status: PENDING }` and show:
   _"Add a CNAME: `toko.theirdomain.com → cname.palka.app`"_.
3. **Verify ownership BEFORE allowing issuance** (CNAME resolves to our target, or a TXT challenge)
   → `status: VERIFIED`. Only then does the `ask` endpoint green-light it. (This protects the
   **5 failed-validations / identifier / hour** LE limit — never let Caddy attempt issuance on a
   not-yet-pointed domain.)
4. Caddy issues the cert on the first request (a few-seconds cold start; pre-provision high-value
   domains if needed).
5. **Naked-apex caveat (RFC 1034):** no CNAME at a bare apex. For `theirdomain.com` (no subdomain)
   the seller needs an **A record → VPS IP**, or **ALIAS/ANAME/CNAME-flattening** (Cloudflare
   flattens by default). Steer sellers to a **subdomain (`toko.`) via CNAME**, or **`www` + a 301**
   from the apex. Surface apex instructions only when they enter an apex.

**Let's Encrypt limits that bound onboarding** (still current; the 50/week was NOT raised in 2025):

- **50 certs / registered domain / 7 days** — this is **per seller domain, not global**, so aggregate
  custom-domain onboarding is not capped at 50/week overall.
- **300 new orders / 3 h per ACME account** — the real aggregate throughput bound (~1 cert / 36 s).
- **5 failed validations / identifier / hour** — the reason for step 3's pre-verification.

**Ops:** **mount and back up Caddy's `/data`** (cert + key + ACME account store; losing it forces
mass re-issuance → rate-limit lockout). Caddy preserves the incoming `Host` by default — correct for
tenant routing; do **not** override it.

---

## 4. Architecture — how it plugs into Falka

- **Separate `apps/storefront` app (recommend).** The storefront is anonymous/public/SEO-driven — the
  opposite of the authed, Socket.IO-bearing dashboard. A separate app keeps the dashboard's auth
  middleware + `server.ts` (scanner socket) + `(dashboard)` gating untouched (**HARD CONSTRAINT #2**),
  isolates deploy/scale against anonymous traffic spikes, and its middleware does ONE thing:
  host→tenant rewrite. It ships as a plain `next start` standalone server (no socket). It shares ALL
  data/logic via workspace imports — **zero data-model duplication**.
- **Cross-app import caveat (UNPROVEN — needs a spike):** `@/*` maps only to `apps/web/src/*`, so the
  storefront can't raw-import `@/modules/*`. Either add a storefront-local alias or **lift the read
  methods it needs into `@falka/*` packages**, and verify each `*-server.service.ts` is import-safe in
  an anonymous context (many start `import 'server-only'`; any that transitively pull
  `next/headers` / auth / `resolveOrgContext` need care). Most already take an explicit
  `organizationId`, which is the right shape.
- **Service-layer reads only** — blocks call catalog/inventory/sales **services** with
  `organizationId` first, never Prisma, never another module's internals (boundary rule + **HARD
  CONSTRAINT #6**). Never expose cost/HPP fields on the public surface.
- **Anonymous checkout reserves real stock** via `inventoryServerService.applyOrderReserveTx`
  (`inventory-server.service.ts` ~L474), which takes `pg_advisory_xact_lock(hashtext(variantId))` via
  `$executeRaw` and writes 1 ledger row + 1 cache update in one tx. **One change needed:** it
  hard-codes `source:'MARKETPLACE'` / `note:'Marketplace order'` — parameterize `source` OR add a
  `StockLedgerSource 'STOREFRONT'` (coordinate with the inventory module — it owns all stock writes).
  Anonymous actor = a per-org system user (or the OWNER id); buyer identity lives in new nullable
  `Order.buyerPhone/buyerEmail/shippingAddress` columns, NOT a session.
- **New `STOREFRONT` order source** — a storefront order is a real `Order` driven by
  `ordersServerService` (a `createStorefrontOrder` + `markStorefrontOrderPaid` that calls
  `applyOrderReserveTx` then propagates with `excludeConnectionId = null` so a web sale also shrinks
  Lazada). **Reuse the order lifecycle (reserve-on-PAID / PENDING→cancel→release), not the POS `Sale`
  model.**
- **Per-tenant cache invalidation** — use `unstable_cache({ tags }) + revalidateTag` (Falka pins Next
  `^15.5.x`; the stable `use cache` / `cacheComponents` is Next 16, owner-deferred). Tag reads
  `org:<id>:catalog` / `variant:<id>`; call `revalidateTag` at the SAME post-tx spot that already
  enqueues `propagate-inventory-stock`. For live stock without staleness, cache the product **shell**
  and render the stock badge in a non-cached child server component. Multi-instance later needs a
  Redis-backed cache handler (Falka already runs Redis). **Not a v1 blocker — a v1.1 perf item.**

---

## 5. The two code blockers (scaffold before any public byte)

1. **`Order` is non-null-coupled to marketplace.** It requires `marketplaceConnectionId` + a
   `MarketplaceProvider` value. Migration (**HARD CONSTRAINT #1**, `packages/db/prisma/schema.prisma`,
   Order ~L687-749, `MarketplaceProvider` enum ~L38): make `marketplaceConnectionId` **nullable**,
   make `provider` nullable, add a **`channel` discriminator**, add the buyer columns. **Watch the
   frozen-line-set invariant and the `[marketplaceConnectionId, externalOrderId]` upsert key** —
   null-handling regressions there are the real risk. **Prior art:** the parked
   `session/2026-06-26-manual-chat-orders` branch already prototyped the nullable-connection +
   MANUAL-provider Order shape — **extend that, not greenfield.**
2. **`withApiRoute` has no unauthenticated mode** (strict `requireAuth`/`requireAdmin` XOR). Add a
   **`withPublicRoute`** sibling (`apps/web/src/lib/api/with-api-route.ts` is the model): org-by-host
   resolution + per-IP rate-limit + submit captcha + central error mapping, NO auth/session.

---

## 6. Answers to the open questions

1. **RESERVE vs DECREMENT → RESERVE-on-PAID.** Cart + PENDING hold ZERO stock; stock moves only
   PENDING→PAID via the advisory-locked path, mirroring the marketplace/orders lifecycle. (DECREMENT
   is POS-style / goods-in-hand — wrong for a remote anonymous buyer.) A deliberate trade-off, not a
   universal law: it accepts a tiny oversell window (two buyers both reaching pay for the last unit)
   in exchange for zero abandoned-cart locking — consistent with how Falka already reserves on PAID.
2. **Gateway + is paid checkout required for v1 → NOT required.** Ship manual-pay + seller-marks-paid
   first. v1.1 = **Xendit Invoice** default + **Midtrans Snap** behind the same interface (see §2.1).
3. **Custom domain → PREMIUM-only, CNAME + Caddy On-Demand TLS** (NOT nameserver delegation).
   Subdomains = the DNS-01 wildcard (free tier). See §3.
4. **v1 blocks + shared library → YES, one shared library** (`packages/storefront-blocks`); Phase-2
   Puck `fields` are generated from each block's Zod schema. This single rule is what makes Phase-1
   work compound.
5. **Theming depth in v1 → FIXED theme set (2–3) + config tokens** (logo, primary/accent color, font
   allowlist, radius, section toggles, featured picks). NO free-form CSS/fonts (XSS/perf/QA on an
   anonymous surface) — and the config is exactly what the Puck builder later edits. Store as
   `Organization.storefrontConfig` Json.
6. **Shared infra sequencing → build ONCE, build FIRST.** A channel-agnostic public-commerce module
   owns anonymous order creation, the gateway interface + webhook reconcile, reserve-on-PAID,
   abandoned-cart timeout-release, and the anonymous rate-limit/abuse layer. Order: **spine →
   storefront → WhatsApp → Puck.**

---

## 7. Risks + mitigations

- **Anonymous attack surface (NEW — the system only ever served authed members).** → `withPublicRoute`
  with per-IP sliding-window limits (`@falka/rate-limit`, e.g. 5 orders/IP/10min), Cloudflare in front
  (L3/L4 + bot-fight + WAF), a Turnstile/hCaptcha challenge on **order-submit** (not browse), per-order
  qty caps, cached/ISR public reads so scraping doesn't hit Postgres, and never exposing cost/HPP.
  **Security review precedes exposure, not follows it.**
- **On-demand TLS abuse / LE rate-limit exhaustion.** → the `ask` allowlist is load-bearing + mandatory;
  pre-verify the seller's DNS before green-lighting; the wildcard covers subdomains so they never
  consume per-cert issuance.
- **Abandoned-cart stock.** → PENDING holds zero stock (abandonment is free) + a BullMQ
  `release-stale-reservation` job for the reserved/paid-but-unshipped window + lazy expiry at read
  time. When a gateway lands, its per-tx expiry is the single timer.
- **Payment settlement / who-gets-paid.** → v1.1 = **seller-brings-own-key** (buyer pays the seller
  directly; Falka never touches funds). Viable but real per-seller KYC friction (Midtrans/Xendit allow
  perorangan UMKM: KTP + NPWP + bank). Defer Xendit **xenPlatform** sub-accounts/split/payout (and its
  support-enablement + fees) until Falka wants a cut.
- **Over-engineering the builder.** → themes-first ships the hard shared spine without the editor;
  Puck is Phase 2, premium, additive (reuses the whole block library + spine).

---

## 8. Implementation references (when building)

- `apps/web/src/modules/inventory/services/inventory-server.service.ts` — `applyOrderReserveTx`
  (~L474), the advisory-lock reserve path (parameterize `source` / add `StockLedgerSource STOREFRONT`).
- `apps/web/src/lib/api/with-api-route.ts` — the model for a new `withPublicRoute` sibling.
- `packages/db/prisma/schema.prisma` — `Order` (~L687-749), `MarketplaceProvider` enum (~L38) — the
  nullable-connection + `channel` migration (HARD CONSTRAINT #1).
- Branch `session/2026-06-26-manual-chat-orders` — parked `markOrderPaid` + nullable-connection Order
  prior art (extend it).
- `Organization.permissions` (Json) — the pattern to mirror for `Organization.storefrontConfig`.
- New package `packages/storefront-blocks` — the shared block library (Phase 1 + Phase 2).
- New app `apps/storefront` — the public multi-tenant Next app.

---

## Ringkasan (Bahasa Indonesia)

Tiap seller dapat **website toko sendiri** (`tokoanu.palka.app`) yang nyambung ke stok asli Falka —
jadi jualan di web, POS, dan Lazada nggak akan oversell. Fitur premium.

**Urutan pembangunan:**

1. **Fase 1 — Fondasi + Toko Tema** (~2–3 sesi): app `apps/storefront` terpisah, subdomain, 7 blok,
   atur tema (warna/logo, bukan drag-and-drop), checkout **bayar manual** (seller klik "Tandai
   dibayar") — tanpa payment gateway dulu biar nggak ribet pembayaran/KYC. Fondasinya juga dipakai
   fitur WhatsApp nanti.
2. **v1.1 — Bayar Otomatis** (+1.5–2): payment gateway (Xendit dulu, Midtrans cadangan); uang langsung
   ke seller (kita nggak pegang dana).
3. **v1.2 — Domain Sendiri** (+0.5–1, premium): seller pasang CNAME, HTTPS terbit otomatis.
4. **Fase 2 — Builder Visual** (~3–4, epik terpisah, premium): drag-and-drop pakai Puck, dari blok
   yang sama.
5. **Fase 3 — website terpisah per seller**: **ditolak** (beban operasional terlalu besar).

**Proxy = Caddy mandiri** (bukan Traefik/Coolify) untuk HTTPS otomatis subdomain + domain seller.
2 hal di kode yang harus disiapkan dulu: `Order` dibikin bisa tanpa marketplace, dan jalur request
tanpa-login (`withPublicRoute`). Keunggulan utama = **stok akurat (anti-oversell) + kedalaman
POS/Lazada/video packing**, bukan sekadar "punya website toko".

---

_Last updated 2026-06-27 (v2, research-verified decision-first plan; NOT yet scheduled/built).
Supersedes the 2026-06-26 first-pass capture._
