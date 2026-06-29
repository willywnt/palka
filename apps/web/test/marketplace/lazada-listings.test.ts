import { fetchLazadaListings, isTransientLazadaError } from '@palka/marketplace-providers';
import type { LazadaClient } from '@palka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the multi-warehouse capture in the Lazada listings parser: each SKU's
 * `multiWarehouseInventories[]` is flattened to a `warehouses` list of { code, sellable }
 * (blank codes dropped, FBL warehouses excluded) — used to enumerate a connection's
 * warehouses for the sync-warehouse picker and to read the sync warehouse's own sellable
 * for drift. Field shapes (multiWarehouseInventories / warehouseCode / sellableQuantity /
 * fblWarehouseInventories) are the real ones observed on the live seller account 2026-06-16.
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
  it('captures per-warehouse sellable, drops blank codes, and excludes FBL', async () => {
    const items = await fetchLazadaListings(
      fakeClient([
        {
          item_id: 8800780845,
          attributes: { name: 'Multi WH product' },
          skus: [
            {
              SkuId: 16243014036,
              SellerSku: 'MW-1',
              quantity: 1155,
              multiWarehouseInventories: [
                { warehouseCode: 'dropshipping', sellableQuantity: 45 },
                { warehouseCode: 'ID67YE4SPX-WH-10010', sellableQuantity: 1110 },
                { warehouseCode: '   ', sellableQuantity: 5 }, // blank code dropped
              ],
              fblWarehouseInventories: [{ sellableQuantity: 99 }], // FBL: must be ignored
            },
          ],
        },
      ]),
      { accessToken: 'tok' },
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.warehouses).toEqual([
      { code: 'dropshipping', sellable: 45 },
      { code: 'ID67YE4SPX-WH-10010', sellable: 1110 },
    ]);
    expect(items[0]?.quantity).toBe(1155);
  });

  it('returns an empty warehouses list for a non-multi-warehouse SKU', async () => {
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

    expect(items.find((i) => i.skuId === '10')?.warehouses).toEqual([
      { code: 'dropshipping', sellable: 9 },
    ]);
    expect(items.find((i) => i.skuId === '11')?.warehouses).toEqual([]);
  });
});

/** A client that serves `totalProducts` products across offset-paged calls (one SKU each), echoing
 *  total_products so the loop can bound itself — and recording the `limit` each call used. */
function pagingClient(totalProducts: number): { client: LazadaClient; limits: number[] } {
  const limits: number[] = [];
  const client: LazadaClient = {
    call: async (_path: string, options?: { params?: Record<string, unknown> }) => {
      const offset = Number(options?.params?.offset ?? 0);
      const limit = Number(options?.params?.limit ?? 0);
      limits.push(limit);
      const count = Math.max(0, Math.min(limit, totalProducts - offset));
      const products = Array.from({ length: count }, (_value, i) => {
        const n = offset + i + 1;
        return {
          item_id: n,
          attributes: { name: `P${n}` },
          skus: [{ SkuId: n * 10, SellerSku: `SKU-${n}`, quantity: 5 }],
        };
      });
      const data = { products, total_products: totalProducts };
      return { code: '0', data, raw: { data } } as never;
    },
  };
  return { client, limits };
}

describe('fetchLazadaListings — paging & throttle handling', () => {
  it('pages with limit=100 bounded by total_products (no silent truncation, no extra empty call)', async () => {
    const { client, limits } = pagingClient(150);
    const items = await fetchLazadaListings(client, { accessToken: 'tok' });
    expect(items).toHaveLength(150); // all 150 captured across 2 pages
    expect(limits[0]).toBe(100); // page size raised from the old 50 → 100
    expect(limits).toHaveLength(2); // 100 + 50; total_products stops it (no 3rd empty page)
  });

  it('recognizes the 901 gateway speed-limit (+ message variants) as a transient throttle', () => {
    expect(
      isTransientLazadaError(
        '901',
        'E0901: Limit service request speed in server side temporarily.',
      ),
    ).toBe(true);
    expect(isTransientLazadaError('ApiCallLimit', 'Api access frequency exceeds the limit')).toBe(
      true,
    );
    expect(isTransientLazadaError('0', undefined)).toBe(false); // success is not a throttle
    expect(isTransientLazadaError('E207', 'SKU not exist')).toBe(false); // a real error, not transient
  });
});
