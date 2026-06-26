# Keuangan / True Net P&L — status & roadmap

> Companion to [`backlog.md`](./backlog.md). The finance module completes the profit story:
> Falka tracked gross profit (revenue − COGS); now it tracks **operating expenses** too, so
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

## 🔭 Phase 2 — backlog (prioritized)

| #   | Item                         | Effort | Gate | Notes                                                                                                                                                                                                              |
| --- | ---------------------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Recurring expenses**       | M      | 🟡   | Mark an expense recurring (monthly sewa/gaji). v1 = a template + a one-click "add this month" (manual); **auto-generation needs the VPS worker/cron** (dormant on Vercel), so the auto part is VPS-era. Migration. |
| 2   | **Auto-derived fees**        | M      | 🟡   | Auto-create opex from data we already have: marketplace commission per shipped order, QRIS/payment fee per POS sale. Needs a per-channel fee-rate config + idempotent generation. Migration (fee config).          |
| 3   | **Expense → order/sale ref** | S      | 🟡   | Optional FK from an expense to the order/sale it relates to (traceability). Migration.                                                                                                                             |
| 4   | **Net P&L dashboard card**   | S      | 🟢   | A net-profit mini-card on the dashboard home / "Tutup hari" recap.                                                                                                                                                 |
| 5   | **Budget vs actual**         | L      | 🟡   | Per-category monthly budgets + variance in the report. Migration.                                                                                                                                                  |

Order of pull: the filter + CSV quick wins shipped (Phase 2a); next non-gated is the **dashboard card
(#4)**. **Recurring (#1)** is the highest-value but its auto-generation rides the VPS cutover;
auto-derived fees (#2) + budget (#5) are larger and need design.
