/** One mapped listing prepared for drift comparison (internal side). */
export type DriftMappedInput = {
  marketplaceProductId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  /** Internal sellable stock — the source of truth. */
  internalAvailable: number;
  syncEnabled: boolean;
};

/** One listing as currently reported by the provider (external side). */
export type DriftExternalInput = {
  externalProductId: string;
  externalVariantId: string;
  stock: number;
};

/**
 * Resolves the external stock to compare against internal available. Falka owns exactly ONE
 * marketplace warehouse: when a `syncWarehouseCode` is configured, drift must compare against
 * that warehouse's OWN sellable (0 when the SKU doesn't carry it), NOT the cross-warehouse sum
 * — otherwise other warehouses' stock would always read as drift. Without a sync warehouse (or
 * per-warehouse data) it falls back to the total sellable. Shared by the web on-demand
 * drift-check and the worker reconciliation job so both compute the external value identically.
 */
export function resolveSyncWarehouseStock(
  listing: { stock: number; warehouses?: { code: string; sellable: number }[] | null },
  syncWarehouseCode: string | null | undefined,
): number {
  const code = syncWarehouseCode?.trim();
  if (code && listing.warehouses) {
    return listing.warehouses.find((warehouse) => warehouse.code === code)?.sellable ?? 0;
  }
  return listing.stock;
}

export type StockDriftStatus = 'in_sync' | 'over' | 'under' | 'missing_external';

export type StockDriftLine = {
  marketplaceProductId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  internalAvailable: number;
  /** Provider-reported stock, or null when the listing is gone from the pull. */
  externalStock: number | null;
  /** externalStock - internalAvailable; null when missing on the marketplace. */
  delta: number | null;
  status: StockDriftStatus;
  syncEnabled: boolean;
};

export type StockDriftSummary = {
  totalMapped: number;
  inSync: number;
  /** Mapped listings whose external stock differs from internal available. */
  drifted: number;
  /** Mapped listings no longer present in the provider pull. */
  missingExternal: number;
  /** External listings not mapped to any internal variant. */
  unmappedExternal: number;
  /** Worst offenders first: bigger drift, then missing, then in-sync. */
  lines: StockDriftLine[];
};

function externalKey(productId: string, variantId: string): string {
  return `${productId}::${variantId}`;
}

function driftStatus(delta: number): StockDriftStatus {
  if (delta === 0) return 'in_sync';
  return delta > 0 ? 'over' : 'under';
}

/** Sort rank: big drifts first, then missing listings, then in-sync. */
function severity(line: StockDriftLine): number {
  if (line.status === 'in_sync') return 0;
  if (line.status === 'missing_external') return 1;
  return 2 + Math.abs(line.delta ?? 0);
}

/**
 * Compares a connection's mapped listings against a fresh provider pull, with NO
 * side effects. `over` = the marketplace shows MORE than we hold (oversell risk);
 * `under` = it shows less (lost-sale risk); `missing_external` = the listing
 * vanished from the pull. Internal `available` stays the source of truth — this
 * only surfaces drift; correcting it is a separate, user-driven re-sync.
 */
export function computeStockDrift(input: {
  mapped: DriftMappedInput[];
  external: DriftExternalInput[];
}): StockDriftSummary {
  const externalByKey = new Map<string, number>();
  for (const row of input.external) {
    externalByKey.set(externalKey(row.externalProductId, row.externalVariantId), row.stock);
  }

  const mappedKeys = new Set<string>();
  const lines: StockDriftLine[] = [];

  for (const m of input.mapped) {
    const key = externalKey(m.externalProductId, m.externalVariantId);
    mappedKeys.add(key);

    const found = externalByKey.get(key);
    const externalStock = found ?? null;
    const delta = externalStock === null ? null : externalStock - m.internalAvailable;
    const status: StockDriftStatus = delta === null ? 'missing_external' : driftStatus(delta);

    lines.push({
      marketplaceProductId: m.marketplaceProductId,
      externalProductId: m.externalProductId,
      externalVariantId: m.externalVariantId,
      externalSku: m.externalSku,
      variantId: m.variantId,
      variantSku: m.variantSku,
      variantName: m.variantName,
      productName: m.productName,
      internalAvailable: m.internalAvailable,
      externalStock,
      delta,
      status,
      syncEnabled: m.syncEnabled,
    });
  }

  // Count DISTINCT external keys (externalByKey is already deduped) so a provider
  // that repeats a SKU row can't inflate the "unmapped" tally.
  let unmappedExternal = 0;
  for (const key of externalByKey.keys()) {
    if (!mappedKeys.has(key)) unmappedExternal += 1;
  }

  lines.sort((a, b) => severity(b) - severity(a));

  return {
    totalMapped: input.mapped.length,
    inSync: lines.filter((line) => line.status === 'in_sync').length,
    drifted: lines.filter((line) => line.status === 'over' || line.status === 'under').length,
    missingExternal: lines.filter((line) => line.status === 'missing_external').length,
    unmappedExternal,
    lines,
  };
}
