import { fetchShopeeOrders, ShopeeApiError } from '@palka/marketplace-providers';
import type {
  ShopeeCallOptions,
  ShopeeClient,
  ShopeeOrderRecord,
} from '@palka/marketplace-providers';
import { describe, expect, it } from 'vitest';

import {
  normalizeShopeeStatus,
  toNormalizedShopeeOrder,
} from '@/modules/orders/adapters/shopee-order-adapter';

/**
 * Pins the Shopee order parser + normalizer against the REAL Open Platform v2 shapes (field names +
 * value types confirmed against the portal-mirroring SDK schemas: get_order_list returns THIN records
 * `{ order_sn, order_status }` with CURSOR pagination + a ≤15-day window; full fields come from a
 * second get_order_detail — batched ≤50, `item_list` with `item_id`/`model_id`/`item_sku`/`model_sku`/
 * `model_quantity_purchased`/`model_discounted_price`; the tracking number is NOT on the detail — it
 * comes from the LOGISTICS module and only for shipped orders; the identifier is `order_sn`, a STRING
 * like "250701AB12CD34"). These fixtures mirror what a real shop returns so a live-wire field rename
 * would fail here instead of silently nulling data.
 */
type CallLog = { path: string; options: ShopeeCallOptions };

const LIST_PATH = '/api/v2/order/get_order_list';
const DETAIL_PATH = '/api/v2/order/get_order_detail';
const TRACKING_PATH = '/api/v2/logistics/get_tracking_number';

const DAY = 24 * 60 * 60;

type ListPage = {
  order_list: { order_sn: string; order_status: string }[];
  more?: boolean;
  next_cursor?: string;
};

function ok<T>(response: T): { error: ''; raw: Record<string, unknown>; response: T } {
  return { error: '', raw: {}, response };
}

/**
 * Flexible fake client. `listPages` is consumed one per get_order_list call (so a test crafts the
 * cursor/window call sequence directly); get_order_detail returns the requested order_sn's details;
 * get_tracking_number returns per-sn (or an error for `trackingError` sns). `failCall(path, nth)`
 * injects a provider error on the Nth call of that path (to exercise retry / throttle paths).
 */
function makeClient(
  scenario: {
    listPages: ListPage[];
    details?: Record<string, Record<string, unknown>>;
    tracking?: Record<string, string>;
    trackingError?: string[];
    failCall?: (path: string, nth: number) => { error: string; message?: string } | null;
  },
  log?: CallLog[],
): ShopeeClient {
  const counts: Record<string, number> = {};
  const pages = [...scenario.listPages];
  return {
    call: (async (path: string, options: ShopeeCallOptions = {}) => {
      counts[path] = (counts[path] ?? 0) + 1;
      log?.push({ path, options });

      const injected = scenario.failCall?.(path, counts[path]);
      if (injected) return { error: injected.error, message: injected.message, raw: {} };

      if (path === LIST_PATH) {
        return ok(pages.shift() ?? { order_list: [], more: false });
      }
      if (path === DETAIL_PATH) {
        const sns = String(options.params?.order_sn_list ?? '')
          .split(',')
          .filter(Boolean);
        const list = sns.map((sn) => scenario.details?.[sn]).filter(Boolean);
        return ok({ order_list: list });
      }
      if (path === TRACKING_PATH) {
        const sn = String(options.params?.order_sn ?? '');
        if (scenario.trackingError?.includes(sn)) {
          return {
            error: 'logistics.error_not_ready',
            message: 'no shipping document yet',
            raw: {},
          };
        }
        return ok({ tracking_number: scenario.tracking?.[sn] ?? '' });
      }
      throw new Error(`unexpected path ${path}`);
    }) as ShopeeClient['call'],
  };
}

const BASE = { accessToken: 'tok', shopId: '227699564' };
const HOUR_RANGE = { timeFrom: 1_700_000_000, timeTo: 1_700_003_600 };

describe('fetchShopeeOrders — list → detail → tracking stitching', () => {
  it('hydrates details (multi-item, string money), tracks ONLY shipped orders', async () => {
    const log: CallLog[] = [];
    const client = makeClient(
      {
        listPages: [
          {
            order_list: [
              { order_sn: '250701SHIP0001', order_status: 'SHIPPED' },
              { order_sn: '250701REDY0002', order_status: 'READY_TO_SHIP' },
            ],
            more: false,
          },
        ],
        details: {
          '250701SHIP0001': {
            order_sn: '250701SHIP0001',
            order_status: 'SHIPPED',
            create_time: 1_699_990_000,
            update_time: 1_700_000_500,
            buyer_username: 'budi',
            // Shopee returns order/model money as STRINGS on some shops — the parser must coerce.
            total_amount: '300000',
            currency: 'IDR',
            item_list: [
              {
                item_id: 3744623870,
                model_id: 116272301497,
                item_sku: 'TEE',
                model_sku: 'TEE-BLACK-M',
                item_name: 'Cotton Tee',
                model_quantity_purchased: 2,
                model_discounted_price: '120000',
              },
              {
                item_id: 3744623871,
                model_id: 116272301500,
                item_sku: 'CAP',
                model_sku: 'CAP-RED',
                item_name: 'Baseball Cap',
                model_quantity_purchased: 1,
                model_discounted_price: 60000,
              },
            ],
          },
          '250701REDY0002': {
            order_sn: '250701REDY0002',
            order_status: 'READY_TO_SHIP',
            create_time: 1_700_001_000,
            update_time: 1_700_001_000,
            buyer_username: 'sari',
            total_amount: 50000,
            currency: 'IDR',
            item_list: [
              {
                item_id: 844150405,
                model_id: 0,
                item_sku: 'PALKAORDTEST0001',
                item_name: 'Enamel Mug',
                model_quantity_purchased: 1,
                model_discounted_price: 50000,
              },
            ],
          },
        },
        tracking: { '250701SHIP0001': 'SPXID0001' },
      },
      log,
    );

    const { records, complete } = await fetchShopeeOrders(client, { ...BASE, ...HOUR_RANGE });

    expect(complete).toBe(true);
    expect(records).toHaveLength(2);

    const shipped = records.find((r) => r.orderSn === '250701SHIP0001')!;
    expect(shipped.status).toBe('SHIPPED');
    expect(shipped.trackingNumber).toBe('SPXID0001');
    expect(shipped.totalAmount).toBe(300000); // string coerced
    expect(shipped.buyerName).toBe('budi');
    expect(shipped.lines).toHaveLength(2);
    expect(shipped.lines[0]!.itemId).toBe('3744623870'); // number → string
    expect(shipped.lines[0]!.modelId).toBe('116272301497');
    expect(shipped.lines[0]!.modelSku).toBe('TEE-BLACK-M');
    expect(shipped.lines[0]!.quantity).toBe(2);
    expect(shipped.lines[0]!.unitPrice).toBe(120000); // string coerced
    expect(shipped.lines[1]!.itemId).toBe('3744623871');

    const ready = records.find((r) => r.orderSn === '250701REDY0002')!;
    // READY_TO_SHIP has no shipping document yet → no tracking lookup, null tracking.
    expect(ready.trackingNumber).toBeNull();
    expect(ready.lines[0]!.modelId).toBe('0'); // no-variation item → "0"
    expect(ready.lines[0]!.itemSku).toBe('PALKAORDTEST0001');

    // Tracking requested for the shipped order ONLY.
    const trackingCalls = log.filter((e) => e.path === TRACKING_PATH);
    expect(trackingCalls).toHaveLength(1);
    expect(String(trackingCalls[0]!.options.params?.order_sn)).toBe('250701SHIP0001');
  });

  it('follows cursor pagination within a window and de-dupes order_sn', async () => {
    const log: CallLog[] = [];
    const client = makeClient(
      {
        listPages: [
          {
            order_list: [
              { order_sn: '250701A', order_status: 'COMPLETED' },
              { order_sn: '250701B', order_status: 'COMPLETED' },
            ],
            more: true,
            next_cursor: '20',
          },
          {
            // 250701B repeats across the cursor boundary — must be de-duped, not double-fetched.
            order_list: [
              { order_sn: '250701B', order_status: 'COMPLETED' },
              { order_sn: '250701C', order_status: 'COMPLETED' },
            ],
            more: false,
          },
        ],
        details: {
          '250701A': { order_sn: '250701A', order_status: 'COMPLETED', item_list: [] },
          '250701B': { order_sn: '250701B', order_status: 'COMPLETED', item_list: [] },
          '250701C': { order_sn: '250701C', order_status: 'COMPLETED', item_list: [] },
        },
        tracking: {},
      },
      log,
    );

    const { records } = await fetchShopeeOrders(client, { ...BASE, ...HOUR_RANGE });

    expect(records.map((r) => r.orderSn).sort()).toEqual(['250701A', '250701B', '250701C']);
    expect(log.filter((e) => e.path === LIST_PATH)).toHaveLength(2); // two cursor pages
    // Second list page was requested with the cursor from the first page.
    expect(String(log.filter((e) => e.path === LIST_PATH)[1]!.options.params?.cursor)).toBe('20');
  });

  it('chunks a >15-day backfill into ≤14-day windows', async () => {
    const log: CallLog[] = [];
    const client = makeClient(
      {
        // One list call PER window, each terminal (more:false).
        listPages: [
          { order_list: [{ order_sn: '250601W1', order_status: 'COMPLETED' }], more: false },
          { order_list: [{ order_sn: '250620W2', order_status: 'COMPLETED' }], more: false },
        ],
        details: {
          '250601W1': { order_sn: '250601W1', order_status: 'COMPLETED', item_list: [] },
          '250620W2': { order_sn: '250620W2', order_status: 'COMPLETED', item_list: [] },
        },
        tracking: {},
      },
      log,
    );

    const timeFrom = 1_700_000_000;
    const { records } = await fetchShopeeOrders(client, {
      ...BASE,
      timeFrom,
      timeTo: timeFrom + 20 * DAY, // 20 days → 14-day + 6-day windows
    });

    expect(records.map((r) => r.orderSn).sort()).toEqual(['250601W1', '250620W2']);
    const listCalls = log.filter((e) => e.path === LIST_PATH);
    expect(listCalls).toHaveLength(2); // one per window
    // The two windows are contiguous, ≤14 days each.
    const w1From = Number(listCalls[0]!.options.params?.time_from);
    const w1To = Number(listCalls[0]!.options.params?.time_to);
    expect(w1To - w1From).toBeLessThanOrEqual(14 * DAY);
    expect(Number(listCalls[1]!.options.params?.time_from)).toBe(w1To);
  });

  it('batches get_order_detail ≤50 order_sn per call', async () => {
    const log: CallLog[] = [];
    const N = 55;
    const list = Array.from({ length: N }, (_, i) => ({
      order_sn: `250701N${String(i).padStart(3, '0')}`,
      order_status: 'READY_TO_SHIP', // not a tracking status → no per-order tracking calls
    }));
    const details: Record<string, Record<string, unknown>> = {};
    for (const o of list) details[o.order_sn] = { ...o, item_list: [] };

    const { records } = await fetchShopeeOrders(
      makeClient({ listPages: [{ order_list: list, more: false }], details }, log),
      { ...BASE, ...HOUR_RANGE },
    );

    expect(records).toHaveLength(N);
    const detailCalls = log.filter((e) => e.path === DETAIL_PATH);
    expect(detailCalls).toHaveLength(2); // 50 + 5
    expect(String(detailCalls[0]!.options.params?.order_sn_list).split(',')).toHaveLength(50);
    expect(String(detailCalls[1]!.options.params?.order_sn_list).split(',')).toHaveLength(5);
  });

  it('onThrottle:"partial" keeps collected orders + reports complete:false', async () => {
    const client = makeClient({
      listPages: [
        {
          order_list: [{ order_sn: '250701P1', order_status: 'COMPLETED' }],
          more: true,
          next_cursor: 'c1',
        },
      ],
      details: { '250701P1': { order_sn: '250701P1', order_status: 'COMPLETED', item_list: [] } },
      tracking: {},
      // The SECOND list page (the cursor follow-up) throttles.
      failCall: (path, nth) => (path === LIST_PATH && nth >= 2 ? { error: 'error_busy' } : null),
    });

    const { records, complete } = await fetchShopeeOrders(client, {
      ...BASE,
      ...HOUR_RANGE,
      onThrottle: 'partial',
    });

    expect(complete).toBe(false); // caller must NOT advance its cursor past the un-fetched tail
    expect(records.map((r) => r.orderSn)).toEqual(['250701P1']); // page-1 orders survive
  }, 20000);

  it('throws ShopeeApiError on a non-transient list failure', async () => {
    const client = makeClient({
      listPages: [{ order_list: [], more: false }],
      failCall: (path) =>
        path === LIST_PATH ? { error: 'error_auth', message: 'Invalid access_token' } : null,
    });

    await expect(fetchShopeeOrders(client, { ...BASE, ...HOUR_RANGE })).rejects.toBeInstanceOf(
      ShopeeApiError,
    );
  });

  it('retries a transient get_order_detail failure, then succeeds', async () => {
    const client = makeClient({
      listPages: [
        { order_list: [{ order_sn: '250701R1', order_status: 'COMPLETED' }], more: false },
      ],
      details: { '250701R1': { order_sn: '250701R1', order_status: 'COMPLETED', item_list: [] } },
      tracking: {},
      failCall: (path, nth) =>
        path === DETAIL_PATH && nth === 1 ? { error: 'error_server' } : null,
    });

    const { records } = await fetchShopeeOrders(client, { ...BASE, ...HOUR_RANGE });
    expect(records.map((r) => r.orderSn)).toEqual(['250701R1']);
  }, 20000);

  it('tolerates a tracking lookup error (order without a shipping doc yet)', async () => {
    const { records, complete } = await fetchShopeeOrders(
      makeClient({
        listPages: [
          { order_list: [{ order_sn: '250701T1', order_status: 'PROCESSED' }], more: false },
        ],
        details: { '250701T1': { order_sn: '250701T1', order_status: 'PROCESSED', item_list: [] } },
        trackingError: ['250701T1'],
      }),
      { ...BASE, ...HOUR_RANGE },
    );

    expect(complete).toBe(true);
    expect(records[0]!.status).toBe('PROCESSED');
    expect(records[0]!.trackingNumber).toBeNull(); // error → no tracking, pull not failed
  });

  it('returns empty without a detail call when no orders match the window', async () => {
    const log: CallLog[] = [];
    const { records, complete } = await fetchShopeeOrders(
      makeClient({ listPages: [{ order_list: [], more: false }] }, log),
      { ...BASE, ...HOUR_RANGE },
    );

    expect(records).toEqual([]);
    expect(complete).toBe(true);
    expect(log.some((e) => e.path === DETAIL_PATH)).toBe(false);
  });

  it('paces EVERY provider call via beforeCall (list + detail + tracking)', async () => {
    let beforeCallCount = 0;
    await fetchShopeeOrders(
      makeClient({
        listPages: [
          { order_list: [{ order_sn: '250701C1', order_status: 'COMPLETED' }], more: false },
        ],
        details: { '250701C1': { order_sn: '250701C1', order_status: 'COMPLETED', item_list: [] } },
        tracking: { '250701C1': 'SPXID9' },
      }),
      {
        ...BASE,
        ...HOUR_RANGE,
        beforeCall: async () => {
          beforeCallCount += 1;
        },
      },
    );
    // 1 list page + 1 detail batch + 1 tracking lookup (COMPLETED) = 3 paced calls.
    expect(beforeCallCount).toBe(3);
  });
});

describe('normalizeShopeeStatus — every Shopee order_status → normalized', () => {
  it('reserves on paid-and-awaiting-handover statuses (incl. IN_CANCEL until finalized)', () => {
    expect(normalizeShopeeStatus('READY_TO_SHIP')).toBe('PAID');
    expect(normalizeShopeeStatus('PROCESSED')).toBe('PAID');
    expect(normalizeShopeeStatus('RETRY_SHIP')).toBe('PAID');
    expect(normalizeShopeeStatus('INVOICE_PENDING')).toBe('PAID');
    expect(normalizeShopeeStatus('IN_CANCEL')).toBe('PAID');
  });

  it('consumes the reservation only once shipped / delivered', () => {
    expect(normalizeShopeeStatus('SHIPPED')).toBe('SHIPPED');
    expect(normalizeShopeeStatus('TO_CONFIRM_RECEIVE')).toBe('SHIPPED');
    expect(normalizeShopeeStatus('TO_RETURN')).toBe('SHIPPED');
    expect(normalizeShopeeStatus('COMPLETED')).toBe('COMPLETED');
  });

  it('maps unpaid → PENDING, cancelled → CANCELLED, unknown → null (case-insensitive)', () => {
    expect(normalizeShopeeStatus('UNPAID')).toBe('PENDING');
    expect(normalizeShopeeStatus('cancelled')).toBe('CANCELLED');
    expect(normalizeShopeeStatus(' Completed ')).toBe('COMPLETED'); // trimmed + upper
    expect(normalizeShopeeStatus('SOME_FUTURE_STATUS')).toBeNull();
  });
});

describe('toNormalizedShopeeOrder — record → cross-provider order + mapping alignment', () => {
  const line = (over: Partial<ShopeeOrderRecord['lines'][number]>) => ({
    itemId: '10',
    modelId: '20',
    modelSku: 'SKU-A',
    itemSku: 'SKU-PARENT',
    name: 'Thing',
    quantity: 1,
    unitPrice: 1000,
    ...over,
  });
  const record = (over: Partial<ShopeeOrderRecord>): ShopeeOrderRecord => ({
    orderSn: 'SN-XYZ',
    status: 'READY_TO_SHIP',
    createTime: 1_700_000_000,
    updateTime: 1_700_000_900,
    buyerName: 'andi',
    totalAmount: 99000,
    currency: 'IDR',
    trackingNumber: null,
    lines: [line({})],
    raw: {},
    ...over,
  });

  it('maps order_sn, model ids, unix-second timestamps, falls back to PENDING on unknown status', () => {
    const order = toNormalizedShopeeOrder(
      record({ status: 'WEIRD_STATUS', trackingNumber: 'SPXID7', totalAmount: 99000 }),
    );
    expect(order.externalOrderId).toBe('SN-XYZ');
    expect(order.status).toBe('PENDING'); // unknown status → safe default
    expect(order.trackingNumber).toBe('SPXID7');
    expect(order.placedAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(order.updatedAt?.getTime()).toBe(1_700_000_900 * 1000);
    expect(order.items[0]!.externalProductId).toBe('10');
    expect(order.items[0]!.externalVariantId).toBe('20');
    expect(order.items[0]!.externalSku).toBe('SKU-A'); // prefers model_sku
  });

  it('aligns a NO-VARIATION line with the import: externalSku falls back to item_sku', () => {
    // Our listing import stores a no-variation listing as (externalVariantId "0", externalSku=item_sku).
    // A no-variation ORDER line carries the item's real hidden model_id + an empty model_sku, so:
    //  - externalVariantId is the real model_id (may NOT equal the import's "0") → the (product,variant)
    //    match can miss, BUT
    //  - externalSku falls back to item_sku, which DOES equal the import's externalSku → the pull's
    //    SKU fallback still resolves the internal variant. This is the load-bearing alignment.
    const order = toNormalizedShopeeOrder(
      record({
        lines: [
          line({
            itemId: '844150405',
            modelId: '4257121299',
            modelSku: null,
            itemSku: 'PALKAORDTEST0001',
          }),
        ],
      }),
    );
    expect(order.items[0]!.externalProductId).toBe('844150405');
    expect(order.items[0]!.externalVariantId).toBe('4257121299');
    expect(order.items[0]!.externalSku).toBe('PALKAORDTEST0001'); // falls back to item_sku
  });

  it('handles missing optional fields (buyer/currency/price/tracking null) + placedAt fallback', () => {
    const order = toNormalizedShopeeOrder(
      record({
        buyerName: null,
        currency: null,
        totalAmount: null,
        trackingNumber: null,
        createTime: null, // no create_time → placedAt falls back to update_time
        updateTime: 1_700_000_900,
        lines: [line({ unitPrice: null })],
      }),
    );
    expect(order.buyerName).toBeNull();
    expect(order.currency).toBeNull();
    expect(order.totalAmount).toBeNull();
    expect(order.trackingNumber).toBeNull();
    expect(order.items[0]!.unitPrice).toBeNull();
    expect(order.placedAt.getTime()).toBe(1_700_000_900 * 1000); // update_time fallback
  });
});
