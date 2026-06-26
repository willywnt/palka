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
- **Auto-generation on the 1st is the VPS-era step** (a worker/cron) — not built (dormant on Vercel).
- Built understand-from-context → implement → 4-reviewer adversarial review (idempotency / RBAC /
  schema / conventions all clean; one low note acted on: a schema comment warns `migrate dev` not to
  drop the raw-only partial index, since deploy replays SQL forward and keeps it). Migration
  `20260627090000_add_expense_templates` (additive). Tests: generation idempotency + day clamp
  (short/leap Feb) + active-only + CRUD.

## 🔭 Phase 2 — backlog (prioritized)

| #   | Item                         | Effort | Gate | Notes                                                                                                                                                                                                     |
| --- | ---------------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Auto-derived fees**        | M      | 🟡   | Auto-create opex from data we already have: marketplace commission per shipped order, QRIS/payment fee per POS sale. Needs a per-channel fee-rate config + idempotent generation. Migration (fee config). |
| 2   | **Expense → order/sale ref** | S      | 🟡   | Optional FK from an expense to the order/sale it relates to (traceability). Migration. Pairs naturally with auto-derived fees.                                                                            |
| 3   | **Budget vs actual**         | L      | 🟡   | Per-category monthly budgets + variance in the report. Migration.                                                                                                                                         |

Order of pull: Phase 2a (filter/CSV/home card) + 2b (recurring) shipped. Remaining items all need a
schema migration: **auto-derived fees (#1)** is the highest-value (accurate net without manual input)
but larger; expense→order ref (#2) is its natural foundation; budget (#3) is multi-session.
