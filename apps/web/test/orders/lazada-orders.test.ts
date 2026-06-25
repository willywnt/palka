import { fetchLazadaOrders } from '@falka/marketplace-providers';
import type { LazadaClient, LazadaCallOptions } from '@falka/marketplace-providers';
import { describe, expect, it } from 'vitest';

import { reduceLazadaStatuses } from '@/modules/orders/adapters/lazada-order-adapter';

/**
 * Pins the Lazada order parser. The two load-bearing quirks (verified against the LazOP docs):
 *  - GetOrders returns HEADERS only; line items come from a second /orders/items/get call.
 *  - GetOrderItems returns ONE OBJECT PER UNIT (no quantity field), so identical-SKU units
 *    must be aggregated into a single line with quantity = the unit count.
 */
type CallLog = { path: string; options: LazadaCallOptions };

function fakeClient(ordersPage: unknown[], itemsData: unknown, log?: CallLog[]): LazadaClient {
  return {
    call: async (path: string, options: LazadaCallOptions = {}) => {
      log?.push({ path, options });
      if (path === '/orders/get') {
        const offset = Number(options.params?.offset ?? 0);
        const data = offset === 0 ? { orders: ordersPage } : { orders: [] };
        return { code: '0', raw: { data }, data } as never;
      }
      if (path === '/orders/items/get') {
        return { code: '0', raw: { data: itemsData }, data: itemsData } as never;
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

const ORDER_HEADER = {
  order_id: 100663397,
  order_number: 4030,
  statuses: ['shipped'],
  created_at: '2026-06-01T10:00:00+07:00',
  updated_at: '2026-06-02T10:00:00+07:00',
  customer_first_name: 'Budi',
  customer_last_name: 'S',
  price: '300.00',
};

describe('fetchLazadaOrders — header + item stitching and per-unit aggregation', () => {
  it('aggregates one-object-per-unit rows into per-SKU lines with a quantity', async () => {
    // Grouped response shape: data = [{ order_id, order_items: [...units] }].
    const itemsData = [
      {
        order_id: 100663397,
        order_items: [
          {
            item_id: 7,
            sku_id: 70,
            seller_sku: 'BLACK-M',
            name: 'Tee Black M',
            paid_price: '100.00',
            currency: 'IDR',
            status: 'shipped',
            tracking_code: 'LZD123',
          },
          {
            item_id: 7,
            sku_id: 70,
            seller_sku: 'BLACK-M',
            name: 'Tee Black M',
            paid_price: '100.00',
            currency: 'IDR',
            status: 'shipped',
            tracking_code: 'LZD123',
          },
          {
            item_id: 9,
            sku_id: 90,
            seller_sku: 'WHITE-S',
            name: 'Tee White S',
            paid_price: '100.00',
            currency: 'IDR',
            status: 'shipped',
            tracking_code: 'LZD123',
          },
        ],
      },
    ];

    const { records, complete } = await fetchLazadaOrders(fakeClient([ORDER_HEADER], itemsData), {
      accessToken: 'tok',
      updateAfter: '2026-05-01T00:00:00+07:00',
    });

    // A short page (< 100) is the window's natural end → the pull is complete.
    expect(complete).toBe(true);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.orderId).toBe('100663397');
    expect(record.price).toBe('300.00');
    expect(record.statuses).toEqual(['shipped']);
    expect(record.lines).toHaveLength(2);

    const black = record.lines.find((line) => line.sellerSku === 'BLACK-M')!;
    expect(black.quantity).toBe(2);
    expect(black.skuId).toBe('70');
    expect(black.unitPaidPrice).toBe(100);
    expect(black.trackingCode).toBe('LZD123');

    const white = record.lines.find((line) => line.sellerSku === 'WHITE-S')!;
    expect(white.quantity).toBe(1);
  });

  it('parses a FLAT items response (each row tagged with its order_id)', async () => {
    const flatItems = [
      {
        order_id: 100663397,
        item_id: 7,
        sku_id: 70,
        seller_sku: 'BLACK-M',
        name: 'Tee',
        paid_price: '120.00',
        status: 'pending',
      },
      {
        order_id: 100663397,
        item_id: 7,
        sku_id: 70,
        seller_sku: 'BLACK-M',
        name: 'Tee',
        paid_price: '120.00',
        status: 'pending',
      },
    ];

    const { records } = await fetchLazadaOrders(fakeClient([ORDER_HEADER], flatItems), {
      accessToken: 'tok',
      updateAfter: '2026-05-01T00:00:00+07:00',
    });

    expect(records[0]!.lines).toHaveLength(1);
    expect(records[0]!.lines[0]!.quantity).toBe(2);
  });

  it('derives itemId from shop_sku and reads the seller SKU from `sku` (real Lazada shape)', async () => {
    // Real order items omit item_id + seller_sku; the seller SKU lives in `sku`, and item_id
    // is the shop_sku prefix `<itemId>_<region>-<skuId>`.
    const realItems = [
      {
        order_id: 100663397,
        order_items: [
          {
            sku: 'PITA-HITAM-1',
            sku_id: '16145310478',
            shop_sku: '8708856468_ID-16145310478',
            name: 'Black Satin Ribbon',
            paid_price: 3000,
            status: 'ready_to_ship',
            tracking_code: 'JZ1084072946',
          },
        ],
      },
    ];

    const { records } = await fetchLazadaOrders(fakeClient([ORDER_HEADER], realItems), {
      accessToken: 'tok',
      updateAfter: '2026-05-01T00:00:00+07:00',
    });

    const line = records[0]!.lines[0]!;
    expect(line.itemId).toBe('8708856468');
    expect(line.skuId).toBe('16145310478');
    expect(line.sellerSku).toBe('PITA-HITAM-1');
    expect(line.shopSku).toBe('8708856468_ID-16145310478');
    expect(line.trackingCode).toBe('JZ1084072946');
  });

  it('sends update_after with sort_by=updated_at and skips items when no orders', async () => {
    const log: CallLog[] = [];
    const { records } = await fetchLazadaOrders(fakeClient([], [], log), {
      accessToken: 'tok',
      updateAfter: '2026-05-01T00:00:00+07:00',
    });

    expect(records).toEqual([]);
    const ordersCall = log.find((entry) => entry.path === '/orders/get')!;
    expect(ordersCall.options.params?.update_after).toBe('2026-05-01T00:00:00+07:00');
    expect(ordersCall.options.params?.sort_by).toBe('updated_at');
    // No orders → no item lookup.
    expect(log.some((entry) => entry.path === '/orders/items/get')).toBe(false);
  });

  it('rejects a pull with neither updateAfter nor createdAfter', async () => {
    await expect(fetchLazadaOrders(fakeClient([], []), { accessToken: 'tok' })).rejects.toThrow(
      /updateAfter or createdAfter/,
    );
  });
});

describe('reduceLazadaStatuses — mixed per-item statuses → one normalized status', () => {
  it('maps Lazada pending (paid-and-awaiting-pack) to PAID, not PENDING', () => {
    expect(reduceLazadaStatuses(['pending'])).toBe('PAID');
    expect(reduceLazadaStatuses(['ready_to_ship'])).toBe('PAID');
    // Real tokens seen on the live shop: confirmed + packed are post-payment, pre-ship → PAID.
    expect(reduceLazadaStatuses(['confirmed'])).toBe('PAID');
    expect(reduceLazadaStatuses(['packed'])).toBe('PAID');
    expect(reduceLazadaStatuses(['unpaid'])).toBe('PENDING');
  });

  it('keeps a partly-shipped order at the least-progressed active status', () => {
    expect(reduceLazadaStatuses(['shipped', 'delivered'])).toBe('SHIPPED');
    expect(reduceLazadaStatuses(['pending', 'shipped'])).toBe('PAID');
    expect(reduceLazadaStatuses(['delivered'])).toBe('COMPLETED');
  });

  it('only cancels when every item is cancelled/returned; ignores cancelled among active', () => {
    expect(reduceLazadaStatuses(['canceled'])).toBe('CANCELLED');
    expect(reduceLazadaStatuses(['canceled', 'returned'])).toBe('CANCELLED');
    expect(reduceLazadaStatuses(['shipped', 'canceled'])).toBe('SHIPPED');
  });

  it('defaults unknown-only / empty orders to PENDING (never touches stock)', () => {
    expect(reduceLazadaStatuses([])).toBe('PENDING');
    expect(reduceLazadaStatuses(['some_future_token'])).toBe('PENDING');
  });
});
