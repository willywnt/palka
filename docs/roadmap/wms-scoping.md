# WMS / Multi-location inventory — scoping

> Status: **SCOPING (not started)** · Authored 2026-06-16 · Triggered by the Lazada
> multi-warehouse wall (see `.cursor/rules/40-inventory-marketplace.mdc` + backlog #4 +
> [olshop-lazada-integration] memory). Decision doc, not an implementation plan.

## TL;DR

Build **lightweight multi-location inventory, NOT a full WMS.** A `StockLocation` entity,
stock tracked per `(variantId, locationId)`, inter-location transfers, per-location opname,
and a per-connection channel→warehouse mapping — all additive to the existing
**StockLedger-is-truth / Inventory-is-cache** architecture (it just gains a `locationId`
dimension). Single-location sellers (the majority) see **zero** new complexity behind an
org-level toggle (default off, one implicit backfilled warehouse = today's behavior
byte-for-byte).

**Explicitly OUT:** bins/shelves/racks, directed put-away, pick paths, wave/zone picking,
pack stations, RF scan-_enforcement_, lots/serials/expiry/FEFO. Those are a separate "Falka
WMS" axis to defer until a segment crosses ~1,000 orders/month (most SMB sellers outsource
that to a 3PL).

**Sequencing:** the non-destructive Lazada **Option A** fix is the n=1 degenerate case of
this model — **ship A first** (it's a forward-compatible seam, solves the live bug, tiny
blast radius), then generalize into multi-location only if the seller genuinely holds stock
in ≥2 **physical** places. The Lazada wall alone is **channel-side** and does **not** by
itself justify the internal multi-location build — confirm physical need first
(`scripts/lazada-mw-probe.mjs read`).

## Two categories, not one continuum

|               | Multi-location **inventory**                            | Full **WMS**                                                   |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Records       | "how much of SKU X is at which named place"             | directs labor task-by-task                                     |
| Core entities | Warehouse/Location, stock-per-(SKU,location), transfers | + bins/zones/aisles, put-away rules, pick paths, pack stations |
| Sub-location  | none (a location is flat)                               | bin/shelf inside a location                                    |
| Scan          | scan-to-count / scan-to-transfer (optional)             | scan-**enforcement** (refuses txn w/o the right bin)           |
| Audience      | SMB with ≥2 places                                      | ops at ≥1,000–3,000 orders/mo                                  |

The sharp boundary is **the bin + rule-driven task direction**. For Falka's SMB audience the
answer to "do we direct physical floor work?" is **no**.

## Competitor landscape

Multi-location is **commoditized/core**; full WMS is consistently a **separate tier / module
/ product**. The monetization lever for multi-location is **location count** (~$10/location),
never per-order.

- **Indonesia/SEA** — _iSeller_: multi-location (≤30 warehouses, outlet→Shopee-warehouse
  mapping w/ % allocation + nearest-routing) in the **core** POS product, no WMS — the closest
  analog to Falka's target. _Olsera_: multi-outlet + Stok Masuk/Keluar transfer in base.
  _Majoo_: multi-cabang/gudang + inter-branch mutation in standard tiers; rack/batch gated to
  Prime+. _Jubelio_: full WMS (bins/FEFO/pick-pack/mobile app) **bundled into the per-order
  base plan** (the separate service is Jubelio Shipment 3PL — _not_ the WMS). _Ginee
  WMS-Fulfillment_: a **separately-activated module**, geo-gated to local ID warehouses.
  _SIRCLO/Crewdible/Jet Commerce_: WMS exists only **inside an outsourced 3PL** (Crewdible
  170+ partner warehouses) — many SMB sellers **outsource the WMS entirely**, lowering Falka's
  urgency to build one.
- **Global** — _Shopify_: multi-location native/core (count-gated 2→10→200 by plan), deep WMS
  pushed to 3rd-party apps. _Zoho_: multi-location count-laddered + ~$10/location; bin-level
  "Advanced Warehousing" a separate SKU (but Zoho bundles _some_ bin/pick features — the line
  blurs). _Cin7 Core_: locations all tiers, Advanced WMS a paid add-on on Pro+. _Unleashed_:
  multi-warehouse core, pick/pack/bin a +$149/mo module. _SellerCloud+Skustack_,
  _Linnworks+SkuVault_, _ShipBob WMS_, _Extensiv_: WMS sold as a literally separate product.
  _Veeqo_ (Amazon): unlimited warehouses free. _NetSuite_: MLI = one flag, Advanced Bin = a
  second flag on top.

> Verification caveat: the "WMS is always a separate paid tier" framing was **refuted** for
> Jubelio (bundled) and is only "uncertain" generally (Zoho blurs it). The robust claim is
> **multi-location = core / count-gated; full WMS = separately-activated module or higher
> tier**, with packaging varying by vendor.

## Recommended scope for Falka — v1 ("Multi-lokasi")

**IN:**

1. **`StockLocation`** — org-scoped named place (home, gudang, store, or a logical marketplace
   FC): `name`, `code` (unique per org), `isSellable`, `isDefault`, `isActive`, `sortOrder`,
   optional `address`. Managed in Settings.
2. **Stock-per-location** — today's single `Inventory` row generalizes to one row per
   `(variantId, locationId)` (same four buckets available/reserved/damaged/incoming); no row =
   0 at that location.
3. **Inter-location transfers** — a `StockTransfer` document (DRAFT→IN_TRANSIT→RECEIVED→
   CANCELLED) + items; each line writes **two ledger rows in one tx** (TRANSFER_OUT −qty at
   source, TRANSFER_IN +qty at dest), net org delta = 0.
4. **Per-location opname** — the opname session gains a `locationId`; count + RECONCILE write
   scoped to that location.
5. **Channel→warehouse mapping** — a per-connection mapping table that replaces the single
   `MarketplaceConnection.syncWarehouseCode`; drives the outbound availability push and which
   internal location absorbs that channel's order movements.
6. **Per-location availability rollup** — channel-facing available = `SUM(available)` over the
   locations mapped/sellable to that channel (never a raw per-location field a channel reads).

**OUT (defer or never):** bins/shelves/aisles, put-away rules, pick paths, wave/zone/cluster
picking, cartonization, pack stations, labor/KPI, ASN/receiving gates, SSCC/pallets, RF
scan-**enforcement**, lots/batches/serials/expiry/FEFO (a **category-driven** axis — cosmetics/
F&B/supplements — not a warehouse-count one; scope separately). Per-channel safety-stock
**buffers**: leave the seam (push value is a computed projection, never the raw cache field)
but defer the feature.

## Proposed data model (all additive)

Today: `Inventory @unique([variantId])` (4 buckets); `StockLedger` (no `locationId`);
`MarketplaceConnection.syncWarehouseCode String?`.

- **`StockLocation`** `{ id, organizationId, name, code, isSellable, isDefault, isActive,
sortOrder, address?, … }` · `@@unique([organizationId, code])`.
- **`Inventory`**: add `locationId` (FK→StockLocation); change `@unique([variantId])` →
  `@unique([variantId, locationId])`. Keep the four buckets per row. Rollup = **SUM-on-read**
  (avoid a denormalized second cache — see open decisions).
- **`StockLedger`**: add `locationId` (nullable on legacy rows, required for new writes); add
  `@@index([organizationId, locationId, reason, createdAt])`; `balanceAfter` becomes
  per-(variant,location).
- **`StockLedgerReason`**: add **`TRANSFER`** (the one genuinely new reason). All others
  (ORDER_RESERVE/SHIP/RELEASE, SALE, RETURN, RESTOCK, RECONCILE, MANUAL_ADJUST, DAMAGE) keep
  working, now location-scoped.
- **`StockTransfer`** + **`StockTransferItem`** (code `TR00001` per-user, matching S/PO/OP).
- **`MarketplaceWarehouseMapping`** `{ connectionId, internalLocationId, channelWarehouseCode }`
  · `@@unique([connectionId, channelWarehouseCode])` — replaces the single `syncWarehouseCode`
  (kept as the n=1 row during transition).

Relationship mirrors Shopify's `InventoryItem × Location = InventoryLevel`. **Today's single
`Inventory` row IS stock-by-location with one implicit default warehouse**, so the migration
is a **backfill, not a rewrite**.

## Layering & allocation

Layering is unchanged: `StockLedger`/`Inventory` = truth (the inventory module owns ALL stock
writes); `packages/queue` marketplace-sync + the marketplace module = channel-sync. Multi-
location inserts a `(location)` dimension into the truth layer and an aggregation+routing step
into the sync layer. The module boundary holds — marketplace consumes a new inventory
**aggregation service**, never reaches into location tables.

- **Rollup to channels:** channel available = `SUM(Inventory.availableStock)` over locations
  mapped to that connection (or, absent a mapping, all `isSellable` locations). The propagate
  flow (`inventory-server.service.ts` → `enqueuePropagateInventoryStock` → worker) changes to
  compute the rollup before enqueue. Published value = `clamp(sum − buffer, 0)` (buffer
  deferred, seam kept).
- **Allocation (which location fulfills) — keep it dead simple for v1:** marketplace orders
  ship from the **marketplace's own** warehouse (Falka doesn't route those), so the fulfilling
  internal location is simply the connection-mapped location. POS sells from the terminal's
  location. PO receives into the PO's destination location. No ranked-routing engine until
  Falka self-fulfills.
- **Per-location lifecycle:** every Tx method in `inventory-server.service.ts` gains a
  `locationId` param; each call site injects it — order reserve/ship/release
  (`applyOrderReserveTx/ShipTx/ReleaseTx`), POS (`applyOfflineSaleTx/Reversal`), PO receive
  (`adjustIncomingTx/applyPurchaseReceiveTx`), returns (`applyReturnRestockTx/DamagedTx`),
  opname (`applyReconcileTx`). Idempotency stamps (`inventoryAppliedAt/Shipped/Reverted`) still
  work, now carrying which location absorbed the move.
- **Default-location backfill (the migration that keeps single-pool data working):** create one
  default `StockLocation` per org ("Gudang Utama"); stamp every existing `Inventory` +
  `StockLedger` row with it; the connection's `syncWarehouseCode` becomes the one
  `MarketplaceWarehouseMapping` row. With exactly one location, the rollup SUM is the identity,
  the ledger `locationId` is constant, and behavior is byte-for-byte today's — the toggle stays
  OFF and the dimension is invisible until the seller opts in.

## Phased plan

| Phase                                                  | Goal                                                                                                                                      | Effort | Touches core invariant |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------- |
| **P0** Warehouse entity + default-location backfill    | Introduce `StockLocation`, backfill 1/org, stamp rows. No behavior change; toggle OFF.                                                    | M      | yes                    |
| **P1** Stock-per-location writes + rollup reads        | `@unique([variantId,locationId])`; `locationId` through all ~12 Tx methods + ~15 call sites; reads SUM across locations.                  | XL     | yes                    |
| **P2** Channel→warehouse mapping (generalize Option A) | `MarketplaceWarehouseMapping`; push sum-over-mapped-sellable-locations; payload sets sellable per mapped code, leaves unmapped untouched. | L      | yes                    |
| **P3** Inter-location transfers                        | `StockTransfer` + `TRANSFER` reason; double-entry tx; DRAFT→IN_TRANSIT→RECEIVED; scan-to-transfer reuse.                                  | L      | no                     |
| **P4** Per-location opname + reports                   | `StockOpname.locationId`; per-location low-stock/reorder; location filter on activity log.                                                | M      | no                     |
| **Later** Full WMS (bins/pick/pack)                    | Only if a segment crosses ~1,000 orders/mo. Strictly additive; nests inside multi-location like Option A nests inside it.                 | XL     | no                     |

## Relation to the Lazada fix (Option A)

Option A (designate ONE Lazada warehouse per connection, push internal `available` there,
**never touch** the others) is **provably the n=1 case** of the full model: one internal
location ⇒ per-(variant,location) `Inventory` collapses to today's per-variant row, ledger
`locationId` is constant, the rollup SUM is over one location (identity), allocation always
returns that location, and the mapping is the single `(location→warehouseCode)` pair. **Every
Option A construct is the 1-row instance of a general-n construct**, so shipping A first costs
nothing against the eventual model — it's a forward-compatible seam, not a dead end.

> Nuance: today's `syncWarehouseCode` is the **seam**, not yet a true rollup instance. P2 is
> where "push the pool to one warehouse" generalizes to "push `sum(available of locations
mapped to this warehouseCode)` to each mapped warehouseCode."

**Ship A first — do not wait for P1.** (1) The Lazada wall is a **live, active** correctness
bug (multi-warehouse SKUs never reconcile). (2) A is non-destructive by construction (blast
radius = `stock-payload.ts` + an existing per-connection field). (3) It is **not** established
this seller holds stock in ≥2 **physical** places — the wall is **channel-side**, which does
not by itself justify P1–P4. Run `scripts/lazada-mw-probe.mjs read` to settle physical need
before committing to the WMS build.

## Pricing / packaging

Mirror the **SMB-inventory** norm, not the WMS norm:

1. **Multi-location = core/standard**, behind a single org-level **"Multi-lokasi" toggle**
   (default OFF = today's single-pool, one implicit warehouse). Progressive disclosure: single-
   location sellers never see warehouses/transfers/location pickers until they opt in.
2. If monetized, gate by **location count** (Zoho 2/4/6/10 + ~$10/location; Shopify count
   caps), **never per-order**. Clean model: base = 1 location, paid tier unlocks N.
3. Reserve any true **bin/pick/pack WMS** as a **separate, clearly-bounded "Falka WMS"
   module/tier** — build only on real demand (≥~1,000 orders/mo).
4. The **Lazada per-connection mapping is plumbing, not a paid feature** — it should work on
   any tier so multi-warehouse Lazada SKUs reconcile regardless.

## Risks

- **P1 is XL** and touches `Inventory @unique([variantId])` + the single-pool reading of HARD
  CONSTRAINT #6 — `locationId` through 12 Tx methods + 15+ call sites across 5 modules; a missed
  call site silently writes to the wrong/default location.
- **Demand uncertainty:** not confirmed this seller has ≥2 physical locations. Building P1–P4 on
  a channel-side wall risks an expensive solution to a problem they may not have.
- **Backfill correctness:** the default-location backfill must stamp every `Inventory` +
  `StockLedger` row atomically; a partial backfill leaves null-location rows the rollup
  mis-sums.
- **Rollup decision** (SUM-on-read vs stored cache) is costly to undo if picked wrong early.
- **Allocation policy** under-specified for self-fulfilled channels (v1 ducks it).
- **Oversell-during-sync-lag** widens with N locations + per-channel pushes (buffers deferred).
- **Lazada XML semantics:** P2's per-mapped-warehouse payload needs fresh live read-back
  validation (Lazada silently ignores unknown elements, returns `code:0`).
- **Scope creep into full WMS** once locations exist — needs a firm packaging boundary.

## Open product decisions

1. **Does this seller hold stock in ≥2 physical locations today**, or is the Lazada wall purely
   channel-side? Run mw-probe read first — if single-physical-location, **ship Option A and
   defer P1–P4** as future insurance. _(This is the gating question.)_
2. Rollup **SUM-on-read vs stored cache**? (Recommend SUM-on-read for v1.)
3. Keep `syncWarehouseCode` as the degenerate single row, or hard-migrate to
   `MarketplaceWarehouseMapping` at P2? (Recommend keep during transition.)
4. Two-phase transfers (Transit pseudo-location) vs single-step atomic? (Single-step simpler.)
5. Lots/batches/serials/expiry — separate **category-driven** axis; in scope only for
   cosmetics/F&B/pharma sellers. Decide separately.
6. Packaging: base = 1 location + toggle, paid unlocks N? Or multi-location free at parity with
   iSeller/Olsera/Shopify and monetize elsewhere?
7. Per-channel safety-stock buffers/caps — keep the seam now, build later, or a simple fixed
   buffer at P2?
8. Default location for returns/opname/PO when unspecified — inherit from source, force
   selection, or org default?
9. Model marketplace fulfillment centers as logical `StockLocation`s, or keep them purely as
   external `warehouseCode`s in the mapping table?
