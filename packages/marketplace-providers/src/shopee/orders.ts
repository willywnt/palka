import { isShopeeSuccess } from './client.js';
import { ShopeeApiError } from './listings.js';
import { isTransientShopeeError, sleep } from './throttle.js';
import type { ShopeeClient, ShopeeResponse } from './types.js';

const ORDER_LIST_PATH = '/api/v2/order/get_order_list';
const ORDER_DETAIL_PATH = '/api/v2/order/get_order_detail';
const TRACKING_NUMBER_PATH = '/api/v2/logistics/get_tracking_number';

/** get_order_list page size — Shopee max is 100. */
const LIST_PAGE_SIZE = 100;
/** get_order_detail accepts up to 50 order_sn per call. */
const DETAIL_BATCH = 50;
/**
 * Shopee caps a single get_order_list window (`time_to - time_from`) at 15 days (else
 * `order.order_list_invalid_time`). We chunk a longer backfill into 14-day sub-windows for
 * headroom against clock skew.
 */
const MAX_WINDOW_SECONDS = 14 * 24 * 60 * 60;
/** Safety cap so a cursor bug can't loop forever within one window (≈5000 orders). */
const MAX_PAGES_PER_WINDOW = 50;
/** Gentle pacing so a busy shop stays under the per-shop QPS. */
const CALL_DELAY_MS = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 600;

/**
 * Optional fields get_order_detail returns ONLY when explicitly requested (the thin list response
 * carries just order_sn + order_status). Keep this to the fields the order pull maps.
 */
const DETAIL_OPTIONAL_FIELDS = [
  'item_list',
  'total_amount',
  'buyer_username',
  'pay_time',
  'order_status',
  'create_time',
  'update_time',
  'currency',
].join(',');

/** Statuses at/after which a shipping document (tracking number) exists. */
const TRACKING_STATUSES = new Set([
  'PROCESSED',
  'SHIPPED',
  'TO_CONFIRM_RECEIVE',
  'TO_RETURN',
  'COMPLETED',
]);

function readString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** One Shopee order line (the model grain, matching the imported listing's external ids). */
export type ShopeeOrderLine = {
  /** Shopee item_id — the external product id. */
  itemId: string;
  /** Shopee model_id — the external variant id ("0" for a no-variation item). */
  modelId: string;
  /** The seller's model-level SKU (Shopee `model_sku`), if set. */
  modelSku: string | null;
  /** The seller's item-level SKU (Shopee `item_sku`), if set. */
  itemSku: string | null;
  name: string;
  quantity: number;
  /** Per-unit price actually paid (Shopee `model_discounted_price`); null when absent. */
  unitPrice: number | null;
};

/** A Shopee order header stitched with its line items + (post-ship) tracking number. */
export type ShopeeOrderRecord = {
  /** Shopee order_sn — a STRING identifier (NOT a numeric order id). */
  orderSn: string;
  /** Shopee order_status (e.g. READY_TO_SHIP, SHIPPED, CANCELLED). */
  status: string;
  /** create_time / update_time as UNIX SECONDS (null when absent). */
  createTime: number | null;
  updateTime: number | null;
  buyerName: string | null;
  totalAmount: number | null;
  currency: string | null;
  /** Courier tracking number once a shipping document exists (post-ship); null otherwise. */
  trackingNumber: string | null;
  lines: ShopeeOrderLine[];
  raw: Record<string, unknown>;
};

/**
 * Result of a windowed order pull. `complete` is false when paging stopped early (a throttle tail
 * kept partial, or the per-window MAX_PAGES safety cap was hit) — the caller must then NOT advance
 * its incremental cursor past the un-fetched newest-updated tail.
 */
export type ShopeeOrdersResult = { records: ShopeeOrderRecord[]; complete: boolean };

// ── Loosely-typed API shapes (VERIFY field names against a live shop on first sandbox run) ──
type ShopeeOrderListEntry = { order_sn?: string; order_status?: string };
type ShopeeOrderListData = {
  order_list?: ShopeeOrderListEntry[];
  more?: boolean;
  next_cursor?: string;
};

type ShopeeOrderDetailItem = {
  item_id?: number | string;
  item_name?: string;
  item_sku?: string;
  model_id?: number | string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_discounted_price?: number | string;
};
type ShopeeOrderDetail = {
  order_sn?: string;
  order_status?: string;
  create_time?: number;
  update_time?: number;
  buyer_username?: string;
  total_amount?: number | string;
  currency?: string;
  item_list?: ShopeeOrderDetailItem[];
};
type ShopeeOrderDetailData = { order_list?: ShopeeOrderDetail[] };
type ShopeeTrackingData = { tracking_number?: string };

/** Call an endpoint, backing off + retrying while Shopee returns a transient throttle code. */
async function callWithRetry<T>(
  client: ShopeeClient,
  path: string,
  params: {
    accessToken: string;
    shopId: string;
    query: Record<string, string | number>;
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeResponse<T>> {
  await params.beforeCall?.();
  let response = await client.call<T>(path, {
    method: 'GET',
    accessToken: params.accessToken,
    shopId: params.shopId,
    params: params.query,
  });
  for (
    let attempt = 1;
    attempt <= MAX_RETRIES &&
    !isShopeeSuccess(response) &&
    isTransientShopeeError(response.error, response.message);
    attempt += 1
  ) {
    await sleep(RETRY_DELAY_MS * 2 * attempt);
    await params.beforeCall?.();
    response = await client.call<T>(path, {
      method: 'GET',
      accessToken: params.accessToken,
      shopId: params.shopId,
      params: params.query,
    });
  }
  return response;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function mapDetailLine(item: ShopeeOrderDetailItem): ShopeeOrderLine {
  return {
    itemId: readString(item.item_id) ?? '',
    modelId: readString(item.model_id) ?? '0',
    modelSku: item.model_sku?.trim() ? item.model_sku : null,
    itemSku: item.item_sku?.trim() ? item.item_sku : null,
    name: item.item_name ?? 'Shopee item',
    quantity: readNumber(item.model_quantity_purchased) ?? 0,
    unitPrice: readNumber(item.model_discounted_price),
  };
}

function mapDetail(detail: ShopeeOrderDetail): ShopeeOrderRecord {
  return {
    orderSn: detail.order_sn ?? '',
    status: detail.order_status ?? 'UNKNOWN',
    createTime: readNumber(detail.create_time),
    updateTime: readNumber(detail.update_time),
    buyerName: detail.buyer_username?.trim() ? detail.buyer_username : null,
    totalAmount: readNumber(detail.total_amount),
    currency: detail.currency?.trim() ? detail.currency : null,
    trackingNumber: null,
    lines: (detail.item_list ?? []).map(mapDetailLine),
    raw: detail as Record<string, unknown>,
  };
}

/** Hydrate full order details for a set of order_sn, batched ≤50 per call. */
async function fetchOrderDetails(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    orderSns: string[];
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeOrderRecord[]> {
  const records: ShopeeOrderRecord[] = [];

  for (const batch of chunk(params.orderSns, DETAIL_BATCH)) {
    const response = await callWithRetry<ShopeeOrderDetailData>(client, ORDER_DETAIL_PATH, {
      accessToken: params.accessToken,
      shopId: params.shopId,
      query: { order_sn_list: batch.join(','), response_optional_fields: DETAIL_OPTIONAL_FIELDS },
      beforeCall: params.beforeCall,
    });
    if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);

    for (const detail of response.response?.order_list ?? []) {
      if (detail.order_sn) records.push(mapDetail(detail));
    }
    await sleep(CALL_DELAY_MS);
  }

  return records;
}

/**
 * Resolve a shipped order's tracking number (Shopee exposes it via the LOGISTICS module, NOT
 * get_order_detail). Tolerant: an order without a shipping document yet returns an error, which we
 * treat as "no tracking" rather than failing the whole pull.
 */
async function fetchTrackingNumber(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    orderSn: string;
    beforeCall?: () => Promise<void>;
  },
): Promise<string | null> {
  await params.beforeCall?.();
  const response = await client.call<ShopeeTrackingData>(TRACKING_NUMBER_PATH, {
    method: 'GET',
    accessToken: params.accessToken,
    shopId: params.shopId,
    params: { order_sn: params.orderSn },
  });
  if (!isShopeeSuccess(response)) return null;
  return response.response?.tracking_number?.trim() ? response.response.tracking_number : null;
}

/**
 * Pulls a Shopee shop's orders changed within a window and stitches each header with its line items
 * + (for shipped orders) its tracking number. Flow: page `get_order_list` (cursor-based, chunked
 * into ≤15-day sub-windows) for order_sn → batch `get_order_detail` (≤50) → `get_tracking_number`
 * per shipped order. Shared by the web order adapter (and any future worker job) so both read the
 * same parsed shape.
 *
 * `timeFrom`/`timeTo` are UNIX SECONDS; `timeRangeField` defaults to `update_time` (catches status
 * transitions, like the Lazada incremental pull). `onThrottle: 'partial'` returns what was collected
 * with `complete: false` when Shopee keeps throttling (the pull upserts idempotently, so a truncated
 * tail is safe to re-fetch next run). Throws {@link ShopeeApiError} otherwise.
 */
export async function fetchShopeeOrders(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    timeFrom: number;
    timeTo: number;
    timeRangeField?: 'create_time' | 'update_time';
    onThrottle?: 'throw' | 'partial';
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeOrdersResult> {
  const timeRangeField = params.timeRangeField ?? 'update_time';
  const orderSns = new Set<string>();
  let complete = true;

  windows: for (
    let windowStart = params.timeFrom;
    windowStart < params.timeTo;
    windowStart += MAX_WINDOW_SECONDS
  ) {
    const windowEnd = Math.min(windowStart + MAX_WINDOW_SECONDS, params.timeTo);
    let cursor = '';

    for (let page = 0; page < MAX_PAGES_PER_WINDOW; page += 1) {
      const response = await callWithRetry<ShopeeOrderListData>(client, ORDER_LIST_PATH, {
        accessToken: params.accessToken,
        shopId: params.shopId,
        query: {
          time_range_field: timeRangeField,
          time_from: windowStart,
          time_to: windowEnd,
          page_size: LIST_PAGE_SIZE,
          cursor,
        },
        beforeCall: params.beforeCall,
      });

      if (!isShopeeSuccess(response)) {
        // The pull is idempotent + re-runnable, so a throttled tail can keep what it has.
        if (
          params.onThrottle === 'partial' &&
          orderSns.size > 0 &&
          isTransientShopeeError(response.error, response.message)
        ) {
          complete = false;
          break windows;
        }
        throw new ShopeeApiError(response.error, response.message);
      }

      for (const entry of response.response?.order_list ?? []) {
        if (entry.order_sn) orderSns.add(entry.order_sn);
      }

      if (!response.response?.more) break;
      cursor = response.response.next_cursor ?? '';
      if (!cursor) break;
      if (page === MAX_PAGES_PER_WINDOW - 1) complete = false;
      await sleep(CALL_DELAY_MS);
    }
  }

  if (orderSns.size === 0) return { records: [], complete };

  const records = await fetchOrderDetails(client, {
    accessToken: params.accessToken,
    shopId: params.shopId,
    orderSns: [...orderSns],
    beforeCall: params.beforeCall,
  });

  for (const record of records) {
    if (!TRACKING_STATUSES.has(record.status)) continue;
    record.trackingNumber = await fetchTrackingNumber(client, {
      accessToken: params.accessToken,
      shopId: params.shopId,
      orderSn: record.orderSn,
      beforeCall: params.beforeCall,
    });
    await sleep(CALL_DELAY_MS);
  }

  return { records, complete };
}
