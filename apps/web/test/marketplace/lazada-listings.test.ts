import { fetchLazadaListings } from '@falka/marketplace-providers';
import type { LazadaClient } from '@falka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the multi-warehouse capture in the Lazada listings parser: each SKU's
 * `multiWarehouseInventories[]` is flattened to a deduped `warehouseCodes` list (blank
 * codes dropped, FBL warehouses excluded) so stock sync knows which warehouses to zero.
 * Field shapes (multiWarehouseInventories / warehouseCode / fblWarehouseInventories) are
 * the real ones observed on the live seller account 2026-06-16.
 */
function fakeClient(products: unknown[]): LazadaClient {
  let page = 0;
  return {
    // First page returns the products; the parser stops once a page is short (< 50).
    call: async () => {
      const data = page === 0 ? { products } : { products: [] };
      page += 1;
      return { code: '0', raw: { data }, data } as never;
    },
  };
}

describe('fetchLazadaListings — multi-warehouse capture', () => {
  it('captures deduped warehouseCodes, drops blanks, and excludes FBL', async () => {
    const items = await fetchLazadaListings(
      fakeClient([
        {
          item_id: 8800780845,
          attributes: { name: 'Multi WH product' },
          skus: [
            {
              SkuId: 16243014036,
              SellerSku: 'MW-1',
              quantity: 1781,
              multiWarehouseInventories: [
                { warehouseCode: 'dropshipping', sellableQuantity: 1781 },
                { warehouseCode: 'ID67YE4SPX-WH-10010', sellableQuantity: 0 },
                { warehouseCode: 'ID67YE4SPX-WH-10010', sellableQuantity: 0 }, // dup
                { warehouseCode: '   ', sellableQuantity: 0 }, // blank
              ],
              fblWarehouseInventories: [{ sellableQuantity: 99 }], // FBL: must be ignored
            },
          ],
        },
      ]),
      { accessToken: 'tok' },
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.warehouseCodes).toEqual(['dropshipping', 'ID67YE4SPX-WH-10010']);
    expect(items[0]?.quantity).toBe(1781);
  });

  it('returns an empty warehouseCodes list for a single-warehouse or non-multi SKU', async () => {
    const items = await fetchLazadaListings(
      fakeClient([
        {
          item_id: 1,
          attributes: { name: 'Single' },
          skus: [
            {
              SkuId: 10,
              quantity: 9,
              multiWarehouseInventories: [{ warehouseCode: 'dropshipping', sellableQuantity: 9 }],
            },
            { SkuId: 11, quantity: 0 }, // no warehouse array at all
          ],
        },
      ]),
      { accessToken: 'tok' },
    );

    expect(items.find((i) => i.skuId === '10')?.warehouseCodes).toEqual(['dropshipping']);
    expect(items.find((i) => i.skuId === '11')?.warehouseCodes).toEqual([]);
  });
});
