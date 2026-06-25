import { isLazadaSuccess } from './client.js';
import { LazadaApiError } from './listings.js';
import { isTransientLazadaError, sleep } from './throttle.js';
import type { LazadaClient, LazadaResponse } from './types.js';

const ORDERS_GET_PATH = '/orders/get';
/** Batch line-item lookup for many orders in one call (GetMultipleOrderItems). */
const ORDER_ITEMS_GET_PATH = '/orders/items/get';

const PAGE_LIMIT = 100; // Lazada hard max; >100 errors.
/** Safety cap so a paging bug can't loop forever (≈5000 orders, Lazada's offset ceiling). */
const MAX_PAGES = 50;
/** Pace pages so a busy window doesn't trip Lazada's flow control. */
const PAGE_DELAY_MS = 800;
const MAX_PAGE_RETRIES = 4;

/**
 * Order ids per GetMultipleOrderItems call. Lazada caps this (legacy error E038 "Too many
 * orders were requested") but the exact number is undocumented; sibling batch ops cap at 20,
 * so we batch conservatively. VERIFY against a live shop and raise if the API allows more.
 */
const ITEMS_BATCH_SIZE = 20;
const ITEMS_DELAY_MS = 400;
const MAX_ITEMS_RETRIES = 3;

function readString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

/** Parse a Lazada money string ("118.00") to a number; null when absent/unparseable. */
function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(value: unknown): number | null {
  const parsed = parsePrice(value);
  return parsed === null ? null : parsed;
}

/**
 * Lazada order items omit a standalone item_id but embed it in shop_sku as
 * `<itemId>_<region>-<skuId>` (e.g. `8708856468_ID-16145310478`). Derive it so the order
 * line carries the same external product id the listing import stored.
 */
function deriveItemId(item: LazadaApiOrderItem): string {
  const explicit = readString(item.item_id);
  if (explicit) return explicit;
  const shopSku = readString(item.shop_sku);
  if (!shopSku) return '';
  const underscore = shopSku.indexOf('_');
  // `<itemId>_<region>-<skuId>` → the itemId prefix; if there's no usable prefix, keep the whole
  // shop_sku rather than '' (a blank product id would just fail every join).
  return underscore > 0 ? shopSku.slice(0, underscore) : shopSku;
}

/** One Lazada order line aggregated from its per-unit item objects (see {@link aggregateLines}). */
export type LazadaOrderLine = {
  /** Lazada product item_id (derived from shop_sku) — mirrors the listing's external product id. */
  itemId: string;
  /** Lazada SkuId — the external variant id that matches the imported listing. */
  skuId: string | null;
  /** The seller's own SKU (Lazada `sku`, fallback `seller_sku`) — the best field to auto-map by. */
  sellerSku: string | null;
  /** Lazada shop-scoped listing identifier. */
  shopSku: string | null;
  /** Lazada internal composite SKU. */
  sku: string | null;
  name: string;
  /** Variation label (e.g. size/color), if any. */
  variation: string | null;
  /** Unit count — Lazada returns one object per physical unit, so this is the row count. */
  quantity: number;
  /** Per-unit paid price (after item voucher); null when absent. */
  unitPaidPrice: number | null;
  currency: string | null;
  /** Distinct per-unit statuses for this line (usually one). */
  statuses: string[];
  /** Courier tracking number once packed/shipped (tracking_code; tracking_code_pre is unused). */
  trackingCode: string | null;
};

/** A Lazada order header stitched with its aggregated line items. */
export type LazadaOrderRecord = {
  orderId: string;
  orderNumber: string | null;
  /** Distinct item statuses across the order (Lazada's `statuses` array). */
  statuses: string[];
  /** ISO/offset timestamp string as returned by Lazada (GMT+8); caller parses to a Date. */
  createdAt: string | null;
  updatedAt: string | null;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  /** Header total (string in shop currency) — the authoritative order total. */
  price: string | null;
  currency: string | null;
  itemsCount: number | null;
  lines: LazadaOrderLine[];
  /** The raw header + items blob for logging/debugging. */
  raw: Record<string, unknown>;
};

/**
 * Result of a windowed order pull. `complete` is false when the page loop stopped early
 * (throttle-tail kept partial, or the MAX_PAGES safety cap was hit) — the caller must then NOT
 * advance its incremental cursor past the un-fetched (newest-updated) tail.
 */
export type LazadaOrdersResult = { records: LazadaOrderRecord[]; complete: boolean };

type LazadaApiOrder = {
  order_id?: number | string;
  order_number?: number | string;
  statuses?: unknown;
  created_at?: string;
  updated_at?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  price?: string | number;
  items_count?: number | string;
  currency?: string;
};

type LazadaOrdersGetData = { orders?: LazadaApiOrder[]; countTotal?: number; count?: number };

type LazadaApiOrderItem = {
  order_item_id?: number | string;
  order_id?: number | string;
  item_id?: number | string;
  sku_id?: number | string;
  sku?: string;
  shop_sku?: string;
  seller_sku?: string;
  name?: string;
  variation?: string;
  paid_price?: string | number;
  item_price?: string | number;
  currency?: string;
  status?: string;
  tracking_code?: string;
};

type LazadaMultiItemsEntry = { order_id?: number | string; order_items?: LazadaApiOrderItem[] };

/** Read a Lazada `statuses` value (array of strings) defensively. */
function readStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

/** Stable grouping key so identical-SKU units collapse into one ordered line. */
function lineKey(item: LazadaApiOrderItem): string {
  const variant =
    readString(item.seller_sku) ??
    readString(item.shop_sku) ??
    readString(item.sku) ??
    readString(item.sku_id) ??
    `${readString(item.item_id) ?? ''}|${readString(item.variation) ?? ''}`;
  return `${readString(item.item_id) ?? ''}::${variant}`;
}

/**
 * Collapse Lazada's one-object-per-unit item rows into per-SKU lines: quantity = unit count,
 * unitPaidPrice = the per-unit paid_price (identical across a SKU's units), tracking = the
 * first non-empty tracking_code, statuses = the distinct per-unit statuses.
 */
function aggregateLines(items: LazadaApiOrderItem[]): LazadaOrderLine[] {
  const byLine = new Map<string, LazadaOrderLine>();

  for (const item of items) {
    const key = lineKey(item);
    const existing = byLine.get(key);
    const status = readString(item.status);
    const tracking = readString(item.tracking_code);

    if (existing) {
      existing.quantity += 1;
      if (status && !existing.statuses.includes(status)) existing.statuses.push(status);
      if (!existing.trackingCode && tracking) existing.trackingCode = tracking;
      continue;
    }

    byLine.set(key, {
      itemId: deriveItemId(item),
      skuId: readString(item.sku_id),
      // Real Lazada order items put the SELLER's own SKU in `sku` (there is no `seller_sku`
      // field); `shop_sku` is the Lazada composite. Prefer an explicit seller_sku if a region
      // ever sends one, else fall back to `sku`.
      sellerSku: readString(item.seller_sku) ?? readString(item.sku),
      shopSku: readString(item.shop_sku),
      sku: readString(item.sku),
      name: readString(item.name) ?? 'Lazada item',
      variation: readString(item.variation),
      quantity: 1,
      unitPaidPrice: readNumber(item.paid_price) ?? readNumber(item.item_price),
      currency: readString(item.currency),
      statuses: status ? [status] : [],
      trackingCode: tracking,
    });
  }

  return [...byLine.values()];
}

/** Group a GetMultipleOrderItems response (grouped-by-order OR flat) into items-per-order. */
function groupItemsByOrder(data: unknown): Map<string, LazadaApiOrderItem[]> {
  const byOrder = new Map<string, LazadaApiOrderItem[]>();
  if (!Array.isArray(data)) return byOrder;

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;

    const grouped = entry as LazadaMultiItemsEntry;
    if (Array.isArray(grouped.order_items)) {
      const orderId = readString(grouped.order_id) ?? '';
      const list = byOrder.get(orderId) ?? [];
      list.push(...grouped.order_items);
      byOrder.set(orderId, list);
      continue;
    }

    const item = entry as LazadaApiOrderItem;
    const orderId = readString(item.order_id) ?? '';
    const list = byOrder.get(orderId) ?? [];
    list.push(item);
    byOrder.set(orderId, list);
  }

  return byOrder;
}

/** Call an endpoint, backing off + retrying while Lazada returns a transient throttle code. */
async function callWithRetry<T>(
  client: LazadaClient,
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined>,
  maxRetries: number,
  delayMs: number,
): Promise<LazadaResponse<T>> {
  let response = await client.call<T>(path, { method: 'GET', accessToken, params });
  for (
    let attempt = 1;
    attempt <= maxRetries &&
    !isLazadaSuccess(response) &&
    isTransientLazadaError(response.code, response.message);
    attempt += 1
  ) {
    await sleep(delayMs * 2 * attempt);
    response = await client.call<T>(path, { method: 'GET', accessToken, params });
  }
  return response;
}

/** Fetch + stitch line items for a page of order ids, batched to stay under flow control. */
async function fetchOrderItems(
  client: LazadaClient,
  accessToken: string,
  orderIds: string[],
): Promise<Map<string, LazadaApiOrderItem[]>> {
  const byOrder = new Map<string, LazadaApiOrderItem[]>();

  for (let start = 0; start < orderIds.length; start += ITEMS_BATCH_SIZE) {
    const chunk = orderIds.slice(start, start + ITEMS_BATCH_SIZE);
    // Lazada wants a bare JSON array of numbers, e.g. [123,456] — not quoted ids.
    const orderIdsParam = `[${chunk.join(',')}]`;

    const response = await callWithRetry<unknown>(
      client,
      ORDER_ITEMS_GET_PATH,
      accessToken,
      { order_ids: orderIdsParam },
      MAX_ITEMS_RETRIES,
      ITEMS_DELAY_MS,
    );

    if (!isLazadaSuccess(response)) {
      throw new LazadaApiError(response.code, response.message);
    }

    for (const [orderId, items] of groupItemsByOrder(response.data)) {
      const list = byOrder.get(orderId) ?? [];
      list.push(...items);
      byOrder.set(orderId, list);
    }

    if (start + ITEMS_BATCH_SIZE < orderIds.length) await sleep(ITEMS_DELAY_MS);
  }

  return byOrder;
}

/**
 * Fetches a Lazada shop's orders changed within a window and stitches each header with its
 * line items. Two round-trips per page: `/orders/get` returns headers only (no items), then
 * `/orders/items/get` batch-hydrates the page's order ids — Lazada returns one object per
 * physical unit, which {@link aggregateLines} collapses into per-SKU lines with a quantity.
 *
 * Pass `updateAfter` (preferred — catches status transitions) or `createdAfter`; one is
 * required by Lazada. Both are ISO8601 strings WITH a timezone offset (e.g.
 * `2026-06-01T00:00:00+07:00`). Throws {@link LazadaApiError} on a non-success envelope.
 *
 * VERIFY against a live shop: exact snake_case field names, the GetMultipleOrderItems batch
 * cap, and whether order items carry `sku_id` (the listing-matching external variant id).
 */
export async function fetchLazadaOrders(
  client: LazadaClient,
  params: {
    accessToken: string;
    updateAfter?: string;
    createdAfter?: string;
    status?: string;
    /**
     * When Lazada keeps throttling after retries: 'throw' (default) or 'partial' (return what
     * was collected so far — fine for the order pull, which upserts idempotently).
     */
    onThrottle?: 'throw' | 'partial';
  },
): Promise<LazadaOrdersResult> {
  if (!params.updateAfter && !params.createdAfter) {
    throw new LazadaApiError('PARAM', 'Lazada GetOrders requires updateAfter or createdAfter.');
  }

  const sortBy = params.updateAfter ? 'updated_at' : 'created_at';
  const headers: LazadaApiOrder[] = [];
  // Only "complete" if the loop reached the window's natural end (empty/short page); a
  // throttle-partial break or the MAX_PAGES cap leaves it false so the cursor won't skip the tail.
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const queryParams = {
      update_after: params.updateAfter,
      created_after: params.createdAfter,
      status: params.status,
      sort_by: sortBy,
      sort_direction: 'ASC',
      limit: PAGE_LIMIT,
      offset: page * PAGE_LIMIT,
    };

    const response = await callWithRetry<LazadaOrdersGetData>(
      client,
      ORDERS_GET_PATH,
      params.accessToken,
      queryParams,
      MAX_PAGE_RETRIES,
      PAGE_DELAY_MS,
    );

    if (!isLazadaSuccess(response)) {
      // The pull is idempotent + re-runnable, so a throttled tail can keep what it has.
      if (
        params.onThrottle === 'partial' &&
        headers.length > 0 &&
        isTransientLazadaError(response.code, response.message)
      ) {
        break;
      }
      throw new LazadaApiError(response.code, response.message);
    }

    const orders = response.data?.orders ?? [];
    if (orders.length === 0) {
      complete = true;
      break;
    }
    headers.push(...orders);

    if (orders.length < PAGE_LIMIT) {
      complete = true;
      break;
    }
    await sleep(PAGE_DELAY_MS);
  }

  if (headers.length === 0) return { records: [], complete };

  const orderIds = headers
    .map((order) => readString(order.order_id))
    .filter((id): id is string => id !== null && id !== '');
  const itemsByOrder = await fetchOrderItems(client, params.accessToken, orderIds);

  const records = headers.map((order) => {
    const orderId = readString(order.order_id) ?? '';
    const lines = aggregateLines(itemsByOrder.get(orderId) ?? []);
    return {
      orderId,
      orderNumber: readString(order.order_number),
      statuses: readStatuses(order.statuses),
      createdAt: readString(order.created_at),
      updatedAt: readString(order.updated_at),
      buyerFirstName: readString(order.customer_first_name),
      buyerLastName: readString(order.customer_last_name),
      price: readString(order.price),
      currency: readString(order.currency) ?? lines.find((line) => line.currency)?.currency ?? null,
      itemsCount: readNumber(order.items_count),
      lines,
      raw: { order, items: itemsByOrder.get(orderId) ?? [] } as Record<string, unknown>,
    };
  });

  return { records, complete };
}
