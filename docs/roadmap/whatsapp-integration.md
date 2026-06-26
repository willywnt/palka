# WhatsApp ordering integration — design & roadmap

> **STATUS: DESIGN ONLY (2026-06-26). DO NOT IMPLEMENT YET.** The owner has not yet
> registered any Meta/WhatsApp Business assets, and inbound webhooks need the custom
> Node server that only runs on the **VPS** (dormant on Vercel). This is a VPS-era,
> premium-gated feature. This doc is the plan + the research that backs it; the first
> real task is **owner onboarding (non-code)**, not writing code.
>
> Companion: the **outbound** WhatsApp half is already specced in
> [`notification-engine.md`](./notification-engine.md) (Phase 4: outbox + adapter). This
> doc covers the **inbound** ordering channel and unifies both on one WABA + adapter
> spine. The structured-order plumbing prototyped in the parked branch
> `session/2026-06-26-manual-chat-orders` (an Order from a non-marketplace source) is the
> natural landing zone for a WhatsApp order — reuse it, don't rebuild.

## 1. What & why

Let a seller's customers place an order **inside WhatsApp** that lands directly in Falka
as an internal order. The owner's explicit direction: **structured input (catalog / in-chat
form), NOT free-text parsing** — to minimise ambiguity. Per-org config: each Organization
registers **exactly ONE** WhatsApp business number; the whole feature is gated behind a
**premium plan**.

This is the "real" version of the parked manual chat-order intake: instead of a seller
typing the order by hand, the customer's structured WhatsApp submission creates it.

## 2. Locked direction (decisions, not to relitigate without reason)

- **Official WhatsApp Business Platform (Cloud API).** NOT unofficial WhatsApp-Web
  automation (Fonnte/Watzap/Baileys) — those violate Meta ToS and risk banning the
  seller's real number. (The codebase already rejects them for outbound.)
- **Structured surfaces only:** **WhatsApp Flows** (in-chat multi-screen forms with a
  server data-exchange endpoint) and/or **Catalog + Cart** (interactive multi-product
  messages → an `order` webhook). **No free-text NLP order parsing.**
- **One WA number per org = one WABA = one Meta Commerce catalog per org.** This both
  satisfies the per-org requirement AND resolves the platform's "one catalog per WABA"
  limit (no cross-org catalog leakage).
- **Premium-gated**, OWNER/ADMIN-only to connect/disconnect the number.
- **Billing model A for v1 — bring-your-own-WABA:** the seller's own WABA carries the
  Meta charges (their payment method); **Falka never touches message money or BSP markup**.
  Premium = a feature flag, not a wallet. (Falka-as-BSP rebilling = deferred, see §6.)
- **VPS-only:** inbound webhooks + the Flows data-exchange endpoint need the always-on
  custom server (`apps/web/server.ts`) + worker — sequence this AFTER the VPS cutover.

## 3. Hard prerequisites (owner / non-code — START NOW, this is the long pole)

Meta business verification is the multi-week critical path and **hasn't started**. Begin
in parallel with everything else:

1. Create a **Meta Business Portfolio** (Business Manager) for the company.
2. Prepare verification docs — Indonesia needs: legal company name, business address,
   **NIB or NPWP**, and a **business website whose domain + content carry the legal name +
   logo**. (Most rejections are inconsistent/low-res docs or a mismatched website; a
   rejection triggers a **~30-day cooldown** — get it right the first time.)
3. Decide the path for the FIRST pilot number (see §6): a **BSP** (faster) or direct
   Meta. Either way, register/verify **at least one WABA + phone number** so real
   `wabaId` / `phoneNumberId` / `catalogId` values exist to build against.
4. **Coexistence (since May 2025)** lets a number stay in the WhatsApp Business app AND on
   the Cloud API — so most Indonesian micro-sellers can keep their existing number.
   Confirm Coexistence eligibility for ID numbers with the chosen provider (it depends on
   country/BSP/number). Without it, the existing app account must be deleted/migrated
   (downtime + chat-history loss).

## 4. Architecture in Falka (when built)

Mirror the existing **adapter-first marketplace** pattern — keep the rest of the app
provider-agnostic so a BSP today and direct Cloud API later are swappable.

- **`whatsapp` provider/adapter** beside Lazada/Shopee/Tokopedia
  (`modules/marketplace/adapters` + `provider.registry.ts`), **env-gated** with a Dev-stub
  fallback when creds are unset (HARD CONSTRAINT #3).
- **Per-org connection record** (mirror `MarketplaceConnection`, org-scoped): store
  `{ wabaId, phoneNumberId, catalogId, displayName, qualityRating, accessToken(encrypted) }`
  with a **`@@unique([organizationId])`** (exactly one WA number per org). Reuse the same
  **token-crypto** util the other adapters need — lift it to a `@falka/*` package once
  (already a flagged gotcha) so a leaked token can't cross tenants.
- **Onboarding = Meta Embedded Signup**, embedded in the org's Settings ("Hubungkan
  WhatsApp") — a Facebook-login popup that auto-creates the org's WABA + registers the
  number and grants Falka API access. Analogous to the Lazada OAuth authorize/callback we
  already built. The token exchange + webhook subscription happen **server-side on the VPS**.
- **Inbound webhook** = a new Route Handler `POST /api/v1/whatsapp/webhook` (+ a `GET`
  verify-token handshake) that **runs only on the VPS custom server**. It MUST verify
  Meta's `X-Hub-Signature-256` (app-secret HMAC) before touching any org data, then hand
  off to a `whatsapp` service (no business logic in the handler — boundary rule).
- **Order landing reuses existing machinery:** map each incoming product to a `Variant` by
  **`retailer_id` = our SKU** via the marketplace mapping (`resolveOrderItem` /
  `mapByExternalRef`), then go through `orders-server.service` to **RESERVE against the
  StockLedger SoT** (advisory-lock path). A WhatsApp order behaves like a Lazada pull
  result — **a new order SOURCE/channel, never a parallel order pipeline.** (Likely a new
  `MarketplaceProvider`/source value `WHATSAPP`, same shape as the parked `MANUAL` work.)
- **Premium gating:** add a permission key (e.g. **`whatsapp.manage`**) to the 11-key
  catalog and gate connect routes with `requirePermission` + the per-org **`Organization.plan`**
  flag (the admin-ops console already edits `plan`); enforce at the service boundary, UI
  hiding cosmetic.
- **Outbound** (order confirmation / shipping update) = the **deferred notification-engine
  WhatsApp outbox + adapter** — build the send path as a generic outbox the notifications
  module also enqueues into. Route through the worker/queue (BullMQ) like marketplace-sync,
  best-effort-after-tx, with quality-rating awareness.

## 5. The structured-order flow (two Meta primitives)

**Catalog + Cart (browse path):**

1. Keep a Meta Commerce catalog per org; **sync from our inventory SoT** via the Catalog
   **Batch Graph API** (`/{catalog_id}/items_batch`, CREATE/UPDATE/DELETE keyed by
   `retailer_id` = SKU) — a new outbound job analogous to `packages/queue/.../marketplace-sync`,
   reusing the per-`(org,variant)` coalescing + absolute-set semantics. (Scheduled CSV/XML
   feed is the hourly fallback; Batch API for near-real-time. **Verify the exact endpoint +
   batch limits + the ~500-product catalog cap** against live Meta docs before building.)
2. Send a Single/Multi-Product interactive message (`type: 'product' | 'product_list'`,
   up to 30 items) referencing `catalog_id` + `product_retailer_id`s.
3. Customer adds to the in-WhatsApp **Cart** and sends it → our webhook receives an inbound
   message of **`type: 'order'`** with `catalog_id` + `product_items[]`
   (`product_retailer_id`, `quantity`, `item_price`, `currency`).
4. **CRITICAL — `item_price` is a catalog snapshot, NOT an authoritative total.** Re-price
   every line from our own `Variant` price (+ `sale-totals` util) and **re-validate/reserve
   against the inventory SoT** before confirming. Pin currency to IDR. Never trust the
   WA-supplied total.

**WhatsApp Flows (form/checkout path):** an in-chat form (dropdowns, qty steppers, address,
payment pref) whose submission arrives as `interactive.type: 'nfm_reply'` with a
`response_json` **string** (JSON.parse → validate with Zod). A **dynamic** Flow calls our
**data-exchange endpoint** (must respond **< 10s** — a slow catalog/inventory query mid-Flow
breaks the order; the VPS endpoint must be fast). Use a Flow for the checkout details the
cart `order` doesn't carry (address/payment), correlated via the `flow_token` we mint.

**Payment:** **no in-chat payment in Indonesia** (WhatsApp Pay = India/Brazil only). The
order ends with an **external payment link / QRIS** (Midtrans/Xendit) → a clear
**PENDING → PAID** state. Reserve-on-PAID (don't hold stock for abandoned carts); reconcile
via the gateway webhook or manual mark-paid (the parked manual-order `markOrderPaid` is the
exact primitive).

## 6. Provider strategy — direct Meta vs BSP

Whoever we route through, **Meta's per-message fee is unavoidable**; the choice is who
absorbs onboarding + billing.

| Option                                     | Gist                                                                                                                                                                                                                                                            | Verdict                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct Meta Cloud API**                  | Falka becomes a Meta **Tech Provider** (one-time business verification + App Review + Access Verification), self-hosts Embedded Signup + webhooks on the VPS. Cheapest at scale (no markup), most control, matches the self-host direction.                     | **Eventual destination**, AFTER the integration + onboarding UX are proven. Front-loads weeks of Meta bureaucracy.                                                                              |
| **BSP — 360dialog (primary)**              | Developer-first Tech-Provider BSP: clean Cloud-API passthrough (we own the catalog/Flows→order webhook, no forced inbox), true multi-tenant Partner Hub (one number per org), **flat per-channel license** (~€25/€49 per number/mo, **no per-message markup**). | **Recommended phase-1 provider.** Flat license maps cleanly to premium gating. Caveat: EUR/USD billing + 4% card fee; confirm passthrough/webhook specifics + all-in IDR cost in a **sandbox**. |
| **BSP — Twilio (fallback)**                | Mature docs, dedicated subaccount per client (clean isolation), first-class Flows. **Per-message markup** ($0.005 sent + $0.005 received).                                                                                                                      | Fallback if 360dialog's billing/onboarding blocks us. Markup less predictable for gating.                                                                                                       |
| **Local IDR BSP — Mekari Qontak / Qiscus** | Official ID BSPs, IDR billing, Bahasa onboarding, NIB/NPWP handling. But inbox/CRM-first; weaker "one account → many client numbers via our own webhook".                                                                                                       | **Reserve** for a future managed/white-glove or IDR-billed tier; not the build-on layer.                                                                                                        |
| **Falka-as-BSP wallet (Model B)**          | One central credit line, Falka pays Meta + meters/rebills per org.                                                                                                                                                                                              | **Defer.** Makes Falka liable for every org's marketing spend + an Indonesian payments/tax surface. Only with real demand + a hard per-org spend cap.                                           |

**Recommended path = Hybrid (Option C):** start the owner's Meta business verification
immediately; ship v1 behind **360dialog** (Embedded Signup + Coexistence + Flows) so each
org connects ONE number in minutes; architect the adapter so we can **flip to direct Cloud
API** later to drop the markup, preserving each seller's number/quality/templates on migration.

## 7. Pricing & premium gating (design to stay in the free lanes)

Per-message pricing since **1 Jul 2025** (per delivered **template** message, by category +
recipient country):

- **SERVICE** (free-form replies inside the open **24h** customer-service window): **FREE, unlimited.**
- **UTILITY** template inside an open service window: **FREE** (only paid if sent cold/outside).
- **Free entry point:** a thread opened via click-to-WhatsApp ad / FB-page button = **72h** where everything (incl. templates) is free.
- **MARKETING:** the costly, **uncapped-risk** lane — **no volume discount**, ~**Rp586/msg** in Indonesia.
- Indonesia approx base rates (treat as ±, FX-floating, re-confirm against a real Meta
  invoice): marketing ~Rp586, utility ~Rp357, auth ~Rp357 (auth-international ~Rp1,940),
  service Rp0.

**Implication:** an **inbound, customer-initiated** ordering flow is **largely FREE** (the
customer messages first → 24h free window; replies are free SERVICE; order confirmations are
free UTILITY in-window). The only real cost/abuse risk is **MARKETING blasts** — for v1
**exclude marketing**, or put it behind an explicit **per-org monthly spend cap + confirm
dialog**. Don't hardcode rates — store an editable per-category rate table and show cost as
an **estimate** (Meta changed rates Jan/Apr 2026 and is rolling out marketing max-price bidding).
Log every send (category, est. cost, template) to audit so the owner sees spend.

## 8. Phasing

- **Phase 0 — owner onboarding (non-code, NOW):** Meta Business Portfolio + business
  verification (NIB/NPWP + matching business website); pick provider; get one verified WABA
  - number + Commerce catalog. _(Blocks everything; multi-week.)_
- **Phase 1 — connect + inbound order (VPS-era):** `whatsapp` connection module (Embedded
  Signup onboarding, per-org WABA, premium gate + `whatsapp.manage`); inbound webhook
  (signature verify) on the VPS server; catalog sync (Batch API, SKU = `retailer_id`);
  cart `order` → re-price/re-reserve → **PENDING** order; external payment link → **PAID**
  (reuse the parked `markOrderPaid`). Provider = 360dialog adapter.
- **Phase 2 — Flows checkout + outbound:** a Flow for address/payment/notes; outbound
  **utility** order-confirmation/shipping templates via the notification outbox; a health
  panel surfacing quality rating / messaging tier (mirror the Phase-6 marketplace health).
- **Phase 3 — direct Cloud API:** once Falka passes Tech Provider App Review, flip the
  adapter off the BSP to drop the per-message/license markup.

## 9. Risks

- **Meta verification is slow + rejection-prone** (~30-day cooldown on failure) and hasn't
  started — the whole feature slips by weeks if treated as a prerequisite. _(Mitigate: BSP-first hybrid; start verification now.)_
- **Marketing-template spend** is uncapped and scales fast — needs a per-org cap or exclusion.
- **Coexistence isn't guaranteed** for every ID number — some sellers may face migrate/downtime.
- **Flows endpoint <10s SLA** — a slow mid-Flow query breaks the customer's order.
- **Token = high-value cross-tenant secret** — token-crypto in a shared package with rotation, not ad hoc.
- **No in-chat payment in ID** → orders are only real after an external payment; need a
  clean PENDING→PAID + abandoned-cart handling so stock isn't reserved indefinitely.
- **Public/anonymous order surface** (if a web payment page is involved) is a new attack
  surface for a system that only served authed org members — rate-limit + anti-bot.
- **`item_price` snapshot drift** vs SoT price can confuse customers — reconcile/re-quote.
- **Bundles:** marketplace orders aren't bundle-aware today — a WA `order` referencing a
  bundle `retailer_id` needs the same deferral or explicit explosion.

## 10. Open questions (resolve before building)

1. Direct Tech Provider eventually, or BSP permanently? (Decides whether to invest in App Review.)
2. 360dialog vs Twilio vs a local IDR BSP — run a per-message + monthly cost comparison vs the premium price in a sandbox.
3. Each org brings its own number (Coexistence) — confirmed for ID numbers with the chosen BSP?
4. Catalog browse + Flow confirm, or Flow-only (picker)? (Catalog adds a second product-sync surface — is in-chat browse worth it?)
5. Order confirmations as in-session/Flows (free) vs cold templates (paid) — design to keep traffic in the free window.
6. Which ID payment gateway for the external pay link (Midtrans / Xendit / QRIS)? Required for v1?
7. One-WA-number-per-org permanent, or eventually multiple numbers/departments? (Affects the connection schema.)
8. Confirm the exact current ID per-message rate card + the Catalog Batch endpoint/limits + the ~500-product cap against live Meta docs (research used third-party + FX-derived figures).

## Sources (2025-2026, verify before relying)

- Meta — Embedded Signup, Tech Provider / Multi-Partner, Cloud API get-started, pricing
  updates (per-message, Jul 2025), messaging limits, Flows webhooks, commerce-settings /
  multi-product messages, business-phone-number / display-name rules
  (`developers.facebook.com`).
- Coexistence (May 2025): ycloud.com/blog/whatsapp-business-app-coexistence-meta-update.
- BSPs: docs.360dialog.com (tech-provider, pricing), twilio.com/docs/whatsapp/isv
  (tech-provider integration guide), Mekari Qontak (mekari.com/blog/harga-whatsapp-business-api),
  Qiscus, SleekFlow, Gupshup, Wati, Sirclo Chat.
- Pricing/ID rates: ycloud, engagelab, uptail.ai, chatmaxima, flowcall, heltar (treat IDR figures as approximate).
- Order webhook shape: developers.messagebird.com (whatsapp-product-messages), infobip,
  tyntec. Flows: getkanal, sanoflow, infobip.

_Last updated 2026-06-26 (research-backed design; NOT yet implemented)._
