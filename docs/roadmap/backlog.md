# Falka — Product Backlog

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
  - `docs/roadmap/falka-redesign.md` + memory `falka-redesign-suar-dermaga`.
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

## 🎯 Mid-size features (1 session each)

| #   | Item                                                              | Module            | Effort | Gate | Notes                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------- | ----------------- | ------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Per-channel performance report**                                | reporting         | M      | 🟢   | Beyond profit-by-channel: payment-method mix, return rate by channel, fulfillment time, turnover. Charts (see redesign). (Partly shipped: revenue share, AOV, return rate, trend matrix.)    |
| 2   | **Phase 6: scheduled reconciliation + provider-health dashboard** | queue/marketplace | L      | 🟢   | Daily per-connection drift detect (pull external → compare → log); connection test endpoint (Lazada `validateStockSync` exists, unused) + health widget. High-value once real adapters live. |
| 3   | **Supplier entity + per-supplier lead time**                      | purchasing        | L      | 🟡   | `Supplier` + `PurchaseOrder.supplierId`; per-supplier `leadTimeDays`/MOQ the reorder report prefers over the variant default. (Free-text `supplierName` today.) Precursor to AP.             |

> _Shipped from this table: **Dead-stock & ABC analysis** + **Stock opname / cycle count** (2026-06-11)._

## 🛰️ Big bets (multi-session / gated, sequenced later)

| #   | Item                                                                        | Effort   | Gate | Notes                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | -------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Notification engine** (in-app tray + WhatsApp)                            | L        | 🔴   | Low-stock / new-order / return / below-cost / dead-connection alerts + preferences. `Notification`/`NotificationPreference` + a send worker + a topbar tray. In-app tray can ship un-gated; **WhatsApp Business approval (Meta, slow in ID)** gates the WA channel. The retention hook. |
| B   | **Marketplace token auto-refresh + OAuth callback**                         | L        | 🔴   | `encryptedRefreshToken` is stored but unused; real connections die on expiry. Scheduled refresh worker + per-provider OAuth callback routes. Pairs with the shipped token-expiry guard.                                                                                                 |
| C   | **Real Shopee / Tokopedia / TikTok adapters**                               | L (each) | 🔴   | Only Lazada is real (sandbox). Each needs OAuth + signed client + import + stock-sync + webhook/poll. **Start Shopee partner paperwork now — 6–12 wk lead time.** Lift token-crypto already done (`@falka/utils/crypto`).                                                               |
| D   | **Courier aggregator (Biteship / RajaOngkir) + AWB at the packing station** | L        | 🔴   | Rate lookup, courier select, print AWB where `noResi` appears. `CourierProvider` + `ShippingLabel`. Needs API key/sandbox.                                                                                                                                                              |
| E   | **Multi-location / warehouse stock + transfers**                            | L        | 🟡   | Scope stock to `(variantId, locationId)`, `StockTransfer` ledger reason, location-aware pickers, per-location available summed to each channel. Foundational — rewrites inventory queries; sequence after Phase 6.                                                                      |
| F   | **Supplier accounts-payable** (3-way match, terms, aging)                   | L        | 🟡   | Builds on #7 Supplier. PO→invoice→payment, due dates, AP ledger, aging. Month-end reconciliation.                                                                                                                                                                                       |
| G   | **Organization + team RBAC → public API → SaaS billing**                    | XL       | 🔴   | Strictly single-user (`userId` everywhere). `Organization`/`TeamMember`/role, org-scoped queries, API-key auth, usage/tier gating. Biggest refactor; gated on the decision to go multi-tenant (locked internal-first today).                                                            |
| H   | **AI mismatch detection on packing video**                                  | XL       | 🔴   | CV/OCR auto-flag item/qty mismatches vs the order → automated dispute defense. `aiProcessing`/`ocrProcessing` placeholders reserved. Needs a CV API + review-queue UX.                                                                                                                  |

## ⚡ Quick wins (sub-hour)

- Archived-variant view + restore on product detail 🟢 (needs a new unarchive service+route — SKU
  un-mangle + collision check; not a true sub-hour, scope before picking up).
- _(shipped 2026-06-11: marketplace sync-health badge · below-cost alert at sale-create ·
  `grup · subvarian` picker label.)_
- _(shipped 2026-06-12: `@@index([userId, createdAt])` on `StockLedger` — serves the userId-scoped
  newest-first activity-log scans the reason-prefixed index can't order.)_

## Locked decisions (don't relitigate without a reason)

Internal-first / per-user-scoped (no org yet) · adapter-first + stubs until partner approval · append-only
`StockLedger` is the SoT, `Inventory` is the fast-read cache · returns net the profit report by
`processedAt` on still-shipped/completed orders · post-ship cancel = a return, not a release.
