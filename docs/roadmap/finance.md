# Keuangan / True Net P&L — status & roadmap

> Companion to [`backlog.md`](./backlog.md). The finance module completes the profit story:
> Palka tracked gross profit (revenue − COGS); now it tracks **operating expenses** too, so
> **net profit = gross profit − Σ opex** — whether the shop is actually making money.

## ✅ Phase 1 — SHIPPED 2026-06-26 (branch `session/2026-06-26-finance-net-pl`)

- **`modules/finance`** — an org-scoped, soft-deleted `Expense` ledger (`ExpenseCategory` enum:
  advertising/packaging/shipping-subsidy/salary/rent/marketplace-commission/payment-fee/
  utilities/other; amount Decimal(14,2) + date + note). CRUD service/validators/types/errors/hooks,
  routes `GET/POST /api/v1/expenses` + `GET/PATCH/DELETE /[id]`, a "Pengeluaran" page at
  `/dashboard/finance/expenses` (nav "Keuangan") with list + form-dialog + soft-delete.
- **Net P&L report** (in `reporting`, under the **Laporan** nav group) at
  `/dashboard/reports/net-profit`: `getNetProfitReport` reuses `getProfitReport` (revenue−COGS) and
  subtracts `expenseServerService.listExpenseLines` over the same range via the pure
  `aggregateNetProfit` util (same `money()` rounding → reconciles). StatCards (omzet → laba kotor →
  biaya → laba bersih + net margin), expense-by-category table, per-period net trend.
- **RBAC**: `finance.view` (VIEW) + `finance.manage` (ACTION) — catalog now 13 keys; ADMIN-on /
  STAFF-off. Migration `20260626100000_add_expense_ledger` (additive).
- Memory: `olshop-finance-net-pl`. Owner push + visual-QA owed.

## ✅ Phase 2a — SHIPPED 2026-06-26 (quick wins, same branch)

- **Ledger filter UI** — date-range + category filters on the Pengeluaran page (`useExpensesQuery`
  already accepted them), with a running total of the filtered rows + a distinct "no match" empty state.
- **CSV export** — an "Ekspor CSV" button → `GET /api/v1/expenses/export` (finance.view) honoring the
  active filters; pure `expensesToCsv` (RFC-4180 escaping, CRLF, ISO dates, id-ID labels). Unit-tested.
- **Net P&L home mini-card** — a "Keuangan · bulan ini" card on the dashboard home (after the work
  queue) showing this month's net profit + omzet + biaya + margin, reusing `useNetProfitReportQuery`
  (monthly, since opex is monthly). Gated `finance.view` at the call site so STAFF never sees it nor
  fires the gated fetch; the panel links to the full report. (Tutup hari recap deliberately NOT touched
  — it's daily, where net ≈ gross since opex is monthly, and it's gated `reports.view` not `finance.view`.)
  Built understand→implement→adversarial-review (3 reviewers clean: no STAFF money-leak).

## ✅ Phase 2b — SHIPPED 2026-06-27 (recurring expenses)

- **`ExpenseTemplate`** — a recurring monthly opex definition (sewa/gaji): category + amount +
  `dayOfMonth` + note + `isActive`, org-scoped + soft-deleted. NOT a ledger row — it only GENERATES
  expenses. A "Biaya berulang" panel on the Pengeluaran page does CRUD (gated `finance.manage`).
- **"Buat bulan ini"** — `generateForMonth(org, actor, "YYYY-MM")` materializes the active templates
  into `Expense` rows for the month (date = `dayOfMonth` clamped to the month). **Idempotent**:
  `Expense` gained `templateId` + `periodMonth`, and a PARTIAL unique index `(templateId, periodMonth)
WHERE both set AND deletedAt IS NULL` (one live generated expense per template per month; manual rows
  excluded; regen-after-delete allowed) backs a pre-filter + `createMany skipDuplicates`. Confirm
  dialog; re-clickable safely.
- **Auto-generation on the 1st is the VPS-era step** (a worker/cron) — the worker host now exists on the VPS; not built yet.
- Built understand-from-context → implement → 4-reviewer adversarial review (idempotency / RBAC /
  schema / conventions all clean; one low note acted on: a schema comment warns `migrate dev` not to
  drop the raw-only partial index, since deploy replays SQL forward and keeps it). Migration
  `20260627090000_add_expense_templates` (additive). Tests: generation idempotency + day clamp
  (short/leap Feb) + active-only + CRUD.

## ✅ Phase 2c — SHIPPED 2026-06-27 (auto-derived fees)

- **Estimate-grade fees from configurable rates** (NOT actual provider-reported fees — our adapters
  don't receive them): `Organization.qrisFeeRate` + `MarketplaceConnection.commissionRate` (Decimal(5,2)
  percent, default 0). A "Fee otomatis" panel on the Pengeluaran page sets the QRIS rate + per-connection
  commission rates (diff-saved; commission rates routed through `marketplaceServerService.updateCommissionRate`).
- **"Hitung fee bulan ini"** — `deriveFeesForMonth(org, actor, "YYYY-MM")`: QRIS fee = gross QRIS sales
  (`salesServerService.sumQrisAmountForMonth`) × rate; commission = fulfilled order revenue per connection
  (`ordersServerService.sumRevenueByConnectionForMonth`, dated by `inventoryShippedAt`) × that rate. Each
  fee UPSERTs an `Expense` (PAYMENT_FEE / MARKETPLACE_COMMISSION) keyed by `Expense.autoSourceKey`
  (`qris-fee:<month>` / `mp-commission:<connId>:<month>`), backed by a PARTIAL unique index
  `(organizationId, autoSourceKey) WHERE …` — so a re-run refreshes the month's estimate, a zeroed rate
  soft-deletes the stale row, and a P2002 race converges. Monthly aggregate (one row per source/month),
  re-clickable safely. OWNER/ADMIN only.
- Built understand (5-scout data-source map) → implement → 4-reviewer adversarial review (schema/RBAC/
  conventions clean; **fixed a confirmed HIGH**: a rate turned to 0 left a stale commission row — now
  always-upsert soft-deletes it; plus a P2002 race-converge). Migration `20260627100000_add_auto_fee_config`
  (additive; 2nd raw-only partial index, same do-not-drop comment). Tests: QRIS/commission math + round2 +
  upsert + stale-cleanup + P2002.

## ✅ Phase 2d — SHIPPED 2026-06-27 (budget vs actual + source flagging)

- **Source flag** — `Expense` rows now show a "Berulang"/"Otomatis" StatusBadge (derived `source` from
  `templateId` / `autoSourceKey`) in the ledger + a "Sumber" column in the CSV, so generated/auto-fee rows
  are visually distinct from manual entries.
- **Budget vs actual** — a `Budget` model (one monthly budget per category, set once, applies every month;
  `@@unique([organizationId, category])`). A current-month **"Anggaran vs realisasi"** card on the Net P&L
  page: `getBudgetReport(org, month)` joins budgets with `expenseServerService.sumByCategoryForRange` (Σ
  live expenses — manual + recurring + auto-fee — per category) → per category anggaran/realisasi/sisa + a
  usage bar (amber ≥80%, red over-budget), over-budget first, + totals. An "Atur anggaran" dialog (9 inputs,
  gated `finance.manage`; amount 0 unsets). Month-scoped independent of the report's range picker (monthly
  budget vs monthly actual). `monthBounds`/`round2` were lifted to a shared `finance/utils/period`.
- Built implement → 3-reviewer adversarial review (correctness / RBAC / schema all clean). Migration
  `20260627110000_add_budgets` (additive). Tests: budget math + over-budget sort + unset-on-zero + list.

## 🔭 Phase 2 — backlog

| #   | Item                         | Effort | Gate | Notes                                                                                                                                                                                       |
| --- | ---------------------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Expense → order/sale ref** | S      | 🟡   | Optional FK from an expense to the order/sale it relates to (traceability). Migration. Low value now that fees derive as monthly aggregates (no per-event ref needed); a standalone nicety. |

Future (not backlog'd yet): auto-derive fees on a schedule (VPS worker) · per-payment-method fees beyond
QRIS (CARD) · per-month budget overrides (the current model is one budget per category, applied every month).
The finance module's core (ledger · Net P&L · recurring · auto-fees · budgets) is now feature-complete.
