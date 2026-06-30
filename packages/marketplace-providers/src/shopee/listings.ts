import { isShopeeSuccess } from './client.js';
import { sleep } from './throttle.js';
import type { ShopeeClient } from './types.js';

const ITEM_LIST_PATH = '/api/v2/product/get_item_list';
const ITEM_BASE_INFO_PATH = '/api/v2/product/get_item_base_info';
const MODEL_LIST_PATH = '/api/v2/product/get_model_list';

/** Shopee `get_item_list` page size — the documented max is 100 (the old 50/E019 cap was a Lazada
 *  GetProducts rule, not Shopee's). 100 halves the number of list calls + conserves the daily quota. */
const PAGE_SIZE = 100;
/** Safety cap so a paging bug can't loop forever (≈4000 listings at PAGE_SIZE 100). */
const MAX_PAGES = 40;
/** get_item_base_info accepts up to 50 item_ids per call. */
const ID_BATCH = 50;
/** Gentle pacing so a large catalog stays under Shopee's per-shop QPS. */
const CALL_DELAY_MS = 250;

/** Shopee item_status enum (get_item_list `item_status` filter + get_item_base_info `item_status`). */
export const SHOPEE_ITEM_STATUSES = [
  'NORMAL',
  'BANNED',
  'UNLIST',
  'REVIEWING',
  'SELLER_DELETE',
  'SHOPEE_DELETE',
] as const;
export type ShopeeItemStatus = (typeof SHOPEE_ITEM_STATUSES)[number];

/** Only live, sellable listings are imported. */
const IMPORT_ITEM_STATUS: ShopeeItemStatus = 'NORMAL';

/** Postgres INT4 ceiling — our stock columns are 32-bit; clamp absurd provider values. */
const INT32_MAX = 2_147_483_647;

function clampStock(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(INT32_MAX, Math.floor(value)));
}

/** One location's current sellable stock for a model (Shopee `seller_stock`). */
export type ShopeeWarehouseStock = {
  code: string;
  sellable: number;
};

/** A Shopee listing flattened to one row per model (the externalVariant grain). */
export type ShopeeListingItem = {
  /** Shopee item_id — the external product id. */
  itemId: string;
  /** Shopee model_id — the external variant id ("0" for a no-variation item). */
  modelId: string;
  /** The seller's own SKU (Shopee model_sku / item_sku), if set. */
  modelSku: string | null;
  productName: string;
  /** Variation label built from the model's `tier` values (null when none). */
  variantName: string | null;
  /** Total sellable Shopee currently reports for this model (Σ across locations). */
  quantity: number;
  /** Per-location sellable (empty when the shop isn't multi-location). */
  warehouses: ShopeeWarehouseStock[];
  status: string;
  raw: Record<string, unknown>;
};

/** A non-success Shopee envelope from a listings call, carrying the provider code. */
export class ShopeeApiError extends Error {
  constructor(
    readonly code: string,
    readonly providerMessage?: string,
  ) {
    super(`Shopee API error (${code}${providerMessage ? `: ${providerMessage}` : ''})`);
    this.name = 'ShopeeApiError';
  }
}

// ── Loosely-typed API shapes ────────────────────────────────────────────────────────────
// VERIFY these field names against the live Shopee Open Platform docs when wiring sandbox —
// the v2 product APIs are stable but the stock object is version-tagged (stock_info_v2).

type ShopeeItemListData = {
  item?: { item_id?: number | string }[];
  has_next_page?: boolean;
  next_offset?: number;
  total_count?: number;
};

type ShopeeSellerStock = { location_id?: string; stock?: number };
/**
 * The `stock_info_v2` object Shopee returns at BOTH grains: the ITEM level for a no-variation item
 * (via get_item_base_info) and the MODEL level for a variation item (via get_model_list). Verified
 * live: `{ seller_stock: [{ location_id, stock }], summary_info: { total_available_stock } }`.
 */
type ShopeeStockInfoV2 = {
  seller_stock?: ShopeeSellerStock[];
  summary_info?: { total_available_stock?: number };
};

type ShopeeBaseInfoItem = {
  item_id?: number | string;
  item_name?: string;
  item_sku?: string;
  item_status?: string;
  has_model?: boolean;
  /** Present for a NO-VARIATION item — the item-level sellable stock. A variation item's stock is
   *  per-model in get_model_list instead. */
  stock_info_v2?: ShopeeStockInfoV2;
};

type ShopeeBaseInfoData = { item_list?: ShopeeBaseInfoItem[] };

type ShopeeModel = {
  model_id?: number | string;
  model_sku?: string;
  tier_index?: number[];
  stock_info_v2?: ShopeeStockInfoV2;
};

type ShopeeModelListData = {
  tier_variation?: { name?: string; option_list?: { option?: string }[] }[];
  model?: ShopeeModel[];
};

/** Per-location sellable from a stock_info_v2 (blank location codes dropped). */
function extractWarehouses(stock: ShopeeStockInfoV2 | undefined): ShopeeWarehouseStock[] {
  return (stock?.seller_stock ?? []).flatMap((entry) => {
    const code = entry.location_id?.trim();
    return code ? [{ code, sellable: clampStock(entry.stock) }] : [];
  });
}

/** Total sellable from a stock_info_v2: Σ seller_stock, else the summary's total. */
function extractQuantity(stock: ShopeeStockInfoV2 | undefined): number {
  const sellerStock = stock?.seller_stock;
  if (Array.isArray(sellerStock) && sellerStock.length > 0) {
    return clampStock(sellerStock.reduce((sum, entry) => sum + (entry.stock ?? 0), 0));
  }
  return clampStock(stock?.summary_info?.total_available_stock);
}

/** Empty/whitespace SKU → null so a blank Shopee SKU never poses as a real one to auto-map by. */
function cleanSku(value: string | null | undefined): string | null {
  return value && value.trim() !== '' ? value : null;
}

/** Build a variation label from a model's tier indices against the item's tier_variation. */
function buildVariantName(
  model: ShopeeModel,
  tiers: ShopeeModelListData['tier_variation'],
): string | null {
  if (!tiers || !model.tier_index) return null;
  const parts = model.tier_index.flatMap((optionIndex, tierIndex) => {
    const option = tiers[tierIndex]?.option_list?.[optionIndex]?.option?.trim();
    return option ? [option] : [];
  });
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Flatten one item's models into per-model listing rows (the externalVariant grain). */
function mapItemModels(
  base: ShopeeBaseInfoItem,
  modelData: ShopeeModelListData,
): ShopeeListingItem[] {
  const itemId = String(base.item_id ?? '');
  if (!itemId) return [];
  const productName = base.item_name ?? 'Shopee product';
  const status = base.item_status ?? 'NORMAL';
  const models = modelData.model ?? [];

  // No-variation item: get_model_list is empty — represent it as a single model_id 0 row, reading
  // the ITEM-level stock from get_item_base_info's stock_info_v2 (NOT 0 — verified live: a
  // no-variation item carries its sellable + per-location stock here, not in get_model_list).
  if (models.length === 0) {
    return [
      {
        itemId,
        modelId: '0',
        modelSku: cleanSku(base.item_sku),
        productName,
        variantName: null,
        quantity: extractQuantity(base.stock_info_v2),
        warehouses: extractWarehouses(base.stock_info_v2),
        status,
        raw: { item_id: base.item_id, item_sku: base.item_sku, stock_info_v2: base.stock_info_v2 },
      },
    ];
  }

  return models.flatMap((model) => {
    const modelId = String(model.model_id ?? '');
    if (!modelId) return [];
    return [
      {
        itemId,
        modelId,
        modelSku: cleanSku(model.model_sku) ?? cleanSku(base.item_sku),
        productName,
        variantName: buildVariantName(model, modelData.tier_variation),
        quantity: extractQuantity(model.stock_info_v2),
        warehouses: extractWarehouses(model.stock_info_v2),
        status,
        raw: { item_id: base.item_id, ...model } as Record<string, unknown>,
      },
    ];
  });
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

/** Fetch a model's per-location stock + tiers for one item (get_model_list). */
async function fetchModelData(
  client: ShopeeClient,
  params: { accessToken: string; shopId: string; itemId: string; beforeCall?: () => Promise<void> },
): Promise<ShopeeModelListData> {
  await params.beforeCall?.();
  const response = await client.call<ShopeeModelListData>(MODEL_LIST_PATH, {
    method: 'GET',
    accessToken: params.accessToken,
    shopId: params.shopId,
    params: { item_id: params.itemId },
  });
  if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);
  return response.response ?? {};
}

/** Resolve base info (names, has_model, sku, status) for a batch of item ids. */
async function fetchBaseInfo(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    itemIds: string[];
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeBaseInfoItem[]> {
  const out: ShopeeBaseInfoItem[] = [];
  for (const batch of chunk(params.itemIds, ID_BATCH)) {
    await params.beforeCall?.();
    const response = await client.call<ShopeeBaseInfoData>(ITEM_BASE_INFO_PATH, {
      method: 'GET',
      accessToken: params.accessToken,
      shopId: params.shopId,
      params: { item_id_list: batch.join(',') },
    });
    if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);
    out.push(...(response.response?.item_list ?? []));
    // When a rate limiter paces each call (beforeCall), the fixed sleep is redundant.
    if (!params.beforeCall) await sleep(CALL_DELAY_MS);
  }
  return out;
}

/** Flatten a set of items (base info + per-item model list) to per-model rows. */
async function expandItems(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    itemIds: string[];
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeListingItem[]> {
  const baseInfo = await fetchBaseInfo(client, params);
  const rows: ShopeeListingItem[] = [];

  for (const base of baseInfo) {
    const itemId = String(base.item_id ?? '');
    if (!itemId) continue;
    const modelData = base.has_model
      ? await fetchModelData(client, { ...params, itemId })
      : { model: [] };
    rows.push(...mapItemModels(base, modelData));
    if (!params.beforeCall) await sleep(CALL_DELAY_MS);
  }

  return rows;
}

/**
 * Fetches a Shopee shop's live listings: page `get_item_list`, resolve names via
 * `get_item_base_info`, then `get_model_list` per item, flattened to one row per model.
 * Shared by the web import adapter (snapshot + auto-map) and the worker drift job so both
 * read the same parsed shape. Throws `ShopeeApiError` on a non-success envelope.
 */
export async function fetchShopeeListings(
  client: ShopeeClient,
  params: { accessToken: string; shopId: string },
): Promise<ShopeeListingItem[]> {
  const itemIds: string[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.call<ShopeeItemListData>(ITEM_LIST_PATH, {
      method: 'GET',
      accessToken: params.accessToken,
      shopId: params.shopId,
      params: { offset: page * PAGE_SIZE, page_size: PAGE_SIZE, item_status: IMPORT_ITEM_STATUS },
    });
    if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);

    for (const entry of response.response?.item ?? []) {
      const id = String(entry.item_id ?? '');
      if (id) itemIds.push(id);
    }

    if (!response.response?.has_next_page) break;
    await sleep(CALL_DELAY_MS);
  }

  if (itemIds.length === 0) return [];
  return expandItems(client, { ...params, itemIds });
}

export type ShopeeListingsPage = {
  items: ShopeeListingItem[];
  /** Total items (products) Shopee reports (get_item_list `total_count`); undefined when absent. */
  total: number | undefined;
  /** Items (products) on this page — `< page_size` means the catalog is exhausted. */
  productCount: number;
};

/**
 * Fetch ONE page of a shop's listings at `offset`: page `get_item_list`, then expand that page's
 * items via base-info + model-list to per-model rows. Lets the caller drive the paging loop —
 * pacing each provider call through `beforeCall` (a rate limiter), streaming each page to the DB,
 * and checkpointing the offset to resume — instead of buffering the whole catalog. `beforeCall`
 * runs before EVERY underlying call (the list page + each base-info batch + each model-list).
 * Throws {@link ShopeeApiError} on a non-success envelope.
 */
export async function fetchShopeeListingsPage(
  client: ShopeeClient,
  params: {
    accessToken: string;
    shopId: string;
    offset: number;
    pageSize?: number;
    beforeCall?: () => Promise<void>;
  },
): Promise<ShopeeListingsPage> {
  const pageSize = params.pageSize ?? PAGE_SIZE;

  await params.beforeCall?.();
  const response = await client.call<ShopeeItemListData>(ITEM_LIST_PATH, {
    method: 'GET',
    accessToken: params.accessToken,
    shopId: params.shopId,
    params: { offset: params.offset, page_size: pageSize, item_status: IMPORT_ITEM_STATUS },
  });
  if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);

  const itemIds = (response.response?.item ?? []).flatMap((entry) => {
    const id = String(entry.item_id ?? '');
    return id ? [id] : [];
  });
  const items =
    itemIds.length === 0
      ? []
      : await expandItems(client, {
          accessToken: params.accessToken,
          shopId: params.shopId,
          itemIds,
          beforeCall: params.beforeCall,
        });

  return { items, total: response.response?.total_count, productCount: itemIds.length };
}

/**
 * Fetches CURRENT stock for a specific set of items (drift reconciliation) — avoids paging
 * the whole catalog when only a handful are mapped. Mirrors {@link fetchShopeeListings}'s
 * expansion for just the given ids.
 */
export async function fetchShopeeItemsStock(
  client: ShopeeClient,
  params: { accessToken: string; shopId: string; itemIds: string[] },
): Promise<ShopeeListingItem[]> {
  const uniqueIds = [...new Set(params.itemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  return expandItems(client, { ...params, itemIds: uniqueIds });
}
