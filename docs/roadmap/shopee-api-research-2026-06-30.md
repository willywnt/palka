# Shopee Open Platform v2 — Definitive Integration Research (verified against the scaffold)

> Date: 2026-06-30 · Status: decision-ready · Method: 25-agent deep-research workflow
> (6 parallel doc-sweep agents + 18 adversarial verifiers across 6 headline claims + 1 synthesis),
> verdicts trusted over raw research where they conflicted.
>
> **Confidence note:** `open.shopee.com` is JavaScript-rendered and could not be fetched. The
> strongest primary sources obtained are **Shopee's own TH Open API Developer Guide v2.1
> (2022-07-22)** PDF on Shopee's CDN (extracted verbatim — authoritative for governance/account
> types), and the **congminh1254/shopee-sdk** TypeScript schemas (advertised "100% endpoint
> coverage", parameter text copied 1:1 from the portal — authoritative-grade for the wire API).
> Facts resting only on community SDKs/guides are flagged. Things that can ONLY be confirmed with
> live sandbox creds are in §5.
>
> Supersedes the ⚠ VERIFY flags in `docs/roadmap/shopee-tokopedia-integration.md` §3.

---

## 0. SANDBOX API HOST — live paired-test finding (2026-06-30) ⭐

> Added after live sandbox onboarding. This is the single most load-bearing operational fact.

Our sandbox app (App Category **Seller In House System**, Test Partner_id **1237107**, account region
**SG**) is provisioned on Shopee's **newer sandbox family** `*.sandbox.test-stable.shopee.com`
(console `open.sandbox.test-stable.shopee.com`, login `account.sandbox.test-stable.shopee.com`) — NOT
the classic `partner.test-stable.shopeemobile.com`. The classic host returns `error_sign` for this
app's key (the app isn't in that registry). The console-minted authorize link is OAuth2-style
(`open.sandbox.test-stable.shopee.com/auth?…response_type=code`, **no HMAC**), which initially looked
like a different protocol.

**It is NOT a different protocol — only the API HOST differs.** The newer family still speaks classic
Open Platform v2: same `/api/v2/...` paths, same HMAC-SHA256 over `partner_id + api_path + timestamp`
(public) / `+ access_token + shop_id` (shop), same `shpk…`-prefixed partner_key used **verbatim** as
the HMAC secret (no strip, no decode — confirmed: stripping/decoding all fail).

**VERIFIED WORKING sandbox API host (HTTP 200, `error:""`):**

```
SHOPEE_API_BASE_URL=https://openplatform.sandbox.test-stable.shopee.sg
```

A signed `GET /api/v2/public/get_shops_by_partner` against that host returned the authorized shop
`227699564` (region `ID`), proving key + HMAC + paths are all correct — the only fix needed is the
**env host** (no code change; the adapter already reads `SHOPEE_API_BASE_URL`). The OAuth2 consent
still yields a classic `code` + `shop_id` exchanged via the unchanged `/api/v2/auth/token/get` on the
`openplatform.…` host.

**Diagnosis trail (so we don't relearn it):** `error_sign` persisted across token/get + public APIs
on `partner.test-stable.shopeemobile.com` despite a byte-correct sign and the exact console key →
ruled out code/key/whitespace → the OAuth2 auth_link + region SG revealed the newer sandbox family →
empirically probed hosts → `openplatform.sandbox.test-stable.shopee.sg` accepted the sign. Lead came
from a real ISV backend (`developer-gilberto/shopixturbo-backend`) using
`SHOPEE_AUTH_PARTNER_HOST=openplatform.sandbox.test-stable.shopee.sg` with unchanged v2 paths.

**OPEN for GO-LIVE:** the LIVE API host is likely a regional `openplatform.*` (e.g. `openplatform.shopee.sg`
/ region-specific), NOT necessarily `partner.shopeemobile.com` — `region: ID` shops were served via
the `.sg` gateway in sandbox. **Confirm the exact live API host with Shopee before production**, and
revisit `DEFAULT_BASE_URL` (currently `https://partner.shopeemobile.com`) at go-live.

---

## 1. Executive answer — "in-house system" vs "third-party / ISV"

**Question:** Does the Shopee Open Platform API differ between an "in-house system / Seller" app and
a "third-party / ISV" app — and can Palka use its current in-house-registered partner credentials for
a multi-tenant SaaS?

### What differs — three layers, not the false "API vs governance" dichotomy

1. **The wire-level REST protocol is IDENTICAL across types** — same host
   (`partner.shopeemobile.com`), same `/api/v2/...` paths, same HMAC-SHA256 signing, same
   `auth_partner` OAuth consent flow, same common params, same 4h/30d token lifecycle. No community
   SDK branches on app category. **Confidence: HIGH.**

2. **The SET OF CALLABLE API MODULES differs by type ("OpenAPI access").** The official guide says
   verbatim, twice: _"the accessible APIs may vary based on the types"_ and _"different types of
   developers can create different types of APPs, which have different OpenAPI access."_ So which
   modules/scopes an app may invoke is **type-gated entitlement**, not merely onboarding. The exact
   per-type module matrix lives on the JS-rendered "v2 Developer Types and APP Types" console page and
   **could not be enumerated**. **Confidence: HIGH that a difference exists; the exact denylist is
   UNVERIFIED.**

3. **Onboarding/audit/governance/intent differ.** "Shopee Seller" type = a seller integrating their
   **OWN** internal system/shops (audit 3–5 working days, verifies the seller's own Shopee login +
   business reg). "Third-party Partner Platform (Enterprise 3rd Party)" = the explicit lane to
   _"apply OpenAPI to connect FOR YOUR CLIENTS"_ (audit 10–12 working days, requires business reg + a
   live HTTPS/TLS-1.2 product URL + a test account). **The type is chosen at profile signup and is
   PERMANENT** ("Once it has been submitted, you won't be able to change the type"). **Confidence:
   HIGH.**

### Authorization model (the decisive technical point)

- The `/api/v2/shop/auth_partner` OAuth consent flow is **byte-for-byte identical for both types**. A
  shop owner always logs in and clicks "Confirm Authorization" (valid **365 days**, then re-auth).
  **There is NO auto-authorization or whitelist** — even an in-house app must run the full OAuth flow
  to authorize its own shop.
- There is **no documented hard technical lock** in `auth_partner` preventing an in-house ("Seller")
  app from receiving a click-through authorization from an unrelated shop. In sandbox, an in-house app
  **might** complete OAuth with arbitrary shops.
- **But that is a category/policy violation, not the supported path.** The documented lane for
  "connect for your clients" (many independent merchants) is Third-party Partner Platform. Every
  established multi-tenant integrator (api2cart, Ginee, BigSeller, CedCommerce, Odoo) operates as
  Third-party Partner Platform.

### RECOMMENDATION (clear, HIGH confidence)

**Palka — a multi-tenant SaaS onboarding many independent shopee.co.id sellers under ONE partner app
— MUST register/convert to the "Third-party Partner Platform (Enterprise 3rd Party) / ISV" type. The
current "Seller / In-house system" registration is the WRONG category and a real scaling risk.**

- The Seller type is the wrong policy lane (own shops), risks **narrower module entitlements** than
  ISV, and risks **de-authorization at audit / IP-reconfirmation review** when Shopee sees many
  unrelated shops on a Seller app.
- Because **the type is non-changeable after submission**, the owner most likely must **re-register a
  new partner app** (new `partner_id`/`partner_key`) as Third-party Partner Platform — OR escalate via
  a Shopee ID support ticket / Business Development / Key Account Manager to convert. **Confirm which
  is possible with Shopee ID directly.**
- The existing creds may technically sign requests and complete some sandbox OAuth flows — fine for
  **sandbox / own-shop testing**, but **do not build production multi-tenant onboarding on the
  in-house registration.**

**Two items to confirm with Shopee ID:** (a) whether a hard shop-count/module cap further restricts a
Seller app; (b) Indonesia eligibility — TH gates Seller-type API access to **Mall / KAM-managed
sellers**; shopee.co.id may do the same, which would affect onboarding many small ID sellers.

---

## 2. Corrected API spec (area-by-area, with scaffold verdicts)

Scaffold files: `packages/marketplace-providers/src/shopee/{sign,oauth,client,listings,stock-payload,types}.ts`;
`apps/web/src/modules/marketplace/{services/shopee-oauth.service.ts, adapters/shopee-import-adapter.ts}`;
`packages/queue/src/marketplace-sync/providers/shopee-stock-provider.ts`; `packages/config/src/limits.ts`.

### 2.1 Auth / signature / token — **scaffold is fully CORRECT here**

| Item              | Real spec                                                                                                       | Verdict                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Hosts             | live `partner.shopeemobile.com`; sandbox `partner.test-stable.shopeemobile.com`                                 | CONFIRMED                                      |
| Signature         | lowercase-hex `HMAC-SHA256(partner_key, base)`; base = ordered concat, no separator, body excluded              | CONFIRMED (`sign.ts`)                          |
| Public base       | `partner_id + api_path + timestamp`                                                                             | CONFIRMED                                      |
| Shop base         | `+ access_token + shop_id`                                                                                      | CONFIRMED                                      |
| Merchant base     | `+ access_token + merchant_id` (replaces shop_id, never both)                                                   | CONFIRMED (see §2.5 note)                      |
| `api_path`        | URL pathname only, no query                                                                                     | CONFIRMED                                      |
| timestamp         | UNIX **seconds**, **5-min** validity window — keep clocks NTP-synced                                            | CONFIRMED                                      |
| Auth URL          | `GET {host}/api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect=<cb>`; Shopee appends `?code=&shop_id=` | CONFIRMED                                      |
| Token exchange    | `POST /api/v2/auth/token/get {code, shop_id, partner_id}` (public-scoped sign)                                  | CONFIRMED                                      |
| Token refresh     | `POST /api/v2/auth/access_token/get {refresh_token, shop_id, partner_id}` (public-scoped)                       | CONFIRMED                                      |
| Token fields      | `access_token`/`refresh_token`/`expire_in` at **TOP LEVEL** of JSON                                             | CONFIRMED (reads `response.raw`)               |
| access_token TTL  | ~4h (`expire_in` = 14400)                                                                                       | CONFIRMED                                      |
| refresh_token TTL | ~30 days; **refresh ROTATES the refresh_token** — persist it every refresh                                      | CONFIRMED (`applyRefreshedTokens` persists it) |
| Success sentinel  | `error === ''` = success; payload under `response`; auth endpoints are the top-level exception                  | CONFIRMED                                      |
| Connection probe  | `GET /api/v2/shop/get_shop_info` (shop-scoped)                                                                  | CONFIRMED                                      |

### 2.2 Listing import

| Item                 | Real spec                                                                                                                           | Verdict                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Step 1               | `GET /api/v2/product/get_item_list` → `{ item[], total_count, has_next_page, next_offset }`                                         | CONFIRMED                                                                                                                                                                                  |
| **page_size**        | **Max = 100** (SDK: "between 1 and 100")                                                                                            | **WRONG** — scaffold hard-codes `PAGE_SIZE = 50` with a "100 → E019" note. **That 50/E019 rule is LAZADA's, mis-carried to Shopee.** Raise to 100 (halves list calls + saves daily quota). |
| **item_status enum** | `NORMAL \| BANNED \| UNLIST \| REVIEWING \| SELLER_DELETE \| SHOPEE_DELETE` (no "DELETED")                                          | **WRONG/loose** — typed as `string`; use the real enum, keep import filter `[NORMAL]`.                                                                                                     |
| Step 2               | `GET /api/v2/product/get_item_base_info` — `item_id_list` **max 50**                                                                | CONFIRMED (`ID_BATCH = 50`)                                                                                                                                                                |
| Step 3               | `GET /api/v2/product/get_model_list` → `tier_variation` + `model[]` with `model_id/model_sku/model_status/tier_index/stock_info_v2` | CONFIRMED                                                                                                                                                                                  |
| `stock_info_v2`      | correct field (not legacy `stock_info`), at item AND model level                                                                    | CONFIRMED                                                                                                                                                                                  |
| `location_id`        | **STRING**                                                                                                                          | CONFIRMED                                                                                                                                                                                  |

### 2.3 Stock write (`update_stock`)

| Item                                                       | Real spec                                                                                                                                  | Verdict                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint/body                                              | `POST /api/v2/product/update_stock`, ABSOLUTE set, `{ item_id, stock_list:[{ model_id, seller_stock:[{ location_id?, stock }] }] }`        | CONFIRMED                                                                                                                                                                                         |
| `stock_list` length                                        | 1..50                                                                                                                                      | OK (sends 1)                                                                                                                                                                                      |
| `model_id: 0` for no-variation                             | confirmed                                                                                                                                  | CONFIRMED                                                                                                                                                                                         |
| `seller_stock` supersedes `normal_stock`                   | confirmed                                                                                                                                  | CONFIRMED                                                                                                                                                                                         |
| **Response handling**                                      | returns `{ success_list, failure_list:[{ model_id, failed_reason }] }` — **per-model failure can occur even when envelope `error === ''`** | **WRONG/incomplete** — `updateStock` only checks `isShopeeSuccess`, then returns `success:true`. **Must inspect `failure_list`** or a rejected model is silently treated as synced → false drift. |
| Batch across items                                         | NOT possible — one `item_id` per call; CAN batch multiple `model_id` under one item                                                        | lever, see §3                                                                                                                                                                                     |
| Multi-location non-destructive (omit location → untouched) | **UNVERIFIED** — SDK confirms it writes only the `seller_stock` bucket, but doesn't document omit-semantics                                | UNVERIFIED — moot for single-location ID sellers; **validate on a multi-location shop before relying on it**                                                                                      |

### 2.4 Order pull — **adapter does NOT exist yet (stub); scaffold guesses were wrong**

| Item                | Real spec                                                                                                                                                                                                                                                           | Verdict                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Identifier          | `order_sn` — a **STRING**, NOT a numeric order_id                                                                                                                                                                                                                   | scaffold guess WRONG — store `order_sn` in `Order.externalOrderId`                                        |
| List                | `GET /api/v2/order/get_order_list`; `time_range_field` (`create_time\|update_time`), `time_from`/`time_to` (UNIX sec, span **≤ 15 days** else `order.order_list_invalid_time`), `page_size ≤ 100`, **CURSOR** pagination (`cursor` in → `next_cursor` + `more` out) | backfill MUST chunk into ≤15-day windows; cursor not offset; use `update_time` for the incremental cursor |
| Status enum         | `UNPAID, READY_TO_SHIP, PROCESSED, SHIPPED, COMPLETED, IN_CANCEL, CANCELLED, INVOICE_PENDING`                                                                                                                                                                       | scaffold missed **`IN_CANCEL`** + `INVOICE_PENDING`                                                       |
| Detail              | `GET /api/v2/order/get_order_detail`; `order_sn_list` **max 50**, `response_optional_fields` allowlist (`item_list`, `recipient_address`, `total_amount`, `package_list`, `pay_time`, …)                                                                            | list is thin → detail call mandatory                                                                      |
| item_list fields    | `item_id, model_id, item_sku, model_sku, model_quantity_purchased` (qty), `model_discounted_price` (paid unit)                                                                                                                                                      | map `model_sku`/`item_sku` to `resolveOrderItem`                                                          |
| **Tracking number** | from the **LOGISTICS** module: `GET /api/v2/logistics/get_tracking_number` (param `order_sn`) → `tracking_number`; resolves **post-ship only**. Full history = `GET /api/v2/logistics/get_tracking_info`                                                            | this is the `trackingNumber` join key to packing videos — call per shipped order                          |

### 2.5 Shop / merchant model + push/webhook + auth expiry

| Item                          | Real spec                                                                                                                                                                                                                                                   | Verdict                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| shop_id vs merchant_id        | shop_id = one storefront; merchant_id = a CB/Mall account owning many shops (signs with merchant_id)                                                                                                                                                        | most shopee.co.id LOCAL sellers are shop-scoped — keep shop-scope default                                      |
| Merchant endpoints            | `GET /api/v2/merchant/get_merchant_info`, `GET /api/v2/merchant/get_shop_list_by_merchant`                                                                                                                                                                  | only for CB/Mall onboarding (deferrable)                                                                       |
| Enumerate authorized shops    | `GET /api/v2/public/get_shops_by_partner` (public-scoped, no token)                                                                                                                                                                                         | useful to reconcile a partner app's shops                                                                      |
| **Shop authorization expiry** | valid **365 days** then re-auth                                                                                                                                                                                                                             | **scaffold MISSING** — add re-auth handling                                                                    |
| **Push / webhook**            | `POST /api/v2/push/set_app_push_config` (one HTTPS callback per APP; `set_push_config_on[]`, `blocked_shop_id_list ≤ 500`). Codes incl. 3 order-status, 4 TrackingNo, 2 deauth, 12 auth-expiry, 8 reserved-stock. Body `{ shop_id, code, timestamp, data }` | NOT built — **this is the scale answer for orders** (§3)                                                       |
| **Push signature**            | community consensus: `HMAC-SHA256(partner_key, callbackURL + '\|' + rawBody)` vs the `Authorization` header (timing-safe). Some SDKs diverge (body-only, `x-shopee-signature`)                                                                              | **UNVERIFIED / highest-impact webhook unknown** — confirm exact base string + header against the live Push doc |

> **Merchant base note:** `buildShopeeSignBase` appends `shopId` unconditionally; for a true
> merchant-scoped call you'd pass `merchant_id` through the `shopId` field — produces the right base,
> but the query param name must be `merchant_id`, and `client.ts` always sets `shop_id`. Not a bug
> today (no merchant calls exist); parameterize the id name when adding merchant support.

---

## 3. Rate limits & multi-tenant optimization

### Real limit model (CONFIRMED at the error-code level; numbers UNVERIFIED)

Shopee v2 throttling is **TIERED**, not a single bucket. Verbatim error codes (SDK schemas mirroring
the portal):

- **Per-shop QPS** — `ads.rate_limit.exceed_shop_api`.
- **Per-app/partner QPS** — `ads.rate_limit.exceed_partner_api` ("please reduce the request rate").
- **Per-API QPS** — `ads.rate_limit.exceed_api`.
- **Generic gateway QPS** — `error_rate_limit` ("Too many requests. You have reached the rate limit.").
- **Per-APP DAILY call quota** — `error_limit` ("...reached the daily API call limit, please try again
  after 00:00 (UTC+08:00)") — **resets at midnight UTC+8, app-wide.**
- Legacy v1: ~1000 req/min per partner → 1-hour ban (historical, not the live v2 number).

**No HTTP 429, no Retry-After.** Throttling arrives as HTTP 200 with a non-empty envelope `error`
string → the client must pattern-match the error string and self-pace. **No authoritative evidence the
rate-limit TIER differs by app type** — what varies by type is module access, not a published QPS
table; console quotas can be raised via a Shopee BD/KAM. **Exact numbers are not public — read the
real per-app quota from the console.**

### The binding constraint for a multi-tenant SaaS is the SHARED per-APP QPS + per-APP DAILY quota

Per-shop limits scale with shop count; the per-app ceiling and the daily quota are fixed shared
resources every tenant competes for. **Order polling across many shops is what exhausts the daily
`error_limit`.**

### Recommended `MARKETPLACE_RATE_LIMITS.SHOPEE`

Current `{ perShopQps: 8, perAppQps: 30, burst: 16 }` (copied from Lazada, unverified) → recommend:

```ts
SHOPEE: { perShopQps: 6, perAppQps: 18, burst: 10 },
```

Keep per-shop conservative (5–8); **lower `perAppQps` from 30 to ~15–20** — 30 is likely too high
(esp. for an in-house-tier app) and risks `exceed_partner_api`. All three are tunable placeholders
until read from the console for this `partner_id`. The limiter's hard-coded fallback
(`{ perShopQps: 5, perAppQps: 20, burst: 10 }`) is already sane.

### Gaps in the current limiter for Shopee

1. **Missing per-APP DAILY quota guard.** The two-tier per-shop + per-app token bucket
   (`provider-rate-limit-redis.ts`) maps onto `exceed_shop_api` + `exceed_partner_api`, but neither it
   nor Lazada models a daily cap. **Add a third guard: a Redis day-counter keyed to UTC+8 midnight**
   for `error_limit`; on hit, pause that app until next UTC+8 midnight.
2. **Wrong throttle sentinel.** The 901-style penalty is Lazada's. The Shopee provider's
   `mapShopeeError` regex catches `error_rate_limit`/`error_busy` as retryable (good) but does NOT
   special-case `error_limit` (daily → long backoff to next UTC+8 midnight) nor `exceed_partner_api`
   (pause the whole app, not just retry). Map each code to its tier.

### Optimization levers (priority order)

1. **Replace order polling with push/webhook** (codes 3 order-status + 4 tracking + 2 deauth + 12
   auth-expiry). Single biggest daily-quota saver; keep pull as backfill/reconcile only.
2. **Raise `get_item_list` page_size to 100** (halves list calls).
3. **Coalesce AUTO stock pushes** per `(org, variant)` — already designed; keep.
4. **Batch `update_stock` across MODELS of the same item** (multiple `model_id` in one call). Cannot
   batch across items.
5. **Async paged import as a BullMQ job**, paced via `acquireProviderToken('shopee', shopId)` — like
   the Lazada `import-engine.ts`.

---

## 4. What to build / change in Palka (prioritized checklist)

> **STATUS — sandbox wiring + order-validation session 2026-06-30 → 07-01** (branch
> `session/2026-06-30-shopee-sandbox-wiring`, ~19 commits, gates green; listing wiring live-validated on shop
> 227699564, order pull live-validated on real orders on shop 227701833). [x] = shipped, [ ] = deferred.

**DONE — correctness:**

- [x] **`shopee-stock-provider.ts` `failure_list` check** — a per-model rejection (empty envelope ≠ success)
      now throws; classified MAPPING_INVALID when the listing/model is gone (`model_id mandatory`).
- [x] **No-variation stock from item-level `stock_info_v2`** (`listings.ts`) — was hardcoded 0; verified live.
- [x] **`listings.ts` PAGE_SIZE 50→100** (live-confirmed accepted) + real `item_status` enum.
- [x] **Auto-pause an invalid/gone mapping** (syncEnabled off + NEEDS_REVIEW + reason) instead of failing
      forever; UI badge + "Putuskan kaitan" on the listings + drift tables (generic tooltip, no raw error).

**DONE — rate limits / token:**

- [x] **`limits.ts` `SHOPEE` → `{ 6, 18, 10 }`** + tiered throttle/auth classifiers in `shopee/throttle.ts`.
- [x] **Unified token refresh-on-auth-failure** (proactive + reactive) across sync + import + drift (web +
      daily job) + order pull — shared `marketplace-sync/token-access.ts` + web `connection-token.service.ts`;
      added `isAuthLazadaError`. Self-heals a stored expiry that overstates the real token life (Shopee).

**DONE — import + orders:**

- [x] **Async import (BullMQ)** — generalized provider-agnostic `import-engine.ts` (`NormalizedImportListing` + `ImportPager`) + paged `fetchShopeeListingsPage` (beforeCall-paced); job service routes Shopee→async
      when creds set (stub stays inline).
- [x] **Real order pull** — `shopee/orders.ts fetchShopeeOrders` (cursor + ≤14d windows → get_order_detail ≤50
      → logistics get_tracking_number) + `ShopeeOrderAdapter`; `order_sn` STRING; conservative status map.
- [x] **Connect-by-code route** `POST /api/v1/marketplaces/shopee/connect-code` for the sandbox console flow.

**DONE — order pull LIVE-VALIDATED on real orders (2026-07-01):**

- [x] **Created real sandbox orders + ran the REAL `fetchShopeeOrders` against them** — 8 orders across
      READY_TO_SHIP / PROCESSED / CANCELLED, multi-item + qty variety, parsed correctly (order_sn string,
      lines, amounts, buyer, tracking-only-for-PROCESSED via logistics get_tracking_number). Order creation
      recipe: buyer checkout on **`uat.shopee.co.id`** (not test-stable) via Playwright → COD → Place Order;
      seller `ship_order` (get_shipping_parameter → pickup) → PROCESSED. Full detail in the memory + `docs/roadmap`.
- [x] **⭐ Confirmed `get_order_detail` returns `model_id: 0` for a no-variation item** — so the order's
      `(item_id, "0")` matches the listing import's stored `(item_id, "0")` on the PRIMARY byListing key (the
      SKU fallback is defense-in-depth, not load-bearing). Removes the last mapping uncertainty.
- [x] **Order-item photo + storefront link on the order detail** — Shopee `item_list[].image_info.image_url` + a built `shopee.co.id/product/{shop_id}/{item_id}` link, via `extractOrderItemMedia` (Shopee branch,
      keyed by item_id) + `getOrder` (shopId + externalProductId fallback). UI already renders it.
- [ ] **SHIPPED / COMPLETED live-validation** — NOT reachable in this sandbox (no seller-dashboard action /
      console/partner API to simulate courier pickup → SHIPPED or delivery+buyer-confirm → COMPLETED; owner
      verified). Order stays PROCESSED / `LOGISTICS_REQUEST_CREATED`. Both statuses' normalization is unit-tested;
      live-verify on the first production order.

**DEFERRED:**

- [ ] **Register the partner app as Third-party Partner Platform (ISV)** — owner, non-code (10–12d audit,
      type is PERMANENT). Treat current creds as sandbox/own-shop only until then.
- [ ] **Per-APP daily-quota guard** (Redis day-key, UTC+8) for `error_limit` — currently classified
      transient (retries) but not paused to next midnight; + special-case `exceed_partner_api` (app-wide pause).
- [ ] **Push/webhook** (`set_app_push_config`, codes 3/4/2/12) — the real order-scale lever; confirm the push
      signature (`url|rawBody` vs body-only) live first.
- [ ] **365-day auth-expiry handling** (push code 12 + deauth code 2 → mark connection stale).
- [ ] **GO-LIVE API host** — confirm with Shopee (likely regional `openplatform.*`, not partner.shopeemobile.com);
      revisit `DEFAULT_BASE_URL` constants.

**Already CORRECT (no work):** `sign.ts`; `oauth.ts` / `shopee-oauth.service.ts`; `client.ts` envelope +
`isShopeeSuccess`; `stock-payload.ts` (`model_id:0` / `seller_stock`; multi-location omit semantics still
UNVERIFIED); `get_shop_info` probe; the two-tier Redis token bucket (still owes the daily-quota third tier).

---

## 5. Open risks & sandbox validation checklist

Once sandbox creds are in (host `partner.test-stable.shopeemobile.com`; Console → Tools → Test Shop →
Create Test Shop, **LOCAL** type, area Indonesia; login OTP `123456`; Dummy payment channel):

1. **App-type / governance (HIGHEST):** read this app's **App Category** + the **"Developer Types and
   APP Types" module matrix** in the live console — confirm whether the Seller/in-house app is denied
   any product/order/logistics/push modules an ISV gets. Ask Shopee ID BD/KAM: (a) can a Seller app
   legitimately onboard many unrelated sellers; (b) is conversion to Third-party Partner Platform
   possible or is re-registration required; (c) does shopee.co.id gate Seller-type API to Mall/KAM
   sellers.
2. **Signature smoke test:** call `get_shop_info`; a wrong sign returns `error_sign` — validates
   `sign.ts` base-string ordering + lowercase hex end-to-end.
3. **Token lifecycle:** `token/get` then `access_token/get`; confirm `expire_in ≈ 14400`, tokens
   top-level, and refresh returns a **new `refresh_token`** (old one stops working / 30-day window
   resets).
4. **Listing import limits:** confirm `get_item_list page_size=100` accepted for shopee.co.id (drop the
   50/E019 guard only after this). Confirm `get_item_base_info` rejects >50 ids.
5. **Stock write — `failure_list` + multi-location (LOAD-BEARING):** push `update_stock` with a bad
   `model_id` → confirm it lands in `failure_list` with `error === ''` (proves the per-model check is
   needed). On a multi-location test shop, write only one `location_id` and confirm the OTHERS are
   **untouched** vs reset — validates the core no-zero invariant.
6. **Order pull:** place a test order; confirm `order_sn` is a string, `get_order_list` uses
   `cursor`/`more`, the ≤15-day window error fires past 15 days, `get_order_detail` accepts ≤50
   `order_sn`. After "Arrange Shipment" (sandbox auto-advances to SHIPPED ~10 min) confirm
   `get_tracking_number` returns `tracking_number`, and at which status it first resolves.
7. **Rate limits:** hammer one shop → `error_rate_limit`/`exceed_shop_api`; hammer across shops →
   `exceed_partner_api`; read the **per-app daily quota number** from the console (and whether it
   scales with authorized-shop count). Confirm no HTTP 429 (envelope-only).
8. **Push/webhook:** register `set_app_push_config` with an HTTPS endpoint; trigger an order, confirm
   code 3/4 deliveries; **reverse-engineer the exact push signature base** (`url|rawBody` vs body-only)
   and which header carries it (`Authorization` vs `x-shopee-signature`).
9. **Auth expiry / VPS egress IP:** confirm whether the ISV app needs the VPS egress IP whitelisted +
   the IP re-confirmation cycle.

**Top unverified risks:** (a) per-type module matrix; (b) Seller-app multi-tenant legitimacy +
conversion path; (c) `update_stock` omit-location non-destructiveness; (d) push signature convention;
(e) exact rate-limit numbers + whether daily quota scales with shop count; (f) IDN managed-seller
eligibility gate.

---

## 6. Sources

- **Shopee TH Open API Developer Guide v2.1 (2022-07-22)** — official Shopee PDF (account types, audit,
  365-day auth, sandbox):
  `https://deo.shopeemobile.com/shopee/cms_cdn_bucket/ecb708f5284142ceb68be4a84f6cf5a4_TH_SEH_Open%20API_Developer%20Guide_v2.1_20220722.pdf`
- **congminh1254/shopee-sdk** (TS schemas mirror open.shopee.com 1:1): `https://github.com/congminh1254/shopee-sdk`
  — product/order/logistics/push/merchant managers + schemas, ads rate-limit codes, `signature.ts`/`fetch.ts`
- **QuoVadis86/shopee-sdk** (Go, 380+ endpoints, `sign.go`): `https://github.com/QuoVadis86/shopee-sdk`
- **mu-hanz/shoapi** (Laravel; token TTLs 4h/30d): `https://github.com/mu-hanz/shoapi`
- **InlineX integration guide** (signature base, timestamp seconds): `https://developer.inlinex.com.sg/blog/shopee-api-integration-guide-sellers`
- **Wendee walkthrough** (auth link 5-min, callback code+shop_id): `https://wendeehsu.medium.com/shopee-openapi-handsup-e0daca280f75`
- **Smartship in-house setup** (App Category field, no auto-auth): `https://qxguide.oopy.io/a9e02433-98c3-48bd-ae7b-e645de5987c6`
- **api2cart Shopee** (ISV multi-seller path): `https://api2cart.com/api-technology/shopee-api/`
- **teacat/shopeego** (legacy v1 "1000/min → 1h ban"): `https://github.com/teacat/shopeego/blob/master/shopeego.go`
- **rollout webhook guide** (push verification — diverging convention, verify): `https://rollout.com/integration-guides/shopee/quick-guide-to-implementing-webhooks-in-shopee`
- Official portal (JS-rendered, not fetchable; confirm here before shipping): `https://open.shopee.com/documents`
