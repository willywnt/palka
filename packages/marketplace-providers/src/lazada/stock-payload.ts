function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type LazadaStockPayloadInput = {
  /** Seller SKU (preferred identity). */
  externalSku?: string | null;
  /** Lazada item_id — used with externalVariantId when there is no SellerSku. */
  externalProductId?: string | null;
  /** Lazada SkuId — used with externalProductId when there is no SellerSku. */
  externalVariantId?: string | null;
  quantity: number;
};

/**
 * LazOP `/product/price_quantity/update` payload. Lazada DEPRECATED SellerSku for this
 * endpoint (E0501: "The SellerSku parameter is no longer supported. Please update your
 * parameter to use SkuId"), so identify by ItemId + SkuId; SellerSku is only a last-resort
 * fallback for the rare case an item/sku id is missing. Shared by the worker stock provider
 * and the dev verification script so the payload we test is exactly the one that ships.
 */
export function buildLazadaQuantityPayload(input: LazadaStockPayloadInput): string {
  const identity =
    input.externalProductId && input.externalVariantId
      ? `<ItemId>${escapeXml(input.externalProductId)}</ItemId>` +
        `<SkuId>${escapeXml(input.externalVariantId)}</SkuId>`
      : `<SellerSku>${escapeXml(input.externalSku ?? '')}</SellerSku>`;

  return `<Request><Product><Skus><Sku>${identity}<Quantity>${input.quantity}</Quantity></Sku></Skus></Product></Request>`;
}
