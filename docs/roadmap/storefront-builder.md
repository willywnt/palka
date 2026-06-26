# Seller storefront / website builder — research & roadmap

> **STATUS: FUTURE / EPIC / NEXT-PHASE (idea captured 2026-06-26).** Heavy, multi-session,
> VPS-era. Not scheduled. This doc captures the owner's idea (a premium "build your own
> storefront website, integrated with our system" feature) + the research so the next pick
> is informed. **Phase it** — do NOT jump straight to a visual builder (over-engineering is
> a project anti-pattern).
>
> Shares a spine with [`whatsapp-integration.md`](./whatsapp-integration.md): both need the
> **VPS custom server**, a **public (anonymous) checkout that reserves real stock**, and
> **per-org premium gating**. Build that shared infra ONCE.

## 1. Vision

Each seller-org gets a **public storefront website** that reads our existing SoT
(catalog / inventory / orders) and lets buyers order + pay — customisable by the seller
"like a web builder". Premium feature. Indonesian comparables that validate the
theme-first model: **SIRCLO Store** (~IDR 375k/mo ready-template webstore) and **Lynk.id**
(link-in-bio commerce).

## 2. Phasing (theme first, builder later)

- **Phase 1 — template/theme storefront (RECOMMENDED start).** ONE multi-tenant Next.js
  app renders every org's store from a small per-org **config JSON** (logo, colours,
  sections, which products). Seller picks a theme + toggles config — no free-form layout
  yet. This is where the **hard, shared infrastructure** gets built (see §3). Matches the
  local market (SIRCLO/Lynk) and ships fastest.
- **Phase 2 — embeddable visual page builder.** Swap fixed themes for a drag-and-drop
  builder (**Puck**, see §4) so sellers compose pages from our commerce blocks. Adopt
  **only after Phase 1 proves demand**. Builder output is just JSON rendered by the same
  Phase-1 runtime — so Phase-1 work carries forward.
- **Phase 3 — per-tenant isolated sites (deferred / enterprise only).** N separate
  deployments per big tenant. **Rejected for now** — far more ops than a single multi-tenant
  app; revisit only for an enterprise tenant demanding isolation.

## 3. Architecture (the shared, hard part — build in Phase 1)

- **One multi-tenant Next.js app**, tenant resolved by **host** (subdomain
  `toko.<base>` or a bring-your-own **custom domain**) via middleware → org-scoped
  catalog/inventory reads. (Vercel-for-Platforms does this with auto-SSL, but Falka is
  self-hosting.)
- **Per-tenant TLS on the VPS:** **Caddy On-Demand TLS** issues a Let's Encrypt cert per
  custom domain at first request, **gated by an `ask` allowlist endpoint** (without the
  allowlist, attackers can force cert issuance for arbitrary domains / hit LE rate limits).
  A **DNS-01 wildcard** cert covers `*.<base>` subdomains. Fits the self-hosted Docker
  compose direction (no Vercel needed).
- **Public checkout = the riskiest shared piece.** A storefront/WhatsApp buyer is
  **anonymous** (no org auth session) — the system has only ever served authenticated org
  members. Needs its OWN: rate-limit, bot/abuse protection, and an **unauthenticated
  reserve-stock path that still respects the `StockLedger` advisory lock + org scope**.
  Decide per flow whether it **RESERVEs** (order lifecycle, pay-later — mirrors the orders
  path) or **DECREMENTs immediately** (POS-style, pay-upfront). **Never write stock directly.**
- **Indonesian payment gateway** (Midtrans / Xendit / QRIS) with a PENDING→PAID webhook
  reconcile — the same external-payment problem as WhatsApp (no in-chat pay in ID), so
  **build the pay + reserve flow once and share it** with the WhatsApp channel.
- **SEO / perf:** SSR/**ISR** with **per-tenant cache tags** so a stock/price change
  invalidates only that org's pages — adds cache-invalidation hooks into inventory/catalog
  writes.

## 4. Builder tech (Phase 2) — Puck recommended

| Tool       | Notes                                                                                                                                                                                                             | Verdict                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Puck**   | MIT, React/Next-native, **JSON in/out** (portable, self-hosted, no SaaS rent), supports **RSC + external data sources + dynamic prop resolution** (`resolveData`) so blocks pull **live catalog/stock**. ~12.6k★. | **Recommended.** Fits our org-scoped, live-stock, self-hosted stance; output is data we render in the Phase-1 runtime. |
| GrapesJS   | Full style/asset manager OOTB but framework-agnostic — you build the React bridge.                                                                                                                                | Heavier integration.                                                                                                   |
| Craft.js   | A framework to _build_ an editor — most assembly.                                                                                                                                                                 | Too much DIY.                                                                                                          |
| Builder.io | Hosted **SaaS** (recurring cost, not self-hostable).                                                                                                                                                              | Conflicts with self-host + data ownership.                                                                             |
| Plasmic    | Richer/design-system-oriented, hybrid/on-prem options, heavier.                                                                                                                                                   | Overkill for small shops.                                                                                              |

Define a **shared commerce block library** (product grid, single product, hero, promo
banner, contact) used by BOTH Phase-1 themes and the Phase-2 builder, so the work compounds.

## 5. How it reuses Falka (don't fork)

- Storefront reads **catalog/inventory/orders through their service layers** (boundary
  rule) — a new public-facing app/surface, not a parallel data model.
- A storefront sale lands through the **same internal order/sale creation + stock
  lifecycle** as POS/marketplace (advisory-lock per variant; propagate to channels
  excluding the source) — reuse, don't reimplement.
- **Premium gating** consistent with the rest: subdomain store could be base/free; **custom
  domain = premium**; the **visual builder = premium**. Enforce via `Organization.plan` +
  plan checks at the route/service layer (UI hiding cosmetic).
- Per-org storefront config = new fields/table keyed by `organizationId`.

## 6. Risks

- **Public anonymous surface** = a real new attack surface (stock-reservation abuse,
  scraping, fraud) — deliberate rate-limit/anti-bot before go-live.
- **Custom-domain SSL automation** needs the Caddy `ask` allowlist or it's an open
  cert-issuance/rate-limit hole.
- **Payment reconciliation:** abandoned carts must not hold stock forever — clean
  PENDING→PAID + timeout/release.
- **Scope creep / over-engineering:** jumping to a full Puck builder before a theme
  storefront ships — the project rules flag over-engineering explicitly. Ship themes first.
- **Ops multiplication** if tempted toward per-tenant deployments (Phase 3) — keep one
  multi-tenant app.

## 7. Open questions

1. RESERVE (pay-later, order lifecycle) or DECREMENT (pay-upfront, POS-style) for a storefront sale?
2. Which ID payment gateway (Midtrans / Xendit / QRIS), and is paid checkout required for v1 or can v1 be browse + order-and-pay-on-WhatsApp/manual?
3. Custom domain premium-only? Seller points a CNAME (Caddy on-demand) vs nameserver delegation (DNS-01 wildcard)?
4. Which blocks define the v1 storefront, and do Phase-1 themes + the Phase-2 builder share one block library?
5. Per-tenant theming beyond config (custom CSS/fonts) in v1, or a fixed theme set + config (as SIRCLO/Lynk do)?
6. Does this share the WhatsApp external-payment + public-reserve infra (it should) — sequence so that infra is built once?

## Sources

- Multi-tenant Next.js + per-tenant SSL: vercel.com/docs/multi-tenant; caddyserver.com/docs/automatic-https; fivenines.io (Caddy on-demand TLS).
- Builders: github.com/puckeditor/puck + puckeditor.com/docs (external data, RSC); gjs.market (GrapesJS/Craft.js/Builder.io/Puck compare); plasmic.app.
- ID comparables: store.sirclo.com; lynk.id.

_Last updated 2026-06-26 (research-backed; idea captured, not scheduled)._
