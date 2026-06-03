-- DropIndex
DROP INDEX "stock_ledger_entries_userId_idx";

-- CreateIndex
CREATE INDEX "stock_ledger_entries_userId_reason_createdAt_idx" ON "stock_ledger_entries"("userId", "reason", "createdAt");
