import type { MarketplaceProvider } from '@prisma/client';

export type NormalizedOrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export type NormalizedOrderItem = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalName: string;
  quantity: number;
  unitPrice: number | null;
};

export type NormalizedOrder = {
  externalOrderId: string;
  status: NormalizedOrderStatus;
  noResi: string | null;
  buyerName: string | null;
  totalAmount: number | null;
  currency: string | null;
  placedAt: Date;
  items: NormalizedOrderItem[];
  raw: Record<string, unknown>;
};

export interface MarketplaceOrderAdapter {
  readonly provider: MarketplaceProvider;
  fetchOrders(params: { shopId: string; accessToken: string }): Promise<NormalizedOrder[]>;
}

function stubItem(
  shopId: string,
  index: number,
  sku: string,
  name: string,
  quantity: number,
): NormalizedOrderItem {
  return {
    // Mirrors StubMarketplaceImportAdapter's external ids so orders resolve via mappings.
    externalProductId: `${shopId}-P${index}`,
    externalVariantId: `${shopId}-V${index}`,
    externalSku: sku,
    externalName: name,
    quantity,
    unitPrice: 100_000,
  };
}

/**
 * Deterministic stand-in for a real order API that walks a scripted lifecycle so
 * the reserve → ship → release behavior is observable end-to-end across pulls:
 *
 *   pull #1   → all paid orders PAID                → each RESERVES stock (available−, reserved+)
 *   pull #2   → `${s}-SHIP`/`${s}-RETURN` → SHIPPED → reservation consumed (reserved−)
 *               `${s}-RELEASE` → CANCELLED          → reservation released (available+, reserved−)
 *   pull #3+  → `${s}-RETURN` → CANCELLED (post-ship) → auto-opens a RETURN (no stock credit)
 *               `${s}-RESERVE` stays PAID           → a standing reservation
 *               `${s}-PENDING` stays PENDING        → unpaid, never touches stock
 *
 * Each order references a distinct stub listing (mirrors StubMarketplaceImportAdapter's
 * external ids) so it resolves to a mapped internal variant. The per-shop pull counter
 * lives in memory, so the timeline restarts when the dev server restarts — the
 * idempotent lifecycle guards make any replay harmless. Real provider adapters replace
 * this without touching the ingest service.
 *
 * Note: each store has a 30s pull cooldown, so wait ~30s between pulls to advance a step.
 */
export class StubMarketplaceOrderAdapter implements MarketplaceOrderAdapter {
  constructor(readonly provider: MarketplaceProvider) {}

  private readonly pullCount = new Map<string, number>();

  fetchOrders(params: { shopId: string }): Promise<NormalizedOrder[]> {
    const s = params.shopId;
    const step = this.pullCount.get(s) ?? 0;
    this.pullCount.set(s, step + 1);

    const shipStatus: NormalizedOrderStatus = step === 0 ? 'PAID' : 'SHIPPED';
    const releaseStatus: NormalizedOrderStatus = step === 0 ? 'PAID' : 'CANCELLED';
    // PAID → SHIPPED (pull 2) → CANCELLED after shipping (pull 3+) = a return.
    const returnStatus: NormalizedOrderStatus =
      step === 0 ? 'PAID' : step === 1 ? 'SHIPPED' : 'CANCELLED';
    const raw = { source: 'stub', step };

    return Promise.resolve([
      {
        externalOrderId: `${s}-RESERVE`,
        status: 'PAID',
        noResi: `RESI-${s}-RESERVE`,
        buyerName: 'Budi (reserve)',
        totalAmount: 200_000,
        currency: 'IDR',
        placedAt: new Date(Date.UTC(2026, 0, 10)),
        items: [stubItem(s, 1, 'BLACK-S', 'Cotton Tee - Black / S', 2)],
        raw,
      },
      {
        externalOrderId: `${s}-SHIP`,
        status: shipStatus,
        noResi: `RESI-${s}-SHIP`,
        buyerName: 'Sari (ship)',
        totalAmount: 300_000,
        currency: 'IDR',
        placedAt: new Date(Date.UTC(2026, 0, 11)),
        items: [stubItem(s, 2, 'BLACK-M', 'Cotton Tee - Black / M', 3)],
        raw,
      },
      {
        externalOrderId: `${s}-RELEASE`,
        status: releaseStatus,
        noResi: releaseStatus === 'PAID' ? `RESI-${s}-RELEASE` : null,
        buyerName: 'Andi (release)',
        totalAmount: 150_000,
        currency: 'IDR',
        placedAt: new Date(Date.UTC(2026, 0, 12)),
        items: [stubItem(s, 4, 'NATURAL', 'Canvas Tote - Natural', 1)],
        raw,
      },
      {
        externalOrderId: `${s}-RETURN`,
        status: returnStatus,
        noResi: `RESI-${s}-RETURN`,
        buyerName: 'Citra (return)',
        totalAmount: 120_000,
        currency: 'IDR',
        placedAt: new Date(Date.UTC(2026, 0, 13)),
        items: [stubItem(s, 3, 'WHITE-M', 'Cotton Tee - White / M', 1)],
        raw,
      },
      {
        externalOrderId: `${s}-PENDING`,
        status: 'PENDING',
        noResi: null,
        buyerName: 'Dewi (pending)',
        totalAmount: 100_000,
        currency: 'IDR',
        placedAt: new Date(Date.UTC(2026, 0, 13)),
        items: [stubItem(s, 5, '300ML', 'Enamel Mug - 300ml', 3)],
        raw,
      },
    ]);
  }
}

const adapters = new Map<MarketplaceProvider, MarketplaceOrderAdapter>();

export function getMarketplaceOrderAdapter(provider: MarketplaceProvider): MarketplaceOrderAdapter {
  const existing = adapters.get(provider);
  if (existing) return existing;

  const adapter = new StubMarketplaceOrderAdapter(provider);
  adapters.set(provider, adapter);
  return adapter;
}
