import { isLazadaSuccess } from './client.js';
import type { LazadaClient } from './types.js';

const PRODUCTS_GET_PATH = '/products/get';
const PAGE_LIMIT = 50;
/** Safety cap so a paging bug can't loop forever (≈1000 listings). */
const MAX_PAGES = 20;
/** Pace pages so a large catalog doesn't trip Lazada's Sentinel flow control. */
const PAGE_DELAY_MS = 1200;
/** Retries for a single page when Lazada throttles it (E1002 sentinel / system busy). */
const MAX_PAGE_RETRIES = 4;

/** Postgres INT4 ceiling — our stock columns are 32-bit, and Lazada test shops can
 *  return absurd quantities (e.g. 1.37e12) that overflow the insert. */
const INT32_MAX = 2_147_483_647;

/** Clamp a provider quantity into a non-negative INT4 so it never overflows the DB. */
function clampStock(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(INT32_MAX, Math.floor(value)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lazada's flow-control / "system busy" responses are transient — the same call
 * usually succeeds after a short wait. Seen while paging a large catalog: E1002
 * ("third-party service sentinel") and E506 ("Get product failed"), both intermittent
 * backend throttles rather than bad input.
 */
function isTransientLazadaError(code: string, message: string | undefined): boolean {
  return (
    code === '1002' ||
    code === '506' ||
    code === 'SellerCallLimit' ||
    /sentinel|system\s*busy|flow\s*control|try\s*again|get product failed|access frequency|frequency exceeds/i.test(
      message ?? '',
    )
  );
}

type LazadaApiSku = {
  SkuId?: number | string;
  SellerSku?: string;
  quantity?: number;
  Status?: string;
};

type LazadaApiProduct = {
  item_id?: number | string;
  status?: string;
  attributes?: { name?: string };
  skus?: LazadaApiSku[];
};

type LazadaProductsGetData = { products?: LazadaApiProduct[] };

/** A Lazada listing flattened to one row per SKU (the externalVariant grain). */
export type LazadaListingItem = {
  /** Lazada item_id — the external product id. */
  itemId: string;
  /** Lazada SkuId — the external variant id. */
  skuId: string;
  /** The seller's own SKU (Lazada SellerSku), if set. */
  sellerSku: string | null;
  productName: string;
  /** Sellable quantity Lazada currently reports for this SKU. */
  quantity: number;
  status: string;
  /** The raw `{ item_id, ...sku }` blob for logging/debugging. */
  raw: Record<string, unknown>;
};

/** A non-success LazOP envelope from a listings call, carrying the provider code. */
export class LazadaApiError extends Error {
  constructor(
    readonly code: string,
    readonly providerMessage?: string,
  ) {
    super(`Lazada API error (code ${code}${providerMessage ? `: ${providerMessage}` : ''})`);
    this.name = 'LazadaApiError';
  }
}

/**
 * Fetches a Lazada shop's live listings via the LazOP `/products/get` API, paging
 * until exhausted, and flattens them to one row per SKU. Shared by the web import
 * adapter (snapshot + auto-map) and the worker drift-reconciliation job (compare
 * external quantity vs internal available) so both read the same parsed shape.
 * Throws `LazadaApiError` on a non-success envelope — callers wrap it in their
 * own domain/sync error. The response shape (item_id / attributes.name /
 * skus[].SkuId/SellerSku/quantity) is verified against the live LazOP gateway.
 */
export async function fetchLazadaListings(
  client: LazadaClient,
  params: {
    accessToken: string;
    /**
     * When Lazada keeps throttling a page after retries: 'throw' (default — correct
     * for drift, which needs the full set) or 'partial' (return what's collected so
     * far — used by import, which is idempotent and re-runnable).
     */
    onThrottle?: 'throw' | 'partial';
  },
): Promise<LazadaListingItem[]> {
  const items: LazadaListingItem[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response = await client.call<LazadaProductsGetData>(PRODUCTS_GET_PATH, {
      method: 'GET',
      accessToken: params.accessToken,
      params: { filter: 'all', limit: PAGE_LIMIT, offset: page * PAGE_LIMIT },
    });

    // Back off and retry this page when Lazada throttles it (a large catalog pages
    // many times — Sentinel flow control trips on the burst, not on bad input).
    for (
      let attempt = 1;
      attempt <= MAX_PAGE_RETRIES &&
      !isLazadaSuccess(response) &&
      isTransientLazadaError(response.code, response.message);
      attempt += 1
    ) {
      await sleep(PAGE_DELAY_MS * 2 * attempt);
      response = await client.call<LazadaProductsGetData>(PRODUCTS_GET_PATH, {
        method: 'GET',
        accessToken: params.accessToken,
        params: { filter: 'all', limit: PAGE_LIMIT, offset: page * PAGE_LIMIT },
      });
    }

    if (!isLazadaSuccess(response)) {
      // Import tolerates a throttled tail: keep the pages we already have instead of
      // discarding everything (it re-imports next time). Drift must be complete → throws.
      if (
        params.onThrottle === 'partial' &&
        items.length > 0 &&
        isTransientLazadaError(response.code, response.message)
      ) {
        break;
      }
      throw new LazadaApiError(response.code, response.message);
    }

    const products = response.data?.products ?? [];
    if (products.length === 0) break;

    for (const product of products) {
      const itemId = String(product.item_id ?? '');
      const productName = product.attributes?.name ?? 'Lazada product';

      for (const sku of product.skus ?? []) {
        const skuId = String(sku.SkuId ?? '');
        if (!itemId || !skuId) continue;

        items.push({
          itemId,
          skuId,
          sellerSku: sku.SellerSku ?? null,
          productName,
          quantity: clampStock(sku.quantity),
          status: sku.Status ?? product.status ?? 'active',
          raw: { item_id: product.item_id, ...sku } as Record<string, unknown>,
        });
      }
    }

    if (products.length < PAGE_LIMIT) break;

    // Gentle pacing before the next page keeps a large catalog under flow control.
    await sleep(PAGE_DELAY_MS);
  }

  return items;
}
