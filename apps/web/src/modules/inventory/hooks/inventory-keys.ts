/**
 * Query-key hierarchy for the inventory domain. `variant(id)` covers a single
 * variant's snapshot + ledger view; `all` invalidates everything.
 */
export const inventoryKeys = {
  all: ['inventory'] as const,
  variant: (variantId: string) => ['inventory', 'variant', variantId] as const,
};
