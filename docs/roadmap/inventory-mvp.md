# Inventory & Multi-Marketplace Stock Sync — MVP Roadmap

> Status: **Phases 0–5 shipped (stub-backed)** + **POS (offline sales), Purchasing/POs, and QR-scan
> (labels + mobile scan-to-cart/order) shipped** as counter/restock verticals + **catalog
> variants/subvariants & per-variant photos shipped** (§11) + **finance foundation (moving-average HPP,
> COGS snapshots, profit/margin report), VOID/refund, bundles/kits** shipped + **operations & finance
> hardening (2026-06-07)** shipped (§13: list pagination, marketplace token-expiry guard, returns-netting
> in profit, inventory-valuation report, share-evidence on dispute panels, manual order actions, DAMAGE
> write-off) · **discount + PPN at POS, partial/per-item refund** shipped · **reporting (per-channel
> performance + dead-stock & ABC)** and **stock opname / cycle count** (with a phone `OPNAME` pairing that
> tallies +1 per scan) shipped (2026-06-11/12) · Started 2026-06-03 · Owner: @willywnt · Next: see
> [`backlog.md`](./backlog.md) · Phase 6 (provider-health dashboard + drift reconciliation + token
> auto-refresh worker) shipped 2026-06-15.
>
> This is the working reference for the next big MVP: an **internal inventory system
> that is the source of truth**, integrating stock across marketplaces (Shopee,
> Tokopedia, TikTok Shop first; more later). Read alongside [`CLAUDE.md`](../../CLAUDE.md).

## 1. Locked decisions

| #   | Decision                | Choice                                     | Implication                                                                                                                                                                             |
| --- | ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tenancy                 | **Internal-first, but per-user-scoped**    | Every new model carries `userId` (like today's schema). No org/tenant/billing yet, but scoping is correct so a multi-seller SaaS later is additive (add `Organization`), not a rewrite. |
| 2   | Marketplace integration | **Adapter-first + stubs**                  | Build & test the whole pipeline with `Dev`/`Unwired` provider adapters. Wire real Shopee/Tokopedia/TikTok APIs only when partner approval lands (TikTok approval is slow).              |
| 3   | UI/UX                   | **Light IA reshell first, redesign later** | Phase 0 reorganizes the sidebar/shell into product sections without touching existing pages. Full visual redesign happens only once the domain is stable.                               |

## 2. Product vision

`Recording` is bound to `noResi` (a shipment tracking number = an order). That means the
existing recording feature is really the **fulfillment-proof step of an order/inventory
product**, not a standalone feature. The unified loop:

> **Multi-channel orders IN → Inventory as source of truth (prevent oversell) →
> pick/pack with barcode scan + packing-video proof → ship.**

Differentiator vs Indonesian incumbents (Jubelio / Ginee / Forstok): **built-in
packing-video evidence per resi** — directly answering ID sellers' pain (buyer-fraud
claims, "barang tidak sesuai", retur).

## 3. Prior art — a reverted design we reuse as blueprint

A full inventory + sync implementation was already built then reverted. The source is
gone, but **compiled artifacts remain** in `packages/queue/dist/marketplace-sync/`:
`sync-engine`, `stock-normalizer`, `stock-provider.registry` (with `Dev`/`Unwired`
stub adapters), `idempotency`, `rate-limit`, `reconciliation.types`, `sync-repository`,
`sync-errors`, plus jobs `propagate-inventory-stock.job` / `sync-marketplace-stock.job`.

**Do not delete these `dist` files yet** — they are the blueprint. Reconstructed models:

- `MarketplaceAccount` (evolves today's `MarketplaceConnection`): `status`, `storeName`,
  `externalStoreId`, `lastConnectedAt`, `lastSyncAt`, encrypted tokens, `metadata`.
- `Product` → `ProductVariant`: `sku`, `barcode`, `price`/`cost`/`weight` (Decimal),
  `dimensions` (Json), `lowStockThreshold`, `alertEnabled`.
- `Inventory` (1:1 variant): `availableStock`, `reservedStock`, `damagedStock`, `incomingStock`.
- `MarketplaceProduct`: external listing snapshot (`externalProductId/VariantId/Sku`,
  `stock`, `rawPayload`, `status`, `lastImportedAt`, `lastSyncedAt`).
- `MarketplaceProductMapping`: variant ↔ external listing (`syncEnabled`, `autoMapped`,
  `mappingConfidence`).
- `MarketplaceSyncJob`: `idempotencyKey`, `syncType`, `syncStatus`, `attempts`, `providerResponse`.
- `ProviderHealth` + `SyncLog`: per-account observability + per-sync audit.

Sync flow: internal stock change → `propagate-inventory-stock.job` (find all sync-ready
mappings for the variant, create sync jobs) → `sync-marketplace-stock.job` (push to each
marketplace via adapter; idempotent, rate-limited, retried) + reconciliation (drift detection).

## 4. Phased roadmap

Each phase follows the `CLAUDE.md` workflow: incremental, per-module, one logical commit
per change, all gates green (`typecheck`/`lint`/`build`/`test`).

- **Phase 0 — IA reshell** _(no schema)_ — ✅ **done**. Sidebar product sections + placeholder pages.
- **Phase 1 — Inventory foundation** — ✅ **done**. `catalog` + `inventory`: Product/Variant,
  Inventory, append-only `StockLedger`, manual adjustments, ledger, low-stock alerts.
- **Phase 2 — Catalog ↔ marketplace mapping** — ✅ **done** (stub import). `MarketplaceProduct` +
  `MarketplaceProductMapping`, auto-map by NORMALIZED sku → `NEEDS_REVIEW` when non-exact.
  (Connection kept as `MarketplaceConnection`, not renamed to `MarketplaceAccount`.)
- **Phase 3 — Outbound stock sync** — ✅ **done** (stubs). `propagate-inventory-stock` +
  `sync-marketplace-stock` engine, idempotency, rate-limit, per-listing sync status, `Dev`/`Unwired`
  adapters. (First REAL Shopee adapter + provider-health/reconciliation → Phase 6.)
- **Phase 4 — Inbound orders** — ✅ **done, and extended**. Multi-store pull + 30s cooldown; a full
  per-order **reserve → ship → release stock lifecycle** (reserved/damaged buckets) with
  cancellation→restock and **source-channel exclusion**; plus **Returns/RMA** (auto-open on post-ship
  cancel + manual; process restock/damaged). Idempotent via the order's `inventory*` timestamps.
  (Webhook ingestion still polling-only — pull, not push.)
- **Phase 5 — Fulfillment unification** — ✅ **done**. Orders ↔ packing videos joined by
  case-insensitive `noResi`; station **pack view** (what to pack), **auto-fulfill** on packing-video
  complete (`Order.fulfilledAt`), packing-video **evidence** on orders/returns, links both ways.
  (Formal `Recording.orderId` FK + pre-order backfill deferred — noResi-join for now.)
- **Phase 6 — Automation & reporting** — ✅ **mostly shipped** (2026-06-15). **Provider-health dashboard**
  (per-connection health computed on-read: token lifecycle, sync coverage, needs-review, failed pushes,
  recent sync → ok/warn/danger tone; badges on the marketplace list + a "Kesehatan & drift" panel on the
  connection detail + a `marketplaceUnhealthy` nav pulse). **Drift reconciliation** (`computeStockDrift`,
  pure + unit-tested): on-demand "Periksa drift" pulls live external stock and compares to internal
  available (over/under/missing), **observe-only** — internal stays the SoT, fixes are a manual re-push;
  a **scheduled BullMQ job** (`reconcile-marketplace-drift`, daily) logs drift per active connection.
  **Token auto-refresh worker** (`refresh-marketplace-tokens`, daily) renews Lazada tokens nearing expiry.
  Zero DB migration (drift computed on-read, health from existing fields). Channel-performance / dead-stock
  reports already shipped in `reporting`. (Reorder intelligence — velocity → days-of-cover → suggested qty,
  dead-stock status — shipped in `inventory`.) Remaining: a persistent drift audit-log + alert thresholds,
  and OAuth callbacks for the other providers (Lazada only today).
- **Counter & restock verticals** (beyond the marketplace-sync phases, same SoT) — ✅ **shipped**:
  - **Offline sales / POS** (`sales` module) — counter sale decrements the SoT immediately
    (`applyOfflineSaleTx`: available−, ledger `SALE`/source `POS`, oversell allowed) and propagates to
    all channels, so in-store selling can't oversell online. `Sale`/`SaleItem`, CASH/QRIS/TRANSFER,
    code `S00001`. `SALE` joins `SALES_LEDGER_REASONS` (feeds reorder velocity).
  - **Purchasing / POs** (`purchasing` module) — **lights up `incomingStock`** (the last empty bucket):
    create PO → `adjustIncomingTx(+qty)` (no ledger row); **partial per-line receive** →
    `applyPurchaseReceiveTx` (incoming−, available+, ledger `RESTOCK`/source `PURCHASE`),
    ORDERED→PARTIALLY_RECEIVED→RECEIVED; cancel → incoming−. Free-text `supplierName` (no Supplier
    entity yet). The reorder report's **"Create PO"** prefills from URGENT/SOON suggestions.
  - **QR-scan (POS phase 2)** — printable QR labels (label studio + `labelPrintedAt`) and mobile
    scan-to-cart (POS) / scan-to-order (New PO) via `scanner-pairing`. Full detail in §10.
  - **Catalog variants / subvariants + photos** (`catalog`, branch `feat/variant-options`) — the
    variant stays the **SKU/stock leaf**; **`ProductVariant.variantGroup`** is an optional grouping
    label so a variant is either a **standalone SKU** or a **named group of subvariant SKUs** (a product
    may also have **0 variants**). Shared variant builder (`VariantBlocksField`) across create / add-variant
    / add-subvariant, SKU auto-generation, `EllipsisTooltip` + collapsible "Connections" (marketplace)
    column. **Soft-delete** frees the SKU (`archivedSku`) and is gated by a cross-module **delete-guardrail
    preflight** (marketplace-mapped / reserved / incoming / open-return = block; on-hand + damaged = warn).
    **Per-variant photo** (`imageKey`/`imageUrl`) in a **separate PUBLIC R2 bucket** (recordings bucket
    stays private), client-compressed to WebP, shown in a `VariantImage` popover by the variant name.
    Grouping is **display-only** — inventory/ledger/orders/sales/PO/marketplace are untouched (no deeper
    stock-bearing level). Full detail in §11.
  - **Operations & finance hardening (2026-06-07, all on `main`)** — see §13:
    - **List pagination** — `orders` + `returns` lists dropped a silent 100-row cap for real server
      pagination (`PaginatedResult` skip/take+count) + `TablePagination` ("N of M").
    - **Marketplace token-expiry guard** — `marketplace-sync` rejects an expired `tokenExpiresAt`
      non-retryably (INVALID_TOKEN) BEFORE calling the provider (fails, doesn't disable → re-syncs
      after refresh).
    - **Returns-netting in the profit report** — processed returns (RECEIVED, by `processedAt`, only
      on still-SHIPPED/COMPLETED orders) net revenue+COGS back out as negative-qty lines; a `returns`
      block surfaces the deduction ("Net revenue").
    - **Inventory-valuation report** (`reporting`) — on-hand stock × moving-average cost, per-product
      rollup, cost-unknown flagged; `/dashboard/reports/inventory-value` + CSV (Insights sidebar).
    - **Share-evidence on dispute panels** — `ShareEvidenceControl` (recordings) mounts the share dialog
      on order-detail + return-detail (one-vs-many video picker); reuses the existing share hooks.
    - **Manual order actions** (`orders`) — mark-shipped / edit tracking no. / cancel-with-reason, each
      driving the existing reserve/ship/release lifecycle; **`Order.cancelReason`** added; cancel blocked
      post-ship (→ return). `OrderActionsMenu` on the order header.
    - **DAMAGE write-off** (`inventory`) — dispose units from the damaged bucket (available unchanged);
      **`StockLedgerReason.DAMAGE_WRITE_OFF`** added, ledger delta 0; "Write off damaged" row action.
- **Then** — full visual UI/UX redesign, once the domain is stable.

## 5. Phase 1 schema draft — **APPLIED (+ evolved since)**

Applied — `packages/db/prisma/schema.prisma` is the source of truth. Beyond this draft the live
schema has grown: `ProductVariant.cost`/`weight`/`leadTimeDays`/`minOrderQty`/**`labelPrintedAt`**;
`Order.inventoryAppliedAt`/`inventoryShippedAt`/`inventoryRevertedAt`/`fulfilledAt`; `StockLedgerReason`
gained `ORDER_RELEASE` + `RETURN`; `Return`/`ReturnItem` (+ `ReturnStatus`/`ReturnDisposition`);
the POS/purchasing models (`Sale`/`SaleItem`, `PurchaseOrder`/`PurchaseOrderItem`); and for QR-scan,
**`PairingSession.purpose`** (enum `PairingPurpose` RECORDING/POS/PURCHASING). The original draft is
kept below for historical context.

```prisma
model Product {            // catalog master
  id, userId, name, description?, category?, isActive, createdAt, updatedAt, deletedAt
}

model ProductVariant {     // the sellable unit
  id, userId, productId, sku, name, barcode?,
  price Decimal, cost Decimal?, weight Decimal?, dimensions Json?,
  isActive, lowStockThreshold Int, alertEnabled, createdAt, updatedAt, deletedAt
}

model Inventory {          // 1:1 with variant — fast-read cached numbers
  id, variantId @unique, availableStock, reservedStock, damagedStock, incomingStock, lastAdjustedAt
}

model StockLedger {        // APPEND-ONLY — the real source of truth for every mutation
  id, userId, variantId, delta Int, balanceAfter Int,
  reason  (MANUAL_ADJUST | RESTOCK | DAMAGE | ORDER_RESERVE | ORDER_SHIP | MARKETPLACE_SYNC | RECONCILE),
  source  (MANUAL | MARKETPLACE | SYSTEM),
  referenceId?, note?, createdAt
}
```

`Inventory` is a fast-read cache for the UI; `StockLedger` is the undeniable truth. Every
stock change = one ledger row + one `Inventory` update inside a single transaction.

## 6. Architecture principles (industry-fit, hold these)

- **Append-only `StockLedger` is the SoT** — never rely on a mutable counter alone. Every
  mutation records `reason` + `source` + `referenceId`. This keeps the system correct and
  auditable when syncs fail or fire twice.
- **`reserved` vs `available`** — the anti-oversell distinction.
- **Idempotency everywhere** — orders and webhooks can be delivered more than once.
- **Outbound sync is async + retried** — show per-listing sync status; never promise hard real-time.
- **Adapter-first with stubs** — build/test the full pipeline before official API approval.

## 7. Module & layout placement (per `CLAUDE.md` §3–4)

- `apps/web/src/modules/catalog` — `Product` / `ProductVariant` (catalog master).
- `apps/web/src/modules/inventory` — stock levels, `StockLedger`, adjustments, alerts.
- `apps/web/src/modules/marketplace` _(existing)_ — extend with accounts, external
  products, mappings, sync orchestration UI.
- `apps/web/src/modules/orders` — orders + the reserve/ship/release lifecycle + fulfillment helpers.
- `apps/web/src/modules/returns` — Returns/RMA (`Return`/`ReturnItem`), restock/damaged processing.
- `apps/web/src/modules/recordings` _(existing)_ — now order-aware (pack view, by-resi evidence).
- `packages/queue/src/marketplace-sync` — the sync engine (worker-side), ported from `dist`.
- **Boundary watch:** token decryption currently lives in the web `marketplace` module, but
  the worker needs it for sync. Lift the token-crypto into a shared `@falka/*` package
  rather than cross-importing web internals into the worker (the reverted design kept a
  queue-local copy — prefer a shared package). Flag as its own change.

## 8. Parked ideas for later MVPs

- ✅ **Returns (retur) tied to recordings** — done (Returns/RMA + packing-video evidence by `noResi`).
- Export packing-video as **dispute evidence** — basic in-app evidence (order/return show the video by
  `noResi`) shipped; a **shareable external link** to buyer/marketplace is still parked.
- **AI mismatch detection** in packing video (vision/OCR) — `aiProcessing`/`ocrProcessing`
  placeholders already reserved in `packages/queue` types.
- ✅ **Purchasing / restock** — done (`purchasing` module fills `incomingStock`: PO create→incoming+,
  partial receive→available+ via `RESTOCK`/`PURCHASE`, cancel→incoming−). Suppliers (a real Supplier
  entity + per-supplier lead time) + auto cost-update on receive remain parked.
- ✅ **Offline sales / POS** — done (`sales` module: counter sale → `SALE`/`POS`, propagate to all
  channels). Printable receipt/nota, VOID/refund, discount/tax remain parked.
- ✅ **Bundles / kits** — done. A `Bundle` is a buy/sell shortcut (its own SKU/QR) that explodes into
  per-component sale/PO rows with proportional price/cost allocation; it is NOT a stock variant. Marketplace-order
  bundle decrement still parked.
- Multi-warehouse / location stock.
- Analytics / reporting (profit/channel-performance — partly Phase 6).
- Recording thumbnail generation (`thumbnailGeneration` placeholder reserved).

## 9. Approval gates

- [x] Phase 1 schema (§5) approved + applied (and evolved through Phases 4–5).
- [ ] Real marketplace API wiring (Phase 3+) gated on partner/developer approvals (still stubs).

## 10. QR-scan (POS phase 2) — ✅ shipped

Scan a SKU at the counter instead of typing the search box. Both halves shipped.

- **Phase A — QR labels (shipped).** A label studio at `/dashboard/labels` (catalog) prints an A4 grid
  of QR labels (name + sku + price + code) encoding **`barcode ?? sku`**. The picker is paginated and
  sorts already-printed variants last. **`ProductVariant.labelPrintedAt`** (+ `markLabelsPrinted`,
  `POST /products/variants/printed`) records the last print — surfaced in the picker and a shared
  **`QrCodeDialog`** (product-detail inline `QrImage`, inventory ⋯ action; "Print again" allowed).
  Pure client render (`qrcode`), no proxying. Endpoints: `GET /products/variants?q=&page=&pageSize=`.
- **Phase B — scan-to-cart / scan-to-order (shipped).** A phone paired via **`scanner-pairing`** adds a
  line by scanning a product label — POS (`usePosScanner`) and New PO (`usePurchaseScanner`); a repeat
  scan **bumps qty**. Each pairing carries a **`PairingPurpose` (RECORDING | POS | PURCHASING)** so a
  scan only drives its own station (gated client-side; `recording_triggered` fires ONLY for RECORDING —
  socket contracts unchanged, HARD CONSTRAINT #4 intact). Scanned codes are relayed **verbatim** (lenient
  `scannedCodeSchema`; strict resi `noResiSchema` only at recording-create + manual/hardware-wedge —
  `normalizeBarcodeValue` removed); the reader accepts QR + 1D. Resolvers:
  `GET /sales|purchase-orders/variants/resolve?code=` (barcode-then-sku, case-insensitive). Scan feedback
  (beep + countdown ticks) is **browser-only** (`@/lib/scan-sound`).
- **Gating.** Phase B needs the realtime **socket host** (custom `server.ts`, **NOT on Vercel** — single-host
  Indonesia VPS, see the deploy plan), so it's dev/VPS-only; Phase A labels work anywhere.
- **Deferred (still open):** a dedicated 1D/Code128 print format + per-variant override; bulk label
  reprints; copies-per-label; hardware USB/Bluetooth (HID keyboard-wedge) scanner at the POS search box.

## 11. Catalog variants / subvariants + per-variant photos — ✅ shipped

Branch `feat/variant-options` (off `main`, **unpushed**). Lets a product describe options without
adding a deeper stock level. The full detail lives in `.cursor/rules/40-inventory-marketplace.mdc`
(catalog section + Gotchas) and `CLAUDE.md §12`; the model in short:

- **Model.** The **variant is the SKU/stock leaf** — unchanged. **`ProductVariant.variantGroup String?`**
  is an optional grouping **label**: a variant is either a **standalone SKU** (`variantGroup = null`) or a
  **named group of subvariant SKUs** (siblings share one `variantGroup`, e.g. group "iPhone 16" →
  subvariants "Hitam" / "Putih"). A product may have **0..N** variants (create-without-variant, add later
  from the detail page). Grouping is **display-only** — inventory / `StockLedger` / orders / sales / POs /
  marketplace mappings all stay at the leaf; there is **no deeper stock-bearing level**. (A first attempt
  using a dimension model — `Product.optionTypes` + `ProductVariant.options` JSON — was found confusing
  and **reverted** in favour of this simpler named-group flow.)
- **UI.** A shared builder `components/variant-blocks-field.tsx` (`VariantBlocksField`, reads the host form
  via `useFormContext`) powers the create + add-variant + add-subvariant dialogs; each block = variant name
  - has-options toggle + single SKU | subvariant rows with per-row **SKU auto-generation** (vowel-strip
    compaction, e.g. "iPhone 16" + "Hitam" → `IPHN16-HTM`). The product-detail variant table groups by
    `variantGroup`, uses `EllipsisTooltip` for truncated name/SKU/group, and a collapsible **"Connections"**
    column showing each variant's marketplace mappings (1 SKU may map to many listings).
- **Delete.** Soft-delete (`deletedAt`) of a product / variant / whole group **frees the SKU** for reuse
  (`archivedSku` mangling, since the unique index spans archived rows — safe because Sale/Order items
  snapshot the sku). It is gated by a **cross-module preflight** `getDeletionBlockers`
  (`GET /products/:id/deletion-blockers?variantIds=`): **BLOCKED** when any active variant is
  marketplace-mapped, has reserved or incoming stock, or has an open (PENDING) return; **WARNS** (still
  allowed) on available on-hand + damaged stock. No restore UI yet.
- **Per-variant photo.** `ProductVariant.imageKey?`/`imageUrl?`, stored in a **separate PUBLIC R2 bucket**
  (the recordings bucket stays private — its public URL 403'd). The browser **compresses to WebP** (≤1600px,
  `utils/compress-image.ts`) → `POST /uploads/presign-image` → PUT to R2 →
  `PATCH /products/:id/variants/:variantId/image`. Shown in a `VariantImage` popover next to the name
  (upload / replace / delete / preview). **Per-bucket public URLs**: each bucket has its own base and the
  object URL is `<base>/<key>` with **no bucket name in the path** (r2.dev serves one bucket per domain at
  the root). Env: `R2_RECORDINGS_BUCKET_NAME` + `R2_PUBLIC_URL`, `R2_PRODUCTS_BUCKET_NAME` +
  `R2_PRODUCTS_PUBLIC_URL`. `scripts/apply-r2-cors.mjs` applies PUT-upload CORS to both buckets.
- **Deferred (still open):** cross-module display of the "group · subvariant" label in POS / PO / inventory
  pickers; an Archived view + restore; an inline "Unmap" action in the Connections column (currently links
  to the marketplace connection page).
