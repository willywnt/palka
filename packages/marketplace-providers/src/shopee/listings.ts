import { isShopeeSuccess } from './client.js';
import type { ShopeeClient } from './types.js';

const ITEM_LIST_PATH = '/api/v2/product/get_item_list';
const ITEM_BASE_INFO_PATH = '/api/v2/product/get_item_base_info';
const MODEL_LIST_PATH = '/api/v2/product/get_model_list';

const PAGE_SIZE = 50;
/** Safety cap so a paging bug can't loop forever (≈2000 listings). */
const MAX_PAGES = 40;
/** get_item_base_info accepts up to 50 item_ids per call. */
const ID_BATCH = 50;
/** Gentle pacing so a large catalog stays under Shopee's per-shop QPS. */
const CALL_DELAY_MS = 250;

/** Postgres INT4 ceiling — our stock columns are 32-bit; clamp absurd provider values. */
const INT32_MAX = 2_147_483_647;

function clampStock(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(INT32_MAX, Math.floor(value)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
};

type ShopeeBaseInfoItem = {
  item_id?: number | string;
  item_name?: string;
  item_sku?: string;
  item_status?: string;
  has_model?: boolean;
};

type ShopeeBaseInfoData = { item_list?: ShopeeBaseInfoItem[] };

type ShopeeSellerStock = { location_id?: string; stock?: number };
type ShopeeModel = {
  model_id?: number | string;
  model_sku?: string;
  tier_index?: number[];
  stock_info_v2?: {
    seller_stock?: ShopeeSellerStock[];
    summary_info?: { total_available_stock?: number };
  };
};

type ShopeeModelListData = {
  tier_variation?: { name?: string; option_list?: { option?: string }[] }[];
  model?: ShopeeModel[];
};

/** Per-location sellable for a model (blank location codes dropped). */
function extractWarehouses(model: ShopeeModel): ShopeeWarehouseStock[] {
  return (model.stock_info_v2?.seller_stock ?? []).flatMap((entry) => {
    const code = entry.location_id?.trim();
    return code ? [{ code, sellable: clampStock(entry.stock) }] : [];
  });
}

/** Total sellable for a model: Σ seller_stock, else the summary's total. */
function extractModelQuantity(model: ShopeeModel): number {
  const sellerStock = model.stock_info_v2?.seller_stock;
  if (Array.isArray(sellerStock) && sellerStock.length > 0) {
    return clampStock(sellerStock.reduce((sum, entry) => sum + (entry.stock ?? 0), 0));
  }
  return clampStock(model.stock_info_v2?.summary_info?.total_available_stock);
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

  // No-variation item: Shopee returns no models — represent it as a single model_id 0 row.
  if (models.length === 0) {
    return [
      {
        itemId,
        modelId: '0',
        modelSku: base.item_sku ?? null,
        productName,
        variantName: null,
        quantity: 0,
        warehouses: [],
        status,
        raw: { item_id: base.item_id, item_sku: base.item_sku },
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
        modelSku: model.model_sku ?? base.item_sku ?? null,
        productName,
        variantName: buildVariantName(model, modelData.tier_variation),
        quantity: extractModelQuantity(model),
        warehouses: extractWarehouses(model),
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
  params: { accessToken: string; shopId: string; itemId: string },
): Promise<ShopeeModelListData> {
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
  params: { accessToken: string; shopId: string; itemIds: string[] },
): Promise<ShopeeBaseInfoItem[]> {
  const out: ShopeeBaseInfoItem[] = [];
  for (const batch of chunk(params.itemIds, ID_BATCH)) {
    const response = await client.call<ShopeeBaseInfoData>(ITEM_BASE_INFO_PATH, {
      method: 'GET',
      accessToken: params.accessToken,
      shopId: params.shopId,
      params: { item_id_list: batch.join(',') },
    });
    if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);
    out.push(...(response.response?.item_list ?? []));
    await sleep(CALL_DELAY_MS);
  }
  return out;
}

/** Flatten a set of items (base info + per-item model list) to per-model rows. */
async function expandItems(
  client: ShopeeClient,
  params: { accessToken: string; shopId: string; itemIds: string[] },
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
    await sleep(CALL_DELAY_MS);
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
      params: { offset: page * PAGE_SIZE, page_size: PAGE_SIZE, item_status: 'NORMAL' },
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
