/**
 * SKU matching for auto-mapping. Intentionally NOT character-distance fuzzy:
 * SKUs that differ by one character usually denote a different variant
 * (`...-M` vs `...-L`, `-38` vs `-39`), so edit-distance matching would wrongly
 * merge them. Instead we match on *format-normalized* forms:
 *  - EXACT      raw strings are identical.
 *  - NORMALIZED same after stripping case + separators, OR same token set
 *               regardless of order. Flagged for review, never sync-trusted.
 *
 * Shared by the web import service (auto-map on the request path) and the worker
 * import job, so both classify a match identically.
 */
const SEPARATORS = /[\s_\-./]+/g;
const SPLIT = /[\s_\-./]+/;

/** Case + separator insensitive (KAOS-BLK-M = kaos_blk_m = "KAOS BLK M" = KAOSBLKM). */
export function normalizeSkuCompact(sku: string): string {
  return sku.trim().toUpperCase().replace(SEPARATORS, '');
}

/** Order-insensitive token key (BLK-KAOS-M = KAOS-BLK-M). */
export function skuTokenSetKey(sku: string): string {
  return sku.trim().toUpperCase().split(SPLIT).filter(Boolean).sort().join('|');
}

export type SkuMatchQuality = 'EXACT' | 'NORMALIZED';
export type SkuMatch = { variantId: string; quality: SkuMatchQuality };

export type VariantSkuIndex = {
  byRaw: Map<string, string>;
  /** key -> variantId, or null when two variants collide on the key (ambiguous). */
  byCompact: Map<string, string | null>;
  byTokenSet: Map<string, string | null>;
};

function addKey(map: Map<string, string | null>, key: string, variantId: string): void {
  if (!key) return;
  // A key shared by two variants is ambiguous — never auto-map it.
  map.set(key, map.has(key) ? null : variantId);
}

export function buildVariantSkuIndex(
  variants: ReadonlyArray<{ id: string; sku: string }>,
): VariantSkuIndex {
  const index: VariantSkuIndex = {
    byRaw: new Map(),
    byCompact: new Map(),
    byTokenSet: new Map(),
  };

  for (const variant of variants) {
    index.byRaw.set(variant.sku, variant.id);
    addKey(index.byCompact, normalizeSkuCompact(variant.sku), variant.id);
    addKey(index.byTokenSet, skuTokenSetKey(variant.sku), variant.id);
  }

  return index;
}

/** Resolves the best (and unambiguous) internal variant for an external SKU. */
export function matchSku(externalSku: string, index: VariantSkuIndex): SkuMatch | null {
  const exact = index.byRaw.get(externalSku);
  if (exact) return { variantId: exact, quality: 'EXACT' };

  const compact = index.byCompact.get(normalizeSkuCompact(externalSku));
  if (compact) return { variantId: compact, quality: 'NORMALIZED' };

  const tokenSet = index.byTokenSet.get(skuTokenSetKey(externalSku));
  if (tokenSet) return { variantId: tokenSet, quality: 'NORMALIZED' };

  return null;
}
