export type ShopeeStockPayloadInput = {
  /** Shopee item_id — the external product id. */
  externalProductId: string;
  /** Shopee model_id — the external variant id; "0"/empty for a no-variation item. */
  externalVariantId?: string | null;
  /** Absolute sellable count to set (the internal `available`). */
  quantity: number;
  /**
   * Per-connection designated "sync warehouse" → Shopee `location_id`. When set, the
   * quantity is written to ONLY this location's `seller_stock`; other locations are
   * OMITTED and left untouched (non-destructive, like the Lazada multi-warehouse path).
   * null/undefined => single-location `seller_stock` with no `location_id`.
   */
  syncWarehouseCode?: string | null;
};

export type ShopeeSellerStockEntry = { location_id?: string; stock: number };

export type ShopeeStockUpdateBody = {
  item_id: number;
  stock_list: Array<{ model_id: number; seller_stock: ShopeeSellerStockEntry[] }>;
};

/** Parse a Shopee numeric id (item_id/model_id) defensively; 0 = no-variation model. */
function toNumericId(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/**
 * Builds the Shopee `/api/v2/product/update_stock` request body — sets a model's ABSOLUTE
 * sellable stock via `seller_stock` (what stock sync needs: push the internal `available`).
 * `seller_stock` is the current absolute-set field (it superseded the deprecated
 * `normal_stock`). A no-variation item uses `model_id: 0`.
 *
 * **Multi-location:** a Shopee shop can split stock across locations (`location_id`). With a
 * `syncWarehouseCode` configured, push the quantity to ONLY that `location_id` and omit the
 * rest (Shopee leaves omitted locations untouched); otherwise a single entry with no
 * `location_id`. Falka owns one location and never zeroes the others.
 *
 * NOTE: verify the exact `seller_stock`/`stock_list` field names against the live Shopee
 * Open Platform docs when wiring the sandbox — the v2 shape is stable but version-tagged.
 */
export function buildShopeeStockUpdateBody(input: ShopeeStockPayloadInput): ShopeeStockUpdateBody {
  const syncCode = input.syncWarehouseCode?.trim();
  const sellerStock: ShopeeSellerStockEntry = syncCode
    ? { location_id: syncCode, stock: input.quantity }
    : { stock: input.quantity };

  return {
    item_id: toNumericId(input.externalProductId),
    stock_list: [{ model_id: toNumericId(input.externalVariantId), seller_stock: [sellerStock] }],
  };
}
