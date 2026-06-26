# Lazada order pull — design, status & known issues

Status: **shipped on branch `session/2026-06-23-lazada-orders` (UNPUSHED at write time, 2026-06-26).**
Real, env-gated Lazada order-pull adapter + pull strategy + per-status UI + an adversarial bug-hunt
pass (Batch 1+2 fixed). Owner visual-QA + push/PR still owed. Detail rules:
`.cursor/rules/40-inventory-marketplace.mdc` (orders bullet). Lazada API/OAuth/test facts:
the `olshop-lazada-integration` memory.

## What it is

Before this work, `getMarketplaceOrderAdapter` returned a **stub** for every provider — order pull
was simulated. Now LAZADA has a real adapter; SHOPEE/TOKOPEDIA still stub (no live creds).

### Layers

- **Provider fetcher** `packages/marketplace-providers/src/lazada/orders.ts`
  - `fetchLazadaOrders(client, { updateAfter|createdAfter, onThrottle }) → { records, complete }`.
  - Two round-trips: `/orders/get` (headers only, paged ASC by `updated_at`) → `/orders/items/get`
    (batch-hydrate items). Lazada returns **one object per physical unit** with NO quantity field →
    `aggregateLines` collapses units into per-SKU lines (quantity = count).
  - `complete=false` when the page loop broke early (throttle-tail partial / `MAX_PAGES` cap) — the
    caller must not advance its cursor past the un-fetched newest tail.
  - Shares the signed `createLazadaClient` + `throttle.ts` retry policy with the listings fetcher.
- **Adapter** `apps/web/src/modules/orders/adapters/lazada-order-adapter.ts`
  - `LazadaOrderRecord → NormalizedOrder`: status reduction (`reduceLazadaStatuses`, least-progressed
    non-cancelled wins; `pending`/`packed`/`ready_to_ship`/`confirmed` = PAID, `shipped` = SHIPPED,
    `delivered` = COMPLETED, `canceled`/`returned`/`failed` = CANCELLED), per-line status,
    `tracking_code` → noResi, `update_after` window from `since` (cursor) − 10 min overlap, 30-day first
    backfill. Env-gated by `LAZADA_APP_KEY`/`_APP_SECRET` (else stub) in `createOrderAdapter`.
- **Ingest** `apps/web/src/modules/orders/services/orders-server.service.ts`
  - `pullFromConnections(org, actor, { connectionIds?, full? })` → per connection
    `pullAndApplyConnection` → `pullOneConnection` (upsert + items + stock lifecycle) → propagate.
  - `runScheduledPull()` = the VPS scheduler entrypoint (all orgs, `connection.userId` as actor).

### Real Lazada order-item field shapes (probed from live `rawPayload`, 2026-06)

- `sku` = the **seller's SKU** (matches the internal catalog); `sku_id` = Lazada SkuId (= listing's
  external variant id); `shop_sku` = `<itemId>_<region>-<skuId>` composite. There is **NO `seller_sku`
  or standalone `item_id`** field (item_id is the shop_sku prefix → `deriveItemId`).
- header: `statuses[]`, `price` (string), `created_at`/`updated_at` (GMT+8), masked `customer_first_name`,
  `payment_method` (mostly `COD`), `shipping_fee`, `promised_shipping_times` (SLA), `warehouse_code`,
  `is_cancel_pending`, `buyer_note`, `order_number`. Per item: `shipment_provider`
  (`Drop-off: …, Delivery: <courier>` → take the Delivery part), `tracking_code`, `product_main_image`,
  `product_detail_url`, `reason`/`reason_detail`, `return_status`, per-item `status`.

## Key invariants (do NOT regress)

1. **Cursor advances only on a COMPLETE pull.** `ordersSyncedThrough` is the incremental watermark,
   decoupled from the 30s cooldown (`lastOrdersPulledAt`). Advanced to pull-start **only** when the
   adapter reports `complete`. A truncated pull leaves it so the next run re-covers the tail.
2. **A reserved order's line set is FROZEN.** Items are re-resolved + delete/recreated only while
   `inventoryAppliedAt` is null. Once reserved, carry **qty + variant + unitCost (COGS snapshot)**
   forward (never wipe/downgrade); a line that maps later gets a **reserve-delta**, and ship/release run
   off the frozen set. (Re-resolving reserved items previously wiped COGS + leaked reserved stock.)
3. **Per-line status drives partial-cancel.** `NormalizedOrderItem.status` (Lazada per item): a line
   cancelled inside an otherwise-shipped order is RELEASED, not consumed.
4. **Ambiguous seller-SKU stays unresolved.** The seller-SKU fallback (`sku` → `externalSku`) resolves a
   line the `(productId, variantId)` join misses, but if one externalSku maps to 2 variants it is dropped
   (never a wrong-variant guess); the line surfaces via `unresolvedCount`.
5. **Stock lifecycle stays idempotent** via `Order.inventoryAppliedAt`/`inventoryShippedAt`/
   `inventoryRevertedAt`; reserve/release propagate to OTHER channels (`excludeConnectionId`), ship does
   not. `fulfilledAt` stamps ONLY when a COMPLETED Recording exists for the resi.

## Schema (migration `20260624000000_add_order_external_updated_at`, applies on deploy)

- `Order.externalUpdatedAt` (marketplace `updated_at`; recency sort `desc NULLS LAST, placedAt, id`).
- `Order.unitCost` per item carries the COGS snapshot (pre-existing; now preserved across re-pull).
- `MarketplaceConnection.ordersSyncedThrough` (incremental cursor).

## UI / read-time enrichment (no schema)

Per-status detail (SLA/courier/payment/buyer note/cancel reason) + per-item photo + storefront link are
extracted from `Order.rawPayload` at read-time (`extractOrderMarketplaceMeta` / `extractOrderItemMedia`).
List: marketplace + store filters, "Status stok" column, "Diupdate" column, "Tarik ulang semua" (full)
toggle, per-store last-pull in the pull dialog. Peek can Kaitkan + deep-link to the recording station
(`/recordings?resi=`).

## Testing (sandbox)

Lazada test orders are created from the **App Console → Test Tools → Create Test Order** (COD default,
born PENDING/actionable) — NOT storefront checkout (a test buyer is blocked from online/prepaid). Then
advance in the test Seller Center (pack → Ready To Ship → shipped for self-delivery products). Probe
scripts (uncommitted, under `packages/db/scripts/`): `order-health.ts`, `validate-order.ts [orderId]`.

## Adversarial bug-hunt outcome (2026-06-26)

A 38-agent review found **22 confirmed bugs**. **Batch 1+2 fixed** (commits on the branch): cursor-on-
partial (#1), freeze + reserve-delta (#2/#3/#4/#11), per-line cancel + ambiguous-SKU (#5/#6), and a LOW
robustness batch (sort tiebreak, media key fallback, readString trim, parseCourier guard, deriveItemId
fallback, placedAt-not-rewritten). Plus the earlier fulfilledAt false-stamp fix.

### Deferred / open

- **Batch 3 — VPS hardening:** the `server.ts` loopback fetch now has an `AbortSignal.timeout`
  (2026-06-26) so a hung request can't wedge auto-pull. **Still deferred to the VPS cutover** (they
  need a `turbo.json` env declaration, so confirm under HARD CONSTRAINT #3 then): a dedicated
  `INTERNAL_PULL_SECRET` (instead of reusing `AUTH_SECRET`) + a rate-limit + **404 on Vercel** (the
  internal `/api/v1/internal/pull-orders` endpoint is reachable on Vercel where nothing calls it).
- **#7 (skipped, safe):** an items-fetch throttle THROWS → the cursor isn't advanced → safe retry.
  Making it `partial` risks the freeze interaction (a reserved order returned with empty lines), so left
  as-is. Revisit only if a very busy shop perpetually re-throttles the items phase.
- **snapshotOrderItemCostsTx** overwrites all same-variant lines of an order (narrow low — the manual
  `resolveOrderItem` path, two listings→one variant + a cost change between). Snapshot by orderItem id.
- **VERIFY against more live data:** exact field casing per region, the GetMultipleOrderItems batch cap
  (set 20), the real SHIPPED/DELIVERED pull (the test shop's drop-off orders don't reach `shipped` in
  sandbox — needs a self-delivery test order or a real shipment).

## Next steps

1. Owner visual-QA on the branch, then **push + PR to main**.
2. With the VPS cutover: Batch 3 hardening + turn on `ORDERS_AUTO_PULL_INTERVAL_MS`; then the **Lazada
   webhook** (Trade Order notification) as the real-time path with this poll as the reconciliation
   backstop.
