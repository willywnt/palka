import 'server-only';

import { getServerEnv } from '@palka/config/env.server';
import {
  createLazadaClient,
  fetchLazadaOrders,
  LazadaApiError,
} from '@palka/marketplace-providers';
import { acquireProviderToken } from '@palka/queue';
import type { LazadaClient, LazadaOrderRecord } from '@palka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import { OrderError } from '../errors/order-errors';
import type {
  FetchOrdersResult,
  MarketplaceOrderAdapter,
  NormalizedOrder,
  NormalizedOrderItem,
  NormalizedOrderStatus,
} from './order-adapter';

const DEFAULT_BASE_URL = 'https://api.lazada.co.id/rest';

/** Lazada ID gateway timezone (GMT+7); the window filter must carry an explicit offset. */
const LAZADA_REGION_OFFSET = '+07:00';
const LAZADA_REGION_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Re-pull overlap that absorbs clock skew + Lazada's eventual consistency (upserts dedupe). */
const OVERLAP_MS = 10 * 60 * 1000;
/** First-ever pull window when a store has never been pulled. */
const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lazada status token → our normalized order status. `pending` is PAID-and-awaiting-pack on
 * Lazada (the buyer has already paid), NOT "unpaid" — so it reserves stock. `ready_to_ship`
 * stays PAID (seller still holds the parcel) so the reservation isn't consumed too early.
 * Returns route through the Returns module, so they normalize to CANCELLED/keep-fulfilled and
 * never auto-credit stock here. Unknown tokens map to null and are ignored.
 */
const LAZADA_ORDER_STATUS_MAP: Record<string, NormalizedOrderStatus> = {
  unpaid: 'PENDING',
  // `confirmed` is a post-payment, pre-pack state (seen on real orders, incl. digital goods) —
  // the buyer has paid and the order is actionable, so it reserves stock like `pending`.
  confirmed: 'PAID',
  pending: 'PAID',
  processing: 'PAID',
  packed: 'PAID',
  repacked: 'PAID',
  ready_to_ship: 'PAID',
  topack: 'PAID',
  toship: 'PAID',
  shipped: 'SHIPPED',
  delivered: 'COMPLETED',
  canceled: 'CANCELLED',
  cancelled: 'CANCELLED',
  returned: 'CANCELLED',
  failed: 'CANCELLED',
  shipped_back: 'CANCELLED',
  shipped_back_success: 'CANCELLED',
  package_returned: 'CANCELLED',
  lost: 'CANCELLED',
  damaged: 'CANCELLED',
  // A return is in-flight but stock is NOT back yet — keep the fulfilled state; the actual
  // restock happens via the Returns module once Lazada marks the line returned/canceled.
  return_waiting_for_approval: 'SHIPPED',
  return_shipped_by_customer: 'SHIPPED',
  return_rejected: 'COMPLETED',
};

const STATUS_PROGRESS: Record<NormalizedOrderStatus, number> = {
  PENDING: 0,
  PAID: 1,
  SHIPPED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function normalizeStatusToken(token: string): NormalizedOrderStatus | null {
  return LAZADA_ORDER_STATUS_MAP[token.trim().toLowerCase()] ?? null;
}

/**
 * Reduces an order's mixed per-item statuses to ONE normalized status, conservatively for
 * stock: the LEAST-progressed non-cancelled item wins (so a partly-shipped order stays PAID
 * until every line ships), and an order is only CANCELLED when all items are. Unknown-only
 * orders default to PENDING (never touch stock).
 */
export function reduceLazadaStatuses(tokens: string[]): NormalizedOrderStatus {
  const normalized = tokens
    .map(normalizeStatusToken)
    .filter((status): status is NormalizedOrderStatus => status !== null);
  if (normalized.length === 0) return 'PENDING';

  const active = normalized.filter((status) => status !== 'CANCELLED');
  if (active.length === 0) return 'CANCELLED';

  let best = active[0]!;
  for (const status of active) {
    if (STATUS_PROGRESS[status] < STATUS_PROGRESS[best]) best = status;
  }
  return best;
}

/** Format an instant as the Lazada window param `YYYY-MM-DDTHH:mm:ss+07:00`. */
function formatLazadaWindow(date: Date): string {
  const shifted = new Date(date.getTime() + LAZADA_REGION_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 19)}${LAZADA_REGION_OFFSET}`;
}

/**
 * Parses a Lazada timestamp to a Date. Accepts ISO8601 with offset and the
 * `yyyy-MM-dd HH:mm:ss +0800` form; returns null when unparseable.
 */
function parseLazadaDate(value: string | null): Date | null {
  if (!value) return null;
  let normalized = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})$/.exec(
    normalized,
  );
  if (match && match[1] && match[2] && match[3] && match[4]) {
    normalized = `${match[1]}T${match[2]}${match[3]}:${match[4]}`;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNormalizedOrder(record: LazadaOrderRecord): NormalizedOrder {
  const statusTokens =
    record.statuses.length > 0 ? record.statuses : record.lines.flatMap((line) => line.statuses);
  const trackingNumber = record.lines.find((line) => line.trackingCode)?.trackingCode ?? null;
  const buyerName =
    [record.buyerFirstName, record.buyerLastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ') || null;
  const placedAt =
    parseLazadaDate(record.createdAt) ?? parseLazadaDate(record.updatedAt) ?? new Date();

  const items: NormalizedOrderItem[] = record.lines.map((line) => ({
    externalProductId: line.itemId,
    // Prefer Lazada's SkuId (matches the imported listing's external variant id); fall back to
    // shop_sku/sku — but NOT itemId (product-level, not variant-unique: it would collapse a
    // product's variants to one key). seller_sku → externalSku lets the pull resolve by SKU.
    externalVariantId: line.skuId ?? line.shopSku ?? line.sku ?? '',
    externalSku: line.sellerSku ?? line.shopSku ?? null,
    externalName: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPaidPrice,
    // Per-line status — Lazada statuses are per item, so a line cancelled within an otherwise
    // shipped order is visible to the lifecycle (released, not consumed).
    status: reduceLazadaStatuses(line.statuses),
  }));

  return {
    externalOrderId: record.orderId,
    status: reduceLazadaStatuses(statusTokens),
    trackingNumber,
    buyerName,
    totalAmount: parseAmount(record.price),
    currency: record.currency,
    placedAt,
    updatedAt: parseLazadaDate(record.updatedAt),
    items,
    raw: record.raw,
  };
}

function wrapLazadaError(error: unknown): never {
  if (error instanceof LazadaApiError) {
    throw OrderError.validation(
      `Lazada order pull failed (code ${error.code}${
        error.providerMessage ? `: ${error.providerMessage}` : ''
      }).`,
    );
  }
  throw error;
}

/**
 * Pulls a Lazada shop's recent orders via the shared LazOP order fetchers and normalizes each
 * to a cross-provider {@link NormalizedOrder}. Real provider adapter — replaces the stub for
 * LAZADA once the app credentials are configured. The incremental window comes from `since`
 * (the connection's last pull); idempotent upserts in the ingest service make the overlap safe.
 */
export class LazadaOrderAdapter implements MarketplaceOrderAdapter {
  readonly provider: MarketplaceProvider = 'LAZADA';
  private readonly client: LazadaClient;

  constructor() {
    const env = getServerEnv();
    this.client = createLazadaClient({
      appKey: env.LAZADA_APP_KEY ?? '',
      appSecret: env.LAZADA_APP_SECRET ?? '',
      baseUrl: env.LAZADA_API_BASE_URL ?? DEFAULT_BASE_URL,
    });
  }

  async fetchOrders(params: {
    shopId: string;
    shopCipher: string | null;
    accessToken: string;
    since?: Date;
    full?: boolean;
  }): Promise<FetchOrdersResult> {
    // A full re-pull (or a never-synced store) backfills a fixed window; otherwise resume from
    // the cursor minus an overlap that absorbs clock skew + Lazada's eventual consistency.
    const windowStart =
      params.since && !params.full
        ? new Date(params.since.getTime() - OVERLAP_MS)
        : new Date(Date.now() - BACKFILL_MS);

    try {
      // Pace the pull through the shared per-shop/per-app Redis budget (coordinated across the
      // import + sync + drift, multi-worker-safe). Coarse (one token before the paged pull) —
      // matches the periodic, cooldown-gated cadence of order pulls.
      await acquireProviderToken('LAZADA', params.shopId);
      const result = await fetchLazadaOrders(this.client, {
        accessToken: params.accessToken,
        updateAfter: formatLazadaWindow(windowStart),
        onThrottle: 'partial',
      });
      return { orders: result.records.map(toNormalizedOrder), complete: result.complete };
    } catch (error) {
      wrapLazadaError(error);
    }
  }
}
