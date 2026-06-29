/**
 * SKU matching for auto-mapping lives in `@palka/marketplace-providers` so the web import
 * service AND the worker import job classify a match identically (shared, not duplicated).
 * Re-exported here so existing in-module imports (`../utils/sku-match`) keep working.
 */
export {
  buildVariantSkuIndex,
  matchSku,
  normalizeSkuCompact,
  skuTokenSetKey,
  type SkuMatch,
  type SkuMatchQuality,
  type VariantSkuIndex,
} from '@palka/marketplace-providers';
