import { fetchShopeeListings } from '@palka/marketplace-providers';
import type { ShopeeCallOptions, ShopeeClient } from '@palka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the Shopee listing parser against the REAL sandbox response shapes (captured live 2026-06-30).
 * The load-bearing quirk: a NO-VARIATION item's stock lives in get_item_base_info's `stock_info_v2`
 * (get_model_list returns an empty `model: []`), so it must NOT default to 0.
 */
const ITEM_LIST_PATH = '/api/v2/product/get_item_list';
const BASE_INFO_PATH = '/api/v2/product/get_item_base_info';
const MODEL_LIST_PATH = '/api/v2/product/get_model_list';

function ok<T>(response: T): { error: ''; raw: Record<string, unknown>; response: T } {
  return { error: '', raw: {}, response };
}

function fakeClient(parts: {
  itemIds: number[];
  baseItems: Record<string, unknown>[];
  models?: Record<string, Record<string, unknown>>;
}): ShopeeClient {
  return {
    call: (async (path: string, options: ShopeeCallOptions = {}) => {
      if (path === ITEM_LIST_PATH) {
        return ok({
          item: parts.itemIds.map((id) => ({ item_id: id, item_status: 'NORMAL' })),
          total_count: parts.itemIds.length,
          has_next_page: false,
          next: '',
        });
      }
      if (path === BASE_INFO_PATH) {
        return ok({ item_list: parts.baseItems });
      }
      if (path === MODEL_LIST_PATH) {
        const id = String(options.params?.item_id ?? '');
        return ok(parts.models?.[id] ?? { tier_variation: [], model: [] });
      }
      throw new Error(`unexpected path ${path}`);
    }) as ShopeeClient['call'],
  };
}

describe('fetchShopeeListings — real sandbox shapes', () => {
  it('reads a NO-VARIATION item stock from item-level stock_info_v2 (not 0)', async () => {
    const client = fakeClient({
      itemIds: [844150399],
      baseItems: [
        {
          item_id: 844150399,
          item_name: 'test produk 1',
          item_sku: '', // seller set no SKU
          item_status: 'NORMAL',
          has_model: false,
          stock_info_v2: {
            summary_info: { total_reserved_stock: 0, total_available_stock: 100 },
            seller_stock: [{ location_id: 'IDZ', stock: 100, if_saleable: true }],
          },
        },
      ],
    });

    const items = await fetchShopeeListings(client, { accessToken: 't', shopId: '227699564' });
    expect(items).toHaveLength(1);
    const row = items[0]!;
    expect(row.itemId).toBe('844150399');
    expect(row.modelId).toBe('0');
    expect(row.productName).toBe('test produk 1');
    expect(row.quantity).toBe(100); // regression guard: was hardcoded 0
    expect(row.warehouses).toEqual([{ code: 'IDZ', sellable: 100 }]);
    expect(row.modelSku).toBeNull(); // blank item_sku → null, not ""
    expect(row.variantName).toBeNull();
  });

  it('flattens a VARIATION item to per-model rows with model_sku/stock/tier name', async () => {
    const client = fakeClient({
      itemIds: [5001],
      baseItems: [
        {
          item_id: 5001,
          item_name: 'Variation Product',
          item_sku: 'PARENT',
          item_status: 'NORMAL',
          has_model: true,
        },
      ],
      models: {
        '5001': {
          tier_variation: [{ name: 'Size', option_list: [{ option: 'S' }, { option: 'M' }] }],
          model: [
            {
              model_id: 9001,
              model_sku: 'VAR-S',
              tier_index: [0],
              stock_info_v2: {
                seller_stock: [{ location_id: 'IDZ', stock: 7 }],
                summary_info: { total_available_stock: 7 },
              },
            },
            {
              model_id: 9002,
              model_sku: 'VAR-M',
              tier_index: [1],
              stock_info_v2: {
                seller_stock: [{ location_id: 'IDZ', stock: 3 }],
                summary_info: { total_available_stock: 3 },
              },
            },
          ],
        },
      },
    });

    const items = await fetchShopeeListings(client, { accessToken: 't', shopId: '227699564' });
    expect(items).toHaveLength(2);
    const s = items.find((r) => r.modelSku === 'VAR-S')!;
    expect(s.itemId).toBe('5001');
    expect(s.modelId).toBe('9001');
    expect(s.quantity).toBe(7);
    expect(s.variantName).toBe('S');
    expect(s.warehouses).toEqual([{ code: 'IDZ', sellable: 7 }]);
    const m = items.find((r) => r.modelSku === 'VAR-M')!;
    expect(m.modelId).toBe('9002');
    expect(m.quantity).toBe(3);
    expect(m.variantName).toBe('M');
  });
});
