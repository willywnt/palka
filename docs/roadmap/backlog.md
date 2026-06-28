# Palka — Product Backlog

> Companion to [`inventory-mvp.md`](./inventory-mvp.md). The MVP loop (inventory SoT · multi-channel
> orders · POS · purchasing · packing-video evidence · finance foundation) is shipped. This file tracks
> what's **not yet built**, prioritized, with effort + gating so the next pick is a quick decision.
>
> Legend — **Effort**: S (<½ day) · M (1 session) · L (multi-session) · XL (epic). **Gate**: 🟢 none ·
> 🟡 needs a schema migration (HARD CONSTRAINT #1 — confirm first) · 🔴 external dependency (partner /
> API key / WhatsApp approval / strategic decision).

## ✅ Shipped (2026-06-07, on `main`)

Correctness pack (orders/returns pagination, marketplace token-expiry guard, returns-netting in the
profit report) · inventory-valuation report · share-evidence on order/return dispute panels · manual
order actions (mark-shipped / edit resi / cancel-with-reason) · DAMAGE write-off. Detail in
`inventory-mvp.md` (§13 hardening bullet) + `CLAUDE.md §12`.

## ✅ Shipped (2026-06-11)

- **UI/UX redesign "Suar Dermaga"** (on `main`) — full-brand evolution of the Ombak ledger system:
  sea-glass horizon wash, navy "hull" sidebar, suar attention tokens, `BrandMark` + favicon/og/manifest,
  branded error/404 routes, `StatusBadge`/`ErrorState` primitives, mobile bottom tab bar + card-list
  pattern, maritime empty-state art, and the **Pandu** assistant pattern (honest stub: deterministic
  nudges + keyword router, permanent "Pratinjau" label). Detail in `.cursor/rules/50-ui-design-system.mdc`
  - `docs/roadmap/palka-redesign.md` + memory `palka-redesign-suar-dermaga`.
- **Kasir & Pesanan pack** (on `main`) — orders list search + status filter; products list pagination;
  marketplace per-connection sync-health badges; below-cost flag at sale-create; `grup · subvarian`
  picker label; 0-quota storage display fix.
- **Discount + PPN at POS** (on `main`) — per-cart discount (% / fixed) + PPN (inclusive/exclusive);
  `Sale`/`SaleItem` net fields; shared `sale-totals` util (POS preview == server); profit report reads
  net; printable struk + CASH kembalian calculator.
- **Partial / per-item POS refund** (branch `feat/pos-partial-refund`) — `SaleRefund`/`SaleRefundItem` +
  `PARTIALLY_REFUNDED`; restock per qty; refunds net the profit report; VOID refused once a refund exists.
- **Dead-stock & ABC analysis** (branch `feat/dead-stock-abc-report`) — read-only `reporting` report at
  `/dashboard/reports/dead-stock` (two `?tab`-synced lenses). Dead-stock: in-stock variants idle past an
  idle-days threshold (real days-since-last-sale from the `SALE`/`ORDER_RESERVE` ledger, or age when never
  sold), capital valued at moving-average cost. ABC: SKUs ranked by net revenue and bucketed A/B/C by
  cumulative share (Pareto, over positive revenue so return-heavy SKUs fall to C). Pure aggregates + 9 unit
  tests; CSV export each; no schema change. Distinct from the reorder report's coarse age-proxy `DEAD` flag.
- **Stock opname / cycle count** (branch `feat/dead-stock-abc-report` → opname commits on `main`) —
  `StockOpname`/`StockOpnameItem` + `StockOpnameStatus` (DRAFT/COMPLETED/CANCELLED). A session at
  `/dashboard/inventory/opname`: scan/type or search to add a line (system qty snapshotted at add), edit the
  counted qty inline with a live variance, then **post** → each line's variance writes a `RECONCILE`/`MANUAL`
  ledger row via a new `applyReconcileTx` and corrects the Inventory cache (then propagates), or cancel.
  Posted/cancelled sessions render read-only as the variance report. **Phase 2 (shipped):** an `OPNAME`
  `PairingPurpose` + `useOpnameScanner` so a paired phone (or the manual field) **tallies +1 per scan**
  (`scanCountItem` resolves + increments atomically; `POST …/opname/:id/scan`); the search picker still
  sets counted to the system qty. Socket.IO contracts unchanged.

## ✅ Shipped (2026-06-14)

- **Organization / team RBAC foundation** (big-bet G) + the **"Palka Live" hardening** (storage-quota
  blocker, deploy boot blockers, middleware auth-gating fix, cross-tenant probe) — on `main`. See
  `org-foundation.md` + memory `olshop-palka-live`.
- **Lazada Open Platform — real OAuth multi-seller integration** (branch `session/lazada-integration`,
  13 commits, gates + `pnpm build` green, OAuth flow tested through the UI). Each org connects its own
  Lazada shop via OAuth (authorize + public callback with an encrypted `state`); token refresh +
  test-connection routes/buttons; import (`/products/get`) live-validated + auto-map; stock-push
  payload fixed to **ItemId+SkuId** (Lazada deprecated `SellerSku`); worker E501 made non-retryable.
  Signer/client/payload/token helpers live in `@palka/marketplace-providers`. **Stock-WRITE is blocked
  by a Lazada seller-eligibility/dropshipping-warehouse rule, not Palka code.** Detail + the Lazada-side
  gotchas: `.cursor/rules/40-inventory-marketplace.mdc` (Lazada OAuth section) + memory
  `olshop-lazada-integration`. **Stock-WRITE unblocked 2026-06-15** — switched to
  `/product/stock/sellable/update` (POST + XML, **absolute** `SellableQuantity`), the path
  dropshipping-warehouse sellers can call; live-validated `code:0` + read-back. (The `/adjust` sibling is a
  DELTA — not for sync.) The scheduled refresh worker also shipped (Phase 6).
  **Deferred:** multi-region per-connection gateway (needs a migration).

## ✅ Shipped (2026-06-15)

- **Phase 6 — provider-health dashboard + drift reconciliation + token auto-refresh** (mid-size #2 +
  big-bet B's scheduled-refresh tail) — on branch `session/2026-06-15-phase6-reconciliation`. **Zero DB
  migration** (drift computed on-read, health from existing fields), **observe-only** (internal stock
  stays the SoT; drift is surfaced, fixes are a manual re-push). Web: `marketplaceHealthService`
  (per-connection ok/warn/danger from token lifecycle + sync coverage + needs-review + failed pushes +
  recent sync), `marketplaceReconciliationService.checkDrift` (live pull → `computeStockDrift` →
  over/under/missing), `GET /marketplaces/health` + `/[id]/health` (marketplace.view) + `POST
/[id]/drift-check` (marketplace.manage); a "Kesehatan & drift" panel + dashboard badges + a
  `marketplaceUnhealthy` nav pulse. Worker: `reconcile-marketplace-drift` (daily, logs drift per active
  connection) + `refresh-marketplace-tokens` (daily, renews Lazada tokens nearing expiry), sharing the
  `MARKETPLACE_RECONCILE` queue. `computeStockDrift` + the drift/token data-access live in `@palka/queue`
  (web + worker share them); `fetchLazadaListings` lifted to `@palka/marketplace-providers`. Detail in
  `inventory-mvp.md` Phase 6 + `.cursor/rules/40-inventory-marketplace.mdc`. **Deferred:** a persistent
  drift audit-log + configurable alert thresholds, OAuth callbacks for the other providers.

## ✅ Shipped (2026-06-19)

- **Local dev-perf fix + dependency refresh** (branch `session/2026-06-19-dev-perf-and-deps`, 5 commits,
  all four gates green per commit) — diagnosed (26-agent workflow) that laggy page navigation came from
  the custom dev server compiling routes with **webpack, not Turbopack**. Fixes: `next({ …, turbopack: dev })`
  in `apps/web/server.ts` (Turbopack dev; gated on `dev`, Socket.IO untouched), `optimizePackageImports:
['lucide-react']`, and per-query Prisma logging gated behind `PRISMA_LOG_QUERY=1` (off by default).
  Plus an in-range `pnpm update -r` refresh + six low-risk **tooling-major** bumps (selfsigned 2→5
  [`generate()` now async, dropped `days`], dotenv 16→17 [`quiet: true`], lint-staged 15→17,
  prettier-plugin-tailwindcss 0.6→0.8, @zxing/browser 0.1→0.2, @types/node 22→26), then library majors
  **pino 9→10** (runtime smoke-verified) and **Sentry 9→10** (DSN-gated, type-validated). Detail: memory
  `olshop-dev-perf-and-deps`. **Manual QA still owed:** confirm the @zxing 0.2 scanner reader on a phone.

  **Framework-major upgrades — attempted then DEFERRED** (kept the gate green / behavior unchanged
  rather than force them; revisit each as its own session):
  - **ESLint 9→10** — 🔴 BLOCKED by ecosystem: `eslint-plugin-react` (latest 7.37.5) peers only `≤ eslint 9.7`
    and _crashes_ under ESLint 10 (used in the Next lint config). Wait for the plugin's ESLint 10 release.
  - **Zod 3→4** — L: `z.coerce`/`.default()` make input≠output, breaking RHF `useForm`/`zodResolver`
    typing across ~8 form components (+ `invalid_type_error`→`error`, `.errors`→`.issues`,
    `.flatten()`→`z.flattenError`). Mechanical-ish but behaviour-sensitive → needs form-by-form rework
    - **manual QA of every form**.
  - **TypeScript 5→6** — L: TS 6.0 changed `@types/node` auto-discovery → ~10 backend packages lose Node
    globals (need `@types/node` added + a shared node-types tsconfig) and `baseUrl` is now deprecated
    (TS5101). Low benefit over 5.9.3 (TS 6 is a transitional release toward the TS 7 native port).
  - **Prisma 6→7** — 🟡 HC#1: needs `package.json#prisma` → `prisma.config.ts`, the
    `prisma-client-js`→`prisma-client` generator migration, and **advisory-lock raw-query verification on
    a real DB** (unit tests mock Prisma). Owner deferred to a dedicated session.
  - **Next 15→16** — 🔴 HC#2: highest risk — next-auth 5 **beta** × Next 16 compatibility, custom-server
    interaction, new caching defaults (`cacheComponents`/`dynamicIO`), typedRoutes. Needs browser QA of
    both happy flows + auth + scanner. Owner deferred to a dedicated session.

## ✅ Shipped (2026-06-20)

- **Bulk product import / export (XLSX-first)** (`catalog`, branch `session/2026-06-20-product-csv-import-export`,
  no schema change) — on the Produk dashboard. Most sellers use Excel, so the format is **.xlsx** (SheetJS
  `xlsx` dep added). **Export** (ungated, like the page): "Ekspor" downloads an .xlsx of every live variant
  flattened one row per SKU (`listForExport` → `buildProductsXlsx`, capped at `PRODUCT_EXPORT_CAP`).
  **Import** (new `catalog.import` ACTION key, ADMIN-on/STAFF-off) is a wizard: a **draggable dropzone**
  (drag-drop or click, accepts .xlsx/.csv) + an "Unduh template" button (header-only .xlsx,
  `GET /products/import/template`) + a required-column legend (red `*`) → server **dry-run preview**
  (per-row Buat/Perbarui/Lewati/Error + notes, no writes) → confirm to commit. Upsert by **exact SKU**:
  unknown/blank SKU = CREATE (rows grouped by product name → add to the 1 matching live product / create a
  new one / flag ambiguous ≥2; blank SKUs auto-generate via `suggestVariantSku`); matched SKU = UPDATE
  name/group/barcode/price/cost via a new `catalogServerService.updateVariantDetails` (SKU is the match
  key, never changed). **Stock seeds NEW variants only** (`initialStock` → inventory service, reason
  RESTOCK); a stock cell on an existing SKU is reported but ignored (use Opname). The **client parses
  .xlsx** (lazy `import('xlsx')`) → CSV and POSTs JSON `{ csv, commit }` (server contract stays CSV — no
  multipart; hand-rolled RFC4180 parser + a pure, unit-tested `planProductImport`). Header/template
  validation rejects a file missing a required column ("Template tidak sesuai…"); each create-group/update
  runs on its own so one bad row never aborts the batch. Files:
  `utils/{product-csv,parse-products-csv,product-import-plan,product-xlsx}.ts`,
  `services/product-import.service.ts`, `validators/{import-products,update-variant-details}.ts`,
  `app/api/v1/products/{export,import,import/template}/route.ts`, `components/product-import-dialog.tsx`.
  4 gates green; 46 catalog vitest. **Owner manual QA owed:** a real round-trip (Ekspor → edit in Excel →
  Impor) against a live DB. **xlsx dep:** pinned to the **SheetJS CDN build `xlsx@0.20.3`**
  (`https://cdn.sheetjs.com/...tgz`) — the npm `xlsx@0.18.5` was vulnerable to CVE-2023-30533 (prototype
  pollution, ≤0.19.2) + CVE-2024-22363 (ReDoS, ≤0.20.1) and the fixes ship only on the CDN, not npm.
  **Test fixtures:** sample .xlsx files are NOT committed (regenerate via
  `node apps/web/test/fixtures/make-sample-import.mjs` and `…/make-sample-import-2000.mjs`). **Deferred:**
  bulk stock update on existing SKUs, product-level (category/description) bulk edit, recurring/streaming/
  very-large async import (worker job).
- **Import-wizard UX rework** (same branch, owner feedback) — **xlsx-only** now (CSV upload dropped). Two
  separate modals: a **compact upload modal** (`max-w-md` draggable dropzone + a centered "Unduh template"
  text **link**; required columns are now marked **in the template header itself**, e.g. `Nama Produk*`,
  so the in-dialog legend is gone) and a **separate wide editable preview modal** (`max-w-5xl`). Preview
  table mirrors the template columns **minus Barcode and the old Catatan column**: validation errors moved
  **inline per cell**, system-generated SKUs get an **"auto" badge**, an existing-SKU's stock cell is shown
  greyed/ignored, each row has **edit (prefilled inputs, live re-validation) + delete** actions, an **"Unggah
  ulang"** button overrides with a new file, and the summary badges carry **tooltips**. The plan now returns
  **per-field errors + `skuGenerated` + `resolvedSku`**; the wizard plans/re-plans edits **on the client**
  via a new `POST /products/import/resolve` (existing SKUs + product names) and only the final commit hits
  the server (authoritative). 4 gates green; 50 catalog vitest. Same owner QA owed.
- **Import scale + robustness pass** (same branch, owner feedback) — (1) **duplicate-SKU detection on the
  EFFECTIVE SKU** (typed OR generated base): any SKU resolving to the same value in >1 row is flagged
  "SKU duplikat" on every offending row (incl. two blank rows that generate the same SKU, and two rows that
  would both update the same variant — chosen ERROR over a silent last-write-wins). (2) Preview: error rows
  **sort to the top** + a **Switch** "Hanya error" filter; columns have **fixed widths + truncate + tooltip**;
  rows **virtualize** above ~100 (new reusable `components/virtualized-table.tsx` on `@tanstack/react-virtual`,
  `virtualized` on/off prop) so ~2000 rows stay smooth. (3) **Commit is chunked** into sequential 100-row
  batches with a **progress bar**; a failed batch is retryable because the import is **idempotent** (a
  re-run of an already-created row becomes an update — no duplicate, stock not double-counted). **Decision:**
  NOT using BullMQ yet (the VPS worker now runs, but the idempotent chunked commit covers ≤2000 everywhere, so the BullMQ path stays a future option) —
  the background-job design for very large files (VPS era) is prepared in
  `docs/roadmap/product-import-scaling.md`. 4 gates green; 52 catalog vitest.
- **In-detail product editing** (`catalog`, same branch) — since the bulk import can now change existing
  data, the product **detail page** gets an **"Edit"** toggle (beside "Tambah varian") that flips the SAME
  layout into **inline inputs** (text→input in place — NOT a separate form): product name + category/
  description + each variant/subvariant **name/harga(Rp)/modal(Rp)** + a per-group **"Nama grup"** rename. A
  new **Modal column** was added to the variant table (shown as Rp read-only, NumberInput in edit); in edit
  mode only the editable columns show — **Tersedia/Koneksi/Aksi hide**. **SKU
  read-only** (import match key); barcode not edited here; stock via "Sesuaikan"; reorder-planning via the
  renamed ⋯ **"Ubah informasi tambahan"** (was "Ubah varian/subvarian"). "Simpan" diffs vs the original and
  PATCHes only what changed (`updateProduct` + per-variant `updateVariantDetails`) behind a confirm; Batal
  confirms if dirty. Wiring: NEW `PATCH /products/[id]/variants/[variantId]/details` (exposes the previously
  import-only `updateVariantDetails`) + `useUpdateProductMutation`/`useUpdateVariantDetailsMutation`. Gated
  `{ requireAuth: true }`. 4 gates green.

## 🎯 Mid-size features (1 session each)

| #   | Item                                                                 | Module            | Effort | Gate | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------- | ----------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ **Per-channel performance report**                                | reporting         | S      | 🟢   | **Done 2026-06-15**: revenue share, AOV, return rate, trend matrix, charts, **POS payment-method mix**, **per-channel time-to-ship** (placedAt→shipped). Deferred: inventory turnover (needs historical inventory we don't track yet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | ✅ **Phase 6: scheduled reconciliation + provider-health dashboard** | queue/marketplace | L      | 🟢   | **Shipped 2026-06-15** (see ✅ section above): on-demand + scheduled drift detect, on-read provider-health dashboard + nav pulse, scheduled token auto-refresh. Deferred: persistent drift audit-log + alert thresholds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | ✅ **Supplier entity + per-supplier lead time**                      | purchasing        | L      | 🟡   | **Shipped 2026-06-17** (on `session/2026-06-17-shopee-integration`). `Supplier` model (org-scoped, soft-deleted, default lead time/MOQ) + `ProductVariant.supplierId` (preferred) + `PurchaseOrder.supplierId` (FKs SetNull). Reorder report resolves lead time/MOQ as **variant value → preferred-supplier default → global** (variant wins; soft-deleted suppliers ignored). Supplier CRUD module (service/validators/routes/hooks, gated `purchasing.view`) + a "Pemasok" management page (list/create/edit/soft-delete) under Stok + a "Pemasok utama" picker in the variant edit dialog + a saved-supplier picker in the New-PO form (validates org ownership, snapshots the name into `supplierName`). Migrations applied to local dev DB 2026-06-17. Precursor to AP (#F). |
| 4   | ✅ **Lazada multi-warehouse stock sync** (non-destructive)           | marketplace       | M      | 🟢   | **Shipped 2026-06-16.** Palka owns ONE warehouse per connection (`syncWarehouseCode`, picked in the "Gudang sinkron" card from `knownWarehouseCodes` captured at import). Push writes `available` to ONLY that warehouse (single-entry `<MultiWarehouseInventories>`, inner `<Quantity>`) and **OMITS the rest — Lazada leaves omitted warehouses untouched** (partial update, live-verified); never zeroes a warehouse we don't own. Drift compares `available` vs the sync warehouse's own sellable (`resolveSyncWarehouseStock`), not the sum. null = bare single-warehouse path (unchanged). The internal multi-location/WMS generalization (this is its n=1 case) is scoped separately in `docs/roadmap/wms-scoping.md`. Found + fixed 2026-06-16.                           |
| 5   | **Approach B: multi-SKU batch stock sync**                           | queue/marketplace | M      | 🟡   | Escalation from the shipped per-variant coalesce (Approach A, 60s window): when many DISTINCT SKUs change at once (big opname, multi-line PO receive), batch several SKUs into ONE Lazada call (`<Skus>` accepts multiple `<Sku>`) via a dirty-set + scheduled flush, with per-SKU `detail[]` error attribution. Full design + open decisions in `docs/roadmap/sync-batching.md`. Build only when single-SKU calls actually pile up; needs a small migration (dirty column/outbox) + live payload validation.                                                                                                                                                                                                                                                                     |
| 6   | **Reporting DB-side aggregation**                                    | reporting         | M      | 🟢   | **POC done + validated EXACT 2026-06-26, SHELVED** (branch `session/2026-06-26-reporting-sql-poc`). Push the profit report's money aggregation down to SQL (a `sold_lines` CTE) instead of loading every line + reducing in JS; validated Δ=0.0000 vs the JS path (incl PPN-inclusive/refund/return) on real local data. **Deferred**: the JS path is index-backed + fast at small-shop scale, and a full rewrite duplicates the per-line net-math in two languages (maintenance cost) — pull the trigger only when real volume makes the in-memory reduce slow. POC file: `modules/reporting/services/profit-sql.poc.ts` + a localhost-gated validation test.                                                                                                                    |
| 7   | **Keuangan / True Net P&L** (expense ledger + net-profit report)     | finance/reporting | L      | 🟢   | **FEATURE-COMPLETE & SHIPPED 2026-06-26→27** (branch `session/2026-06-26-finance-net-pl`, 37 commits, gates green, UNPUSHED): Expense ledger (`/dashboard/finance/expenses`) + "Laba bersih (Net P&L)" report (`/dashboard/reports/net-profit`) · filter/CSV/dashboard-home card · recurring `ExpenseTemplate` ("Buat bulan ini") · auto-derived fees (QRIS + marketplace commission, "Hitung fee bulan ini") · source flag badges · budget-vs-actual. `finance.view`/`finance.manage` keys (catalog 13); 4 additive migrations; demo seed covers it. Audit big-bet #1. Detail + tiny remaining backlog: `docs/roadmap/finance.md`.                                                                                                                                               |

> _Shipped from this table: **Dead-stock & ABC analysis** + **Stock opname / cycle count** (2026-06-11)
> · **Phase 6 reconciliation + provider-health + token auto-refresh** + **Per-channel performance report**
> (2026-06-15)._

## 🛰️ Big bets (multi-session / gated, sequenced later)

| #   | Item                                                                        | Effort   | Gate | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | **Notification engine** (in-app tray + WhatsApp)                            | L        | 🔴   | **In-app tray SHIPPED 2026-06-16** as an honest DERIVED feed (no schema, no worker — client-derived): the navbar bell opens a "needs my attention" inbox over the SAME queries ops-pulse + Pandu already keep warm (oversold · urgent restock · unhealthy channel · orders-to-ship · returns-pending · low stock · dead-stock capital), with persisted read/unread (`notifications-store`, per-datum ids re-arm on change). The aggregator (`use-notifications`) is the single selector a future persistent `Notification` table would swap. **Remaining (gated):** a persistent event-log + `NotificationPreference` + a send worker, and **WhatsApp Business approval (Meta, slow in ID)** for the WA channel. The retention hook. **Full design + phased roadmap (persistent log → producers → preferences → WhatsApp): `docs/roadmap/notification-engine.md`. Phase 1 + 2 (hybrid) SHIPPED 2026-06-16: persistent event-log + per-user server read-state + read API + UNION selector + 8 best-effort producers (sale-below-cost/PO-received/return-processed/opname-posted/order-placed/order-shipped/sale-refunded/return-opened) + RBAC tray-filtering + "Lihat semua" history page. DECISION: rolled-up signals stay derived/instant; full server-backed (scheduled-worker recompute) + retention + WhatsApp are VPS-era worker/cron steps (the worker host now exists) — not built yet. Next step = Phase 3 (preferences).** |
| B   | **Marketplace token auto-refresh + OAuth callback**                         | L        | 🟡   | **Lazada DONE (2026-06-14):** OAuth authorize+callback, manual token-refresh route, test-connection. **Scheduled refresh worker DONE (2026-06-15).** **Generalized 2026-06-17:** `findConnectionsForTokenRefresh` now covers LAZADA+SHOPEE+TOKOPEDIA + a lazy refresh-before-use (`ensureFreshAccessToken`; Shopee tokens last ~4h). **Shopee + Tokopedia(=TikTok Shop) OAuth callbacks scaffolded 2026-06-17 (env-gated, NOT live-verified).** Remaining: live sandbox validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C   | **Real Shopee / Tokopedia / TikTok adapters**                               | L (each) | 🔴   | **Lazada is now REAL + OAuth-onboarded + live-validated** (import + **stock-WRITE both work** — write via `/product/stock/sellable/update`, 2026-06-15). **Shopee + Tokopedia SCAFFOLDED 2026-06-17** (env-gated, fall back to the Dev/stub when creds unset; **NOT live-verified** — endpoint paths/signatures flagged VERIFY, need sandbox creds): shared signed client + import adapter + worker stock-sync + OAuth authorize/callback + UI + sign/payload unit tests. The standalone Tokopedia API is terminated → **TOKOPEDIA = TikTok Shop Open API v202309** (one shared `tiktok/` client; needs `shop_cipher` → new `MarketplaceConnection.externalShopCipher` column). Threads `shopId`+`shopCipher` via `ProviderShopCredentials`; new env `SHOPEE_*`/`TOKOPEDIA_APP_*`. Remaining per provider: live sandbox validation + webhook/poll. **Start Shopee partner paperwork now — 6–12 wk lead time.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D   | **Courier aggregator (Biteship / RajaOngkir) + AWB at the packing station** | L        | 🔴   | Rate lookup, courier select, print AWB where `noResi` appears. `CourierProvider` + `ShippingLabel`. Needs API key/sandbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| E   | **Multi-location / warehouse stock + transfers**                            | L        | 🟡   | Scope stock to `(variantId, locationId)`, `StockTransfer` ledger reason, location-aware pickers, per-location available summed to each channel. Foundational — rewrites inventory queries; sequence after Phase 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F   | **Supplier accounts-payable** (3-way match, terms, aging)                   | L        | 🟡   | Builds on #7 Supplier. PO→invoice→payment, due dates, AP ledger, aging. Month-end reconciliation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| G   | **Organization + team RBAC → public API → SaaS billing**                    | XL       | 🟡   | **Org-foundation + RBAC SHIPPED 2026-06-14** (`Organization`/`OrganizationMember`/`OrgRole`, org-scoped queries, code invites, configurable permission catalog, audit). Remaining: public API-key auth + usage/tier (SaaS) billing. (Was: strictly single-user, `userId` everywhere.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| H   | **AI mismatch detection on packing video**                                  | XL       | 🔴   | CV/OCR auto-flag item/qty mismatches vs the order → automated dispute defense. `aiProcessing`/`ocrProcessing` placeholders reserved. Needs a CV API + review-queue UX.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| I   | **WhatsApp ordering channel** (structured, premium, per-org 1 number)       | L        | 🔴   | **DESIGN DONE 2026-06-26, not started.** Customer orders inside WhatsApp via Catalog/Cart + Flows (structured, not free-text); per-org ONE WABA, premium-gated, lands through the existing orders reserve lifecycle. VPS-only (webhooks). Owner must register a WABA first (multi-week Meta verification). BSP-first (360dialog) → direct Cloud API later. Full design: `whatsapp-integration.md`. (The parked `session/2026-06-26-manual-chat-orders` branch is its server/schema foundation.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| J   | **Seller storefront / website builder** (premium, multi-tenant)             | XL       | 🔴   | **IDEA captured 2026-06-26, next-phase.** Per-org public storefront reading our SoT; theme-first (Phase 1, multi-tenant Next.js + subdomain/custom-domain + Caddy on-demand TLS + public anonymous checkout), then a Puck visual builder (Phase 2). Shares the public-checkout + external-payment + VPS infra with #I. Full design: `storefront-builder.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## ⚡ Quick wins (sub-hour)

- _(shipped 2026-06-26: **POS held / park sale** — "Tahan" sets the current cart aside and a
  "Tertahan (N)" tray resumes it (lines + customer + discount + PPN restored); resuming with a cart
  in progress parks that one first. Client-side draft (`store/pos-held-sales.store.ts`, Zustand+persist,
  per-browser, capped 20), single-register scope. Plus two orders fixes: `snapshotOrderItemCostsTx`
  now stamps each line once (no overwrite of an earlier reserve), and the `server.ts` auto-pull
  loopback fetch got an `AbortSignal.timeout` so a hung request can't wedge auto-pull.)_
- _(shipped 2026-06-16: **bulletproof drift-sync completion** — an active watcher (poll in-flight
  every 1.5s + 6s grace timeout) armed on a manual sync makes the drift re-check + auto-close +
  status revalidation deterministic even for a fast job the 2s background poll skips. Remaining
  nicety, only if needed: per-row terminal success/fail via a job-done socket event or per-mapping
  `lastSyncStatus` poll — current connection-level watcher already covers the practical case.)_
- _(No other open quick wins — all of the below shipped to `main`.)_
- _(shipped 2026-06-11: marketplace sync-health badge · below-cost alert at sale-create ·
  `grup · subvarian` picker label.)_
- _(shipped 2026-06-12: `@@index([userId, createdAt])` on `StockLedger` — serves the userId-scoped
  newest-first activity-log scans the reason-prefixed index can't order.)_
- _(shipped 2026-06-12: archived-variant view + restore on product detail — a collapsible
  "Varian terarsip" section lists soft-deleted variants; restore un-mangles the original SKU and
  is refused when a live variant/bundle now owns it.)_
- _(shipped 2026-06-12: bundle archive — `Bundle.deletedAt` soft-delete (manual delete now archives,
  restorable); deleting a variant warns if it's a bundle component, then on confirm drops it from
  every live bundle and auto-archives any bundle left empty; "Bundel terarsip" view + restore.)_

## Locked decisions (don't relitigate without a reason)

Org-scoped (Organization + OrgRole, SHIPPED 2026-06-14; was "internal-first / per-user") · adapter-first + stubs until partner approval · append-only
`StockLedger` is the SoT, `Inventory` is the fast-read cache · returns net the profit report by
`processedAt` on still-shipped/completed orders · post-ship cancel = a return, not a release.
