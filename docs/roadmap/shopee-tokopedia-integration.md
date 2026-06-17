# Shopee + Tokopedia integration — design & sandbox-first onboarding

> Status: **Design / not started** (Lazada is the only live adapter; SHOPEE/TOKOPEDIA are stubs).
> Goal: design both real adapters to **drop into the existing two-adapter contract** with the
> least possible change, and onboard on **sandbox first** so going to full production is mostly an
> env + approval flip — not a rewrite.
> Context: `.cursor/rules/40-inventory-marketplace.mdc` (Lazada section) + the Lazada template under
> `packages/marketplace-providers/src/lazada/`. Provider enum + the new-provider checklist are below.
> Memory: [olshop-lazada-integration], [olshop-deploy-plan] (VPS — the worker now runs, so token
> refresh + drift crons are real, unlike Vercel).

---

## 0. Headline decisions (read these first)

1. **Tokopedia is no longer a standalone API.** `developer.tokopedia.com` (the legacy Tokopedia
   Seller/Open API) has been **terminated and 301-redirects to TikTok Shop Partner Center**. In
   Indonesia, integrating "Tokopedia" now means integrating the **TikTok Shop Open API
   (version `202309`), "Tokopedia & Shop"** — one app authorization covers the seller's Tokopedia
   _and_ TikTok Shop storefront. So our `TOKOPEDIA` enum value will be implemented against the
   TikTok Shop Open API. (Bonus: the same adapter can later light up a TikTok Shop channel.)
2. **Shopee stays standalone** — Shopee Open Platform (`partner.shopeemobile.com`), its own
   HMAC-SHA256 signature, its own sandbox host (`partner.test-stable.shopeemobile.com`).
3. **The schema barely changes.** The data model is already provider-agnostic: tokens, warehouse
   sync, mapping, drift, sync-jobs all reuse as-is. The only _required_ schema change is **nothing**
   (the enum already has `SHOPEE` and `TOKOPEDIA`). The genuinely new code is **two adapter classes +
   one shared low-level client per provider + one OAuth service + two routes per provider.**
4. **One real architectural addition is forced by Shopee:** Shopee's `access_token` lives only
   **4 hours**. The current token-refresh cron runs **once daily** — fine for Lazada (30-day token),
   useless for Shopee. We must add **lazy refresh-before-use** in the sync engine (see §7). This is
   the single change worth designing _now_ so we don't rework the sync loop later.
5. **Sandbox-first, env-as-switch.** Put every host + credential behind env vars (Lazada already
   does this with `LAZADA_API_BASE_URL`). Then sandbox → production is: swap the base-URL env +
   real app credentials + flip the provider's app from "test" to "live". No code edit.

---

## 1. The marketplace landscape (verified 2026-06)

|                     | **Lazada (live today)**              | **Shopee (to build)**                                     | **Tokopedia (to build)**                                   |
| ------------------- | ------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| Platform            | Lazada Open Platform                 | Shopee Open Platform                                      | **TikTok Shop Open API** ("Tokopedia & Shop", ID)          |
| Console             | open.lazada.com                      | open.shopee.com                                           | partner.tiktokshop.com / partner.tokopedia.com             |
| Live API host       | `api.lazada.co.id/rest`              | `partner.shopeemobile.com`                                | `open-api.tiktokglobalshop.com`                            |
| Sandbox host        | (uses live)                          | `partner.test-stable.shopeemobile.com`                    | Partner Center **sandbox / test shop**                     |
| Credentials         | app_key / app_secret                 | **partner_id / partner_key**                              | **app_key / app_secret** (+ `service_id`)                  |
| Auth model          | OAuth (per seller)                   | OAuth (per shop)                                          | OAuth (per seller / authorized_code)                       |
| `access_token` TTL  | ~30 days                             | **4 hours** ⚠                                             | ~hours–days (refresh required)                             |
| `refresh_token` TTL | ~180 days                            | ~30 days                                                  | longer than access (verify in console)                     |
| Signature           | HMAC-SHA256, `apiPath + sorted(k+v)` | HMAC-SHA256, `partner_id + path + ts [+ token + shop_id]` | HMAC-SHA256, `secret + path + sorted(k+v) + body + secret` |
| Stock write         | XML, absolute                        | **JSON, absolute**                                        | **JSON, absolute**                                         |
| Stock granularity   | item + sku                           | item_id + **model_id**                                    | product_id + **sku_id**                                    |
| Multi-warehouse     | `WarehouseCode`                      | `seller_stock[].location_id`                              | `inventory[].warehouse_id`                                 |

Take-away: all three are **OAuth + HMAC-SHA256 + absolute-set stock writes with a per-warehouse
option** — exactly the shape the codebase already models. The differences (signature base string,
JSON-vs-XML payload, id field names, token TTL) are **per-provider files**, not architecture.

> ⚠ Exact endpoint paths below are from the public docs + the version tags Shopee/TikTok publish
> (`/api/v2/...`, `.../202309/...`). The TikTok Partner Center pages are JS-rendered and could not be
> machine-fetched — **confirm every path against the live console docs while building the adapter.**
> The architecture does not depend on the exact strings; only the per-provider client files do.

---

## 2. The contract a new provider must satisfy (from the codebase)

Falka has **two independent adapter abstractions** plus an **OAuth lifecycle service** (the OAuth
part is _not_ in either interface). Lazada is the template for all of it.

### (A) Worker stock adapter — `MarketplaceStockProviderAdapter`

`packages/queue/src/marketplace-sync/stock-provider.registry.ts`:

```ts
export interface MarketplaceStockProviderAdapter {
  readonly provider: MarketplaceProvider;
  updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse>;
  validateStockSync(accessToken: string): Promise<{ ready: boolean; reason?: string }>;
  fetchListings(params: { accessToken: string }): Promise<ProviderListingSnapshot[] | null>;
  fetchListingsForItems?(params: {
    accessToken: string;
    externalProductIds: string[];
  }): Promise<ProviderListingSnapshot[] | null>;
}
// NormalizedStockUpdateRequest = { externalProductId, externalVariantId, externalSku|null,
//   quantity (already clamped, ABSOLUTE), syncWarehouseCode|null } & { accessToken }
// NormalizedStockUpdateResponse = { success, externalStock|null, raw }
// ProviderListingSnapshot = { externalProductId, externalVariantId, stock, warehouses?[] }
```

- `quantity` is the new absolute sellable — push it as a **set**, never a delta.
- `fetchListings` returning `null` ⇒ "can't enumerate" ⇒ drift job skips (no false drift). A real
  adapter returns an array.
- Throw `MarketplaceSyncError` with the right `retryable` flag (`sync-errors.ts`:
  `SYNC_FAILED / RATE_LIMITED / INVALID_TOKEN / MAPPING_INVALID / PROVIDER_UNAVAILABLE /
ACCOUNT_DISABLED`). Caller/business errors = `retryable: false`; transient = `true`.

### (B) Web import adapter — `MarketplaceImportAdapter`

`apps/web/src/modules/marketplace/adapters/import-adapter.ts`:

```ts
export interface MarketplaceImportAdapter {
  readonly provider: MarketplaceProvider;
  fetchListings(params: { shopId: string; accessToken: string }): Promise<NormalizedListing[]>;
  fetchListingsForItems?(params: {
    accessToken: string;
    externalProductIds: string[];
  }): Promise<NormalizedListing[]>;
}
// NormalizedListing = { externalProductId, externalVariantId, externalSku|null,
//   externalProductName, externalVariantName|null, stock, warehouses?[], status, raw }
```

Both adapters should **delegate parsing to one shared fetcher** in `@falka/marketplace-providers`
(Lazada does: `fetchLazadaListings` / `fetchLazadaItemsStock` are single-sourced and reused by both
the worker stock provider and the web import adapter).

### (C) OAuth lifecycle (not in either interface)

`apps/web/src/modules/marketplace/services/lazada-oauth.service.ts`: `buildAuthorizeUrl`,
`handleCallback`, `refreshConnection`, `testConnection`. Low-level `exchange*Code` / `refresh*Token`
live in `@falka/marketplace-providers`. Reuse `encodeOAuthState`/`decodeOAuthState`
(`utils/oauth-state.ts`, sealed with `MARKETPLACE_ENCRYPTION_SECRET`, 15-min TTL) verbatim.

### What is already generic (no per-provider work)

- **Schema**: `MarketplaceConnection.encryptedAccessToken/encryptedRefreshToken/tokenExpiresAt`,
  `syncWarehouseCode` + `knownWarehouseCodes`, `MarketplaceProduct`, `MarketplaceProductMapping`
  (`syncEnabled`, `mappingStatus`), `MarketplaceSyncJob`, `Order` — all provider-agnostic. Tokens
  encrypted AES-256-GCM via `MARKETPLACE_ENCRYPTION_SECRET`.
- **Queue fan-out + coalescing + drift engine + all per-connection routes** (`[id]/test`,
  `/refresh`, `/import`, `/auto-map`, `/drift-check`, `/sync-all`, `listings/[productId]/sync|map`)
  are provider-generic. They resolve the adapter by enum and call it.
- **Enum already has the values**: `enum MarketplaceProvider { SHOPEE TOKOPEDIA LAZADA }`. **No
  schema migration needed** to add Shopee or Tokopedia behavior.

### The one job that is NOT generic

`refresh-marketplace-tokens.job.ts` + `token-repository.ts` filter `provider: 'LAZADA'` and call
`refreshLazadaToken`. Adding Shopee/Tokopedia OAuth means extending the repo filter + branching the
refresh call by provider — see §7 (and the 4-hour Shopee token forces more than this).

---

## 3. Shopee adapter design

### 3.1 Auth & signature

- **Credentials:** `partner_id` (int) + `partner_key` (secret) from the Shopee Open Platform app.
  Already have env placeholders **`SHOPEE_PARTNER_ID` / `SHOPEE_PARTNER_KEY`** in
  `packages/config/src/env.server.ts`. Add **`SHOPEE_API_BASE_URL`** (sandbox vs live switch) +
  **`SHOPEE_OAUTH_REDIRECT_URI`**.
- **Hosts:** sandbox `https://partner.test-stable.shopeemobile.com`, live
  `https://partner.shopeemobile.com` → via `SHOPEE_API_BASE_URL`.
- **Signature** (`packages/marketplace-providers/src/shopee/sign.ts`): `sign = HMAC-SHA256(partner_key,
base_string)` in **lowercase hex**, where
  - public APIs: `base_string = partner_id + api_path + timestamp`
  - shop-scoped APIs: `base_string = partner_id + api_path + timestamp + access_token + shop_id`
    Common query params on every call: `partner_id`, `timestamp` (unix seconds), `sign`, and for
    shop APIs `access_token` + `shop_id`. **Different base string from Lazada** → its own `sign.ts`.
- **Authorization round-trip** (mirror Lazada's service + 2 routes):
  1. `GET /api/v1/marketplaces/shopee/oauth/authorize` → redirect to
     `{host}/api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect={SHOPEE_OAUTH_REDIRECT_URI}`.
     **Link is valid 5 minutes** (regenerate timestamp if stale). Carry our encrypted `state` via the
     `redirect` URL query (Shopee appends `code` + `shop_id` to `redirect`).
  2. Public `GET /api/v1/marketplaces/shopee/oauth/callback?code&shop_id&state` →
     `POST /api/v2/auth/token/get { code, shop_id, partner_id }` → `{ access_token (4h),
refresh_token (30d) }` → `upsertOAuthConnection({ provider: SHOPEE, shopId: shop_id, ... })`.
  3. Refresh: `POST /api/v2/auth/access_token/get { refresh_token, shop_id, partner_id }`.

### 3.2 Stock write — `updateStock`

- Endpoint: `POST /api/v2/product/update_stock` (JSON body, **absolute set**, up to ~50 models/call).
- Identity: `externalProductId = item_id`, `externalVariantId = model_id` (0 for no-variation items),
  `externalSku` = the model's SKU. Build a `shopee/stock-payload.ts` that emits JSON
  `{ item_id, stock_list: [{ model_id, seller_stock: [{ location_id?, stock }] }] }`.
- Multi-warehouse / non-destructive: when `syncWarehouseCode` is set, write only that
  `location_id` and omit the rest (same non-destructive rule as Lazada's `WarehouseCode`); else the
  bare `stock` form.
- The worker fans out **one mapping per call** today (matches Lazada). Shopee supports batch — the
  multi-SKU optimization is the existing `docs/roadmap/sync-batching.md` Approach B, **out of scope
  here**.

### 3.3 Listings — `fetchListings` / `fetchListingsForItems`

- `GET /api/v2/product/get_item_list` (paged, `offset`/`page_size`, returns `item_id[]`) →
  `GET /api/v2/product/get_item_base_info` (names/status) → `GET /api/v2/product/get_model_list`
  (per item, returns model-level `stock` + `model_sku`). Flatten to `ProviderListingSnapshot` /
  `NormalizedListing` per model. Single-source this in `shopee/listings.ts`.
- `validateStockSync`: probe `GET /api/v2/shop/get_shop_info` (cheap, shop-scoped) → `{ ready }`.

### 3.4 Orders (inbound, later phase — reuse Order model)

- `GET /api/v2/order/get_order_list` (by `time_range_field` + status) →
  `GET /api/v2/order/get_order_detail`. Map to `Order` (provider=SHOPEE, externalOrderId, noResi from
  tracking number). Reuse the existing inbound stock lifecycle (RESERVE on PAID, etc.).
- Optional **push/webhook**: Shopee pushes order updates to a callback registered in the console.
  Not required for the MVP stock-sync loop.

### 3.5 Rate limit

~10 req/s per shop (treat conservatively). Add a Shopee bucket in
`packages/queue/src/marketplace-sync/rate-limit.ts` (e.g. 8/s, burst 10).

---

## 4. Tokopedia adapter design (= TikTok Shop Open API, `202309`)

> Keep the enum value **`TOKOPEDIA`** but implement it against the TikTok Shop Open API. The legacy
> `accounts.tokopedia.com` client-credentials flow is **dead** — do not build it.

### 4.1 Auth & signature

- **Credentials:** `app_key` + `app_secret` + a `service_id` from a **TikTok Shop Partner Center**
  app. The existing env placeholders `TOKOPEDIA_CLIENT_ID` / `TOKOPEDIA_CLIENT_SECRET` should be
  **renamed to `TOKOPEDIA_APP_KEY` / `TOKOPEDIA_APP_SECRET`** (+ add `TOKOPEDIA_API_BASE_URL`,
  `TOKOPEDIA_SERVICE_ID`, `TOKOPEDIA_OAUTH_REDIRECT_URI`). (Rename touches env + turbo.json only;
  the enum stays `TOKOPEDIA`.)
- **Host:** `https://open-api.tiktokglobalshop.com` (live). Sandbox/test shop runs inside Partner
  Center — switch via `TOKOPEDIA_API_BASE_URL`.
- **Signature** (`tokopedia/sign.ts`): `sign = HMAC-SHA256(app_secret, base_string)` hex, where
  `base_string = app_secret + path + concat(sorted excluded-keys k+v) + body + app_secret`
  (TikTok excludes `sign`/`access_token` from the sorted set). Headers: `x-tts-access-token`,
  `content-type`; query: `app_key`, `timestamp`, `sign`, `shop_cipher` (shop-scoped). **Different
  again from Lazada/Shopee** → its own file.
- **Authorization round-trip:**
  1. `GET /api/v1/marketplaces/tokopedia/oauth/authorize` → redirect to the Partner Center
     authorization URL with `service_id` + our `state` → seller consents (Tokopedia & TikTok shop).
  2. Public callback `?code&state` → exchange `auth_code` for `access_token` + `refresh_token`
     (token endpoint under the auth host, `grant_type=authorized_code`) → resolve shop via
     `GET /authorization/202309/shops` (gives `shop_id` + `shop_cipher`) → `upsertOAuthConnection`.
     Store `shop_cipher` (needed on every shop call) — put it in `shopId` or `rawPayload`/a small
     field; **decision below**.
  3. Refresh via the token refresh endpoint (`grant_type=refresh_token`).

### 4.2 Stock write — `updateStock`

- Endpoint: `POST /product/202309/products/{product_id}/inventory/update` (JSON, **absolute**).
- Identity: `externalProductId = product_id`, `externalVariantId = sku_id`, `externalSku =
seller_sku`. Payload `{ skus: [{ id: sku_id, inventory: [{ warehouse_id, quantity }] }] }`.
- Multi-warehouse: map `syncWarehouseCode → warehouse_id`, write only it (non-destructive).

### 4.3 Listings

- `POST /product/202309/products/search` (paged, `page_token`) → per-product
  `GET /product/202309/products/{id}` for SKU-level stock. Flatten per SKU. Single-source in
  `tokopedia/listings.ts`.
- `validateStockSync`: `GET /authorization/202309/shops` → `{ ready }`.

### 4.4 Orders (later phase)

- `POST /order/202309/orders/search` → `GET /order/202309/orders` detail. Webhooks for order status.

### 4.5 Rate limit

Add a Tokopedia/TikTok bucket in `rate-limit.ts` (verify TikTok's per-app QPS; start conservative).

---

## 5. "Design now so full access needs no rewrite" — the principles

1. **Every host behind an env var.** `SHOPEE_API_BASE_URL`, `TOKOPEDIA_API_BASE_URL` (Lazada already
   does this). Sandbox→prod = change the env value, restart. **No code change.**
2. **Use the SAME app where the platform allows it; isolate credentials in env where it doesn't.**
   - Shopee: the _same partner app_ works against sandbox and live (different host). Same
     partner_id/partner_key concept; you may get a separate sandbox key — both live in env.
   - TikTok Shop: typically a **separate "test app" vs "live app"** with different app_key/secret.
     Because creds are env, switching is an env swap, not code.
3. **Register production-grade redirect URIs from day one.** Use the real domain (the VPS domain /
   `palka.app` candidate), HTTPS, exact path: `/api/v1/marketplaces/shopee/oauth/callback` and
   `/api/v1/marketplaces/tokopedia/oauth/callback`. Register the **same paths** in both sandbox and
   live app configs so promotion needs no URL change. (For local dev, register an extra
   `http://localhost:3000/...` or tunnel URL in the _test_ app only.)
4. **Request ALL scopes you will ever need, upfront**, in the sandbox app: product, inventory,
   order, logistics/fulfillment, shop info, (returns). Production approval re-uses the same scope
   set; adding a scope later can mean re-review.
5. **Keep the enum + connection model as-is.** Don't invent provider-specific tables. Store the
   `shop_cipher` (TikTok) and any provider quirks in `rawPayload` or a single nullable column if
   truly needed (decision in §9).
6. **Single-source the parser.** Put the listing/stock parsing in `@falka/marketplace-providers` so
   the worker stock adapter and the web import adapter never diverge (Lazada pattern).
7. **Mirror the Lazada file layout exactly** (§8 checklist) so the diff is mechanical and reviewable.

---

## 6. Sandbox-first onboarding playbook (start here, from zero)

### 6.1 Shopee Open Platform — sandbox account & app

1. Go to **open.shopee.com** → register a **developer/partner account** (business email; you can
   register as an individual developer to start). Pick the **Indonesia** region.
2. **Profile audit:** Shopee reviews the developer profile before some capabilities unlock. Submit
   company/seller details now so production isn't blocked later. (Sandbox app creation usually
   works before full audit.)
3. **Create an App** in the console → note the **`partner_id`** and **`partner_key`**. Set the app
   **App Type / scopes** to include product + logistics + order + shop. Set the **redirect URL** to
   your production callback `https://<domain>/api/v1/marketplaces/shopee/oauth/callback` (add a
   localhost/tunnel one for dev in the test app).
4. **Switch to the Sandbox / Test environment.** The sandbox console is
   **`partner.test-stable.shopeemobile.com`**. Create or get a **test shop** there (sandbox lets you
   spin up test seller shops with test products/orders). Note the test shop's `shop_id`.
5. Put creds in env: `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`,
   `SHOPEE_API_BASE_URL=https://partner.test-stable.shopeemobile.com`,
   `SHOPEE_OAUTH_REDIRECT_URI=https://<domain>/api/v1/marketplaces/shopee/oauth/callback`.
6. **Validate the loop in sandbox:** authorize the test shop → exchange token → `get_item_list` →
   `update_stock` on a test product → read it back → confirm drift = 0.
7. **Promote to production:** finish the profile audit, flip `SHOPEE_API_BASE_URL` to
   `https://partner.shopeemobile.com`, re-authorize the real shop. Done — no code change.

### 6.2 Tokopedia — via TikTok Shop Partner Center (sandbox app & test shop)

1. The legacy `developer.tokopedia.com` is **terminated** — go to **partner.tiktokshop.com**
   (a.k.a. **partner.tokopedia.com**) and register as a **developer / ISV** (the "Tokopedia & Shop"
   ID market track). Read the **"Tokopedia & Shop" Open API Integration One Pager** + the
   **ISV & Seller developer onboarding** page first.
2. **Create an App** → choose **test/sandbox** mode → note **`app_key`**, **`app_secret`**, and the
   **`service_id`** (used in the authorization URL). Select **all scopes** (product, inventory,
   order, fulfillment, shop) upfront.
3. Set the app's **redirect URL** to
   `https://<domain>/api/v1/marketplaces/tokopedia/oauth/callback`.
4. **Create / bind a sandbox test shop** inside Partner Center (the sandbox lets you authorize a
   test shop and push test products/orders/inventory).
5. Put creds in env: `TOKOPEDIA_APP_KEY`, `TOKOPEDIA_APP_SECRET`, `TOKOPEDIA_SERVICE_ID`,
   `TOKOPEDIA_API_BASE_URL` (sandbox host), `TOKOPEDIA_OAUTH_REDIRECT_URI=...`.
6. **Validate the loop in sandbox:** authorize → `authorization/202309/shops` (get
   `shop_id`+`shop_cipher`) → `products/search` → `inventory/update` → read back → drift = 0.
7. **Promote to production:** submit the app for **App Review / go-live** in Partner Center, swap to
   the **live app credentials** + live `TOKOPEDIA_API_BASE_URL`, re-authorize the real seller.

> Both: keep a **sandbox `.env`** and a **production `.env`** side by side (the VPS 2-env setup from
> [olshop-deploy-plan] already separates these). Promotion = pick the other env file.

---

## 7. Token-refresh architecture (the one real change)

Problem: **Shopee `access_token` = 4 hours.** The daily cron (`0 5 * * *`) refreshes Lazada fine but
would leave Shopee tokens expired for ~20h/day, and `executeStockSync`'s `isAccessTokenExpired`
gate currently **fails** an expired-token sync (non-retryable) instead of refreshing.

Design (do this when wiring Shopee, not after):

1. **Lazy refresh-before-use in the sync engine.** In `executeStockSync` (and the drift job),
   before calling the adapter: if `tokenExpiresAt` is within a safety window (e.g. ≤ 10 min) **and**
   a refresh token exists, call the provider's `refreshConnection`, persist the new token, and use
   it. This makes short-TTL providers self-heal regardless of cron cadence. Encapsulate as a shared
   `ensureFreshToken(connection)` helper so all three providers use it.
2. **Generalize the refresh cron.** Extend `findConnectionsForTokenRefresh` (drop the
   `provider: 'LAZADA'` filter) and branch the refresh call by provider in
   `refresh-marketplace-tokens.job.ts`. Keep daily as the _backstop_; lazy refresh handles the hot
   path.
3. **Per-provider refresh fns** in `@falka/marketplace-providers`: `refreshShopeeToken`,
   `refreshTokopediaToken` (mirror `refreshLazadaToken`).
4. Token storage is unchanged — reuse `encryptedAccessToken`/`encryptedRefreshToken`/
   `tokenExpiresAt` + AES-256-GCM.

This is the only place the _engine_ changes; everything else is additive adapter code.

---

## 8. Per-provider file checklist (Lazada is the template)

Order matters; `<p>` = `shopee` | `tokopedia`, `<Name>` = `Shopee` | `Tokopedia`.

**Enum/registry/UI (no migration needed — enum already has both values):**

- EDIT `apps/web/src/modules/marketplace/utils/provider-display.ts` — label/description/icon.
- (Already present: `SUPPORTED_MARKETPLACE_PROVIDERS`, `MARKETPLACE_PROVIDER_REGISTRY` entries — confirm flags.)

**Env:**

- EDIT `packages/config/src/env.server.ts` — Shopee: add `SHOPEE_API_BASE_URL`,
  `SHOPEE_OAUTH_REDIRECT_URI` (already have `SHOPEE_PARTNER_ID/KEY`). Tokopedia: rename to
  `TOKOPEDIA_APP_KEY/APP_SECRET`, add `TOKOPEDIA_SERVICE_ID`, `TOKOPEDIA_API_BASE_URL`,
  `TOKOPEDIA_OAUTH_REDIRECT_URI`.
- EDIT `turbo.json` — add the new var names to `globalEnv` + `globalPassThroughEnv`.

**Shared low-level client (`packages/marketplace-providers/src/<p>/`):**

- ADD `client.ts` (signed REST client + `is<Name>Success`), `sign.ts` (per-provider base string),
  `stock-payload.ts` (JSON absolute-set + warehouse), `listings.ts`
  (`fetch<Name>Listings`/`fetch<Name>ItemsStock`), `oauth.ts` (`exchange<Name>Code`/`refresh<Name>Token`),
  `types.ts`, `index.ts` barrel; EDIT the package top-level barrel.

**Worker stock adapter:**

- ADD `packages/queue/src/marketplace-sync/providers/<p>-stock-provider.ts`
  (`class <Name>StockProvider implements MarketplaceStockProviderAdapter`).
- EDIT `register-providers.ts` — env-gated `registerMarketplaceStockProvider(new <Name>StockProvider())`.
- EDIT `rate-limit.ts` — add the provider bucket.
- EDIT `token-repository.ts` + `refresh-marketplace-tokens.job.ts` — generalize beyond LAZADA (§7).
- ADD the shared `ensureFreshToken` lazy-refresh in `sync-engine.ts` (§7).

**Web import adapter:**

- ADD `apps/web/src/modules/marketplace/adapters/<p>-import-adapter.ts`.
- EDIT `import-adapter.ts` — add the `createImportAdapter` branch.

**OAuth onboarding:**

- ADD `apps/web/src/modules/marketplace/services/<p>-oauth.service.ts` (reuse `encodeOAuthState` +
  `upsertOAuthConnection`).
- ADD `app/api/v1/marketplaces/<p>/oauth/authorize/route.ts` (withApiRoute, `marketplace.manage`).
- ADD `app/api/v1/marketplaces/<p>/oauth/callback/route.ts` (PUBLIC plain GET → tokens →
  `upsertOAuthConnection` → redirect `/dashboard/marketplace?<p>=connected|error&reason=`).

**UI wiring:**

- EDIT `add-marketplace-modal.tsx` — provider-conditional OAuth "Connect" block (per-provider authorize path).
- EDIT `marketplace-dashboard.tsx` — `?<p>=connected|error` toast reader.
- EDIT `marketplace-connection-detail.tsx` — extend the `provider === 'LAZADA'` guards on Test/Refresh.

**Gate:** `pnpm typecheck · lint · build · test`. After adding `route.ts`, run `next build` before
typecheck (typed routes); never `next build` while the dev server is up.

---

## 9. Open decisions for the owner

1. **`shop_cipher` storage (TikTok).** Reuse `shopId` to hold it, stash in `rawPayload`, or add one
   nullable column? Recommendation: a small nullable `externalShopCipher String?` on
   `MarketplaceConnection` (1 migration, clearer than overloading `shopId`). Confirm before schema
   change (HARD CONSTRAINT #1).
2. **Build order.** Recommendation: **Shopee first** (cleaner standalone API, biggest ID
   marketplace, forces the lazy-refresh design once), then **Tokopedia/TikTok** (more onboarding
   friction, but reuses the now-generic refresh + the same adapter skeleton).
3. **Scope of phase 1.** Stock-sync outbound + listing import + drift only (mirror Lazada), defer
   inbound orders + webhooks to a phase 2 — agreed?
4. **TikTok Shop as its own channel later?** Since one Tokopedia authorization already covers the
   TikTok storefront, decide whether to surface it as a separate `TIKTOK` connection or keep it
   folded into `TOKOPEDIA`. (Folded is simplest for ID sellers.)
5. **Env rename for Tokopedia** (`CLIENT_ID/SECRET` → `APP_KEY/SECRET`) — confirm (it touches
   `env.server.ts` + `turbo.json`, both HARD-ish env constraints).
