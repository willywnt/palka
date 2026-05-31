/** Reconciliation foundation — full jobs deferred. */
export type StockReconciliationCandidate = {
  mappingId: string;
  internalStock: number;
  marketplaceStock: number;
  delta: number;
};

export type StockReconciliationPreview = {
  accountId: string;
  provider: string;
  candidates: StockReconciliationCandidate[];
  mismatchCount: number;
};

export function detectStockMismatch(
  internalStock: number,
  marketplaceStock: number,
): StockReconciliationCandidate | null {
  if (internalStock === marketplaceStock) return null;

  return {
    mappingId: '',
    internalStock,
    marketplaceStock,
    delta: internalStock - marketplaceStock,
  };
}

export function buildReconciliationPreview(input: {
  accountId: string;
  provider: string;
  rows: Array<{ mappingId: string; internalStock: number; marketplaceStock: number }>;
}): StockReconciliationPreview {
  const candidates: StockReconciliationCandidate[] = [];

  for (const row of input.rows) {
    const mismatch = detectStockMismatch(row.internalStock, row.marketplaceStock);
    if (mismatch) {
      candidates.push({ ...mismatch, mappingId: row.mappingId });
    }
  }

  return {
    accountId: input.accountId,
    provider: input.provider,
    candidates,
    mismatchCount: candidates.length,
  };
}
