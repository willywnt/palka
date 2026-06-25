import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inbound-order stock lifecycle, exercised through the real pullFromConnections
 * service code with Prisma / the order adapter / the queue mocked. Per order the
 * service advances at most one stage of reserve → ship → release, idempotently via
 * the order's inventory* timestamps, and propagates available changes excluding the
 * source channel (Gap 2). Ship does not change available, so it is not propagated.
 */

type TxClient = {
  order: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  orderItem: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  productVariant: { findMany: ReturnType<typeof vi.fn> };
};

const {
  state,
  prismaMock,
  txMock,
  enqueueMock,
  inventoryMock,
  fetchOrdersMock,
  logWarnMock,
  returnsMock,
} = vi.hoisted(() => {
  const txMock: TxClient = {
    order: { upsert: vi.fn(), update: vi.fn() },
    orderItem: { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    productVariant: { findMany: vi.fn() },
  };
  return {
    state: {
      saved: {} as Record<string, unknown>,
      variantId: 'v1' as string | null,
      orders: [] as unknown[],
    },
    txMock,
    fetchOrdersMock: vi.fn(),
    enqueueMock: vi.fn(),
    logWarnMock: vi.fn(),
    returnsMock: { createReturn: vi.fn().mockResolvedValue({}) },
    inventoryMock: {
      applyOrderReserveTx: vi.fn().mockResolvedValue(0),
      applyOrderShipTx: vi.fn().mockResolvedValue(0),
      applyOrderReleaseTx: vi.fn().mockResolvedValue(0),
    },
    prismaMock: {
      marketplaceConnection: { findMany: vi.fn(), update: vi.fn() },
      marketplaceProduct: { findMany: vi.fn() },
      inventory: { findUnique: vi.fn() },
      order: { findFirst: vi.fn(), updateMany: vi.fn() },
      recording: { count: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock('@falka/db', () => ({ prisma: prismaMock }));
vi.mock('@falka/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: logWarnMock, error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/inventory/services/inventory-server.service', () => ({
  inventoryServerService: inventoryMock,
}));
vi.mock('@/modules/returns/services/returns-server.service', () => ({
  returnsServerService: returnsMock,
}));
vi.mock('@/modules/marketplace/services/marketplace-mapping.service', () => ({
  marketplaceMappingService: { mapByExternalRef: vi.fn() },
}));
vi.mock('@/modules/orders/adapters/order-adapter', () => ({
  getMarketplaceOrderAdapter: () => ({ fetchOrders: fetchOrdersMock }),
}));

const { OrdersServerService } = await import('@/modules/orders/services/orders-server.service');

const service = new OrdersServerService();
const ORG = 'org-1';
const USER = 'user-1';
const CONN_ID = 'conn-A';
const APPLIED_AT = new Date('2026-01-11T00:00:00.000Z');
const SHIPPED_AT = new Date('2026-01-12T00:00:00.000Z');

function orderFromAdapter(status: string) {
  return {
    externalOrderId: 'EXT-1',
    status,
    noResi: 'RESI-1',
    buyerName: 'Budi',
    totalAmount: 200_000,
    currency: 'IDR',
    placedAt: new Date('2026-01-10T00:00:00.000Z'),
    items: [
      {
        externalProductId: 'P1',
        externalVariantId: 'V1',
        externalSku: 'BLACK-M',
        externalName: 'Cotton Tee - Black / M',
        quantity: 2,
        unitPrice: 100_000,
      },
    ],
    raw: { source: 'test' },
  };
}

/** A saved order row with the lifecycle timestamps defaulted to null. */
function savedOrder(overrides: Record<string, unknown>) {
  return {
    id: 'o1',
    marketplaceConnectionId: CONN_ID,
    inventoryAppliedAt: null,
    inventoryShippedAt: null,
    inventoryRevertedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.marketplaceConnection.findMany.mockResolvedValue([
    {
      id: CONN_ID,
      organizationId: ORG,
      userId: USER,
      provider: 'SHOPEE',
      shopId: 'shop-1',
      shopName: 'Toko A',
      lastOrdersPulledAt: null,
      ordersSyncedThrough: null,
    },
  ]);
  prismaMock.marketplaceConnection.update.mockResolvedValue({});
  // The pull resolves all order-line listings in one findMany. Return a listing
  // (mapped to state.variantId) for every item across the staged orders, or none
  // when the variant is unmapped — mirroring the per-item resolution it replaced.
  prismaMock.marketplaceProduct.findMany.mockImplementation(() =>
    Promise.resolve(
      state.variantId
        ? (
            state.orders as Array<{
              items: Array<{ externalProductId: string; externalVariantId: string }>;
            }>
          )
            .flatMap((order) => order.items)
            .map((item) => ({
              externalProductId: item.externalProductId,
              externalVariantId: item.externalVariantId,
              mapping: { productVariantId: state.variantId },
            }))
        : [],
    ),
  );
  prismaMock.inventory.findUnique.mockResolvedValue({ availableStock: 10 });
  // Default: a completed packing video exists (fulfillment can stamp); tests that need the
  // no-video path override this to 0.
  prismaMock.recording.count.mockResolvedValue(1);
  txMock.order.upsert.mockImplementation(() => Promise.resolve(state.saved));
  txMock.order.update.mockResolvedValue({});
  txMock.orderItem.deleteMany.mockResolvedValue({});
  txMock.orderItem.createMany.mockResolvedValue({});
  txMock.orderItem.updateMany.mockResolvedValue({});
  txMock.productVariant.findMany.mockResolvedValue([]);
  fetchOrdersMock.mockImplementation(() =>
    Promise.resolve({ orders: state.orders, complete: true }),
  );

  state.variantId = 'v1';
});

describe('pullFromConnections — reserve (PAID)', () => {
  it('reserves a freshly-paid order and propagates excluding the source channel', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = savedOrder({ status: 'PAID' });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReserveTx).toHaveBeenCalledTimes(1);
    expect(inventoryMock.applyOrderReserveTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, orderId: 'o1' }),
    );
    expect(result.applied).toBe(1);
    expect(result.shipped).toBe(0);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      variantId: 'v1',
      excludeConnectionId: CONN_ID,
    });
  });
});

describe('pullFromConnections — incremental cursor', () => {
  it('advances ordersSyncedThrough when the pull is complete', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = savedOrder({ status: 'PAID' });
    fetchOrdersMock.mockResolvedValueOnce({ orders: state.orders, complete: true });

    await service.pullFromConnections(ORG, USER);

    const data = (
      prismaMock.marketplaceConnection.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.lastOrdersPulledAt).toBeInstanceOf(Date);
    expect(data.ordersSyncedThrough).toBeInstanceOf(Date);
  });

  it('does NOT advance ordersSyncedThrough when the pull was truncated (incomplete)', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = savedOrder({ status: 'PAID' });
    fetchOrdersMock.mockResolvedValueOnce({ orders: state.orders, complete: false });

    await service.pullFromConnections(ORG, USER);

    const data = (
      prismaMock.marketplaceConnection.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.lastOrdersPulledAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('ordersSyncedThrough');
  });
});

describe('pullFromConnections — ship (SHIPPED/COMPLETED)', () => {
  it('reserves then ships an order first seen as SHIPPED', async () => {
    state.orders = [orderFromAdapter('SHIPPED')];
    state.saved = savedOrder({ status: 'SHIPPED' });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReserveTx).toHaveBeenCalledTimes(1);
    expect(inventoryMock.applyOrderShipTx).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(1);
    expect(result.shipped).toBe(1);
    // Reserve changed available → propagated; ship did not add anything extra.
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('only ships an already-reserved order and does NOT propagate (available unchanged)', async () => {
    state.orders = [orderFromAdapter('COMPLETED')];
    state.saved = savedOrder({ status: 'COMPLETED', inventoryAppliedAt: APPLIED_AT });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReserveTx).not.toHaveBeenCalled();
    expect(inventoryMock.applyOrderShipTx).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(0);
    expect(result.shipped).toBe(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not re-ship an order already shipped', async () => {
    state.orders = [orderFromAdapter('COMPLETED')];
    state.saved = savedOrder({
      status: 'COMPLETED',
      inventoryAppliedAt: APPLIED_AT,
      inventoryShippedAt: SHIPPED_AT,
    });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderShipTx).not.toHaveBeenCalled();
    expect(result.shipped).toBe(0);
  });
});

describe('pullFromConnections — release (CANCELLED)', () => {
  it('releases a reserved order that is cancelled before shipping', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = savedOrder({ status: 'CANCELLED', inventoryAppliedAt: APPLIED_AT });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReleaseTx).toHaveBeenCalledTimes(1);
    expect(result.reverted).toBe(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('auto-opens a return for a cancellation after shipping without crediting stock', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = savedOrder({
      status: 'CANCELLED',
      inventoryAppliedAt: APPLIED_AT,
      inventoryShippedAt: SHIPPED_AT,
    });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(returnsMock.createReturn).toHaveBeenCalledWith(ORG, USER, 'o1', { autoDetected: true });
  });

  it('does not release a cancelled order that was never reserved', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = savedOrder({ status: 'CANCELLED' });

    const result = await service.pullFromConnections(ORG, USER);

    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
  });
});

describe('runScheduledPull (VPS scheduler)', () => {
  it('pulls every due store across orgs and skips ones inside the per-provider cooldown', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = savedOrder({ status: 'PAID' });
    prismaMock.marketplaceConnection.findMany.mockResolvedValueOnce([
      {
        id: 'c-due',
        organizationId: ORG,
        userId: USER,
        provider: 'LAZADA',
        shopId: 's1',
        shopName: 'Due',
        lastOrdersPulledAt: null,
        ordersSyncedThrough: null,
      },
      {
        id: 'c-cooling',
        organizationId: ORG,
        userId: USER,
        provider: 'LAZADA',
        shopId: 's2',
        shopName: 'Cooling',
        lastOrdersPulledAt: new Date(), // just pulled → inside the 30s cooldown
        ordersSyncedThrough: null,
      },
    ]);

    const result = await service.runScheduledPull();

    expect(result.storesPulled).toBe(1);
    expect(fetchOrdersMock).toHaveBeenCalledTimes(1);
    expect(inventoryMock.applyOrderReserveTx).toHaveBeenCalledTimes(1);
  });
});

describe('findByResi / markFulfilledByResi (fulfillment)', () => {
  it('resolves the most recent order for a resi', async () => {
    prismaMock.order.findFirst.mockResolvedValue({ id: 'o9' });
    const getOrderSpy = vi
      .spyOn(service, 'getOrder')
      .mockResolvedValue({ id: 'o9' } as Awaited<ReturnType<typeof service.getOrder>>);

    const result = await service.findByResi(ORG, 'RESI-1');

    expect(getOrderSpy).toHaveBeenCalledWith(ORG, 'o9');
    expect(result).toMatchObject({ id: 'o9' });
    getOrderSpy.mockRestore();
  });

  it('returns null when no order matches the resi', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect(await service.findByResi(ORG, 'RESI-NONE')).toBeNull();
  });

  it('does NOT stamp fulfilledAt when no completed packing video exists for the resi', async () => {
    prismaMock.recording.count.mockResolvedValue(0);

    const count = await service.markFulfilledByResi(ORG, 'RESI-1');

    expect(count).toBe(0);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('stamps fulfilledAt only on not-yet-fulfilled matching orders (when a video exists)', async () => {
    prismaMock.recording.count.mockResolvedValue(1);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    const count = await service.markFulfilledByResi(ORG, 'RESI-1');

    expect(count).toBe(1);
    const args = prismaMock.order.updateMany.mock.calls[0]?.[0] as {
      where: {
        organizationId: string;
        noResi: { equals: string; mode: string };
        fulfilledAt: null;
      };
      data: { fulfilledAt: Date };
    };
    expect(args.where).toMatchObject({
      organizationId: ORG,
      noResi: { equals: 'RESI-1', mode: 'insensitive' },
      fulfilledAt: null,
    });
    expect(args.data.fulfilledAt).toBeInstanceOf(Date);
  });
});

/** A persisted order row (findFirst with items) for the manual-action paths. */
function persistedOrder(overrides: Record<string, unknown>) {
  return {
    id: 'o1',
    externalOrderId: 'EXT-1',
    marketplaceConnectionId: CONN_ID,
    status: 'PAID',
    noResi: 'RESI-1',
    inventoryAppliedAt: APPLIED_AT,
    inventoryShippedAt: null,
    inventoryRevertedAt: null,
    items: [{ productVariantId: 'v1', quantity: 2 }],
    ...overrides,
  };
}

describe('markOrderShipped (manual)', () => {
  it('ships a reserved PAID order: consumes the reservation and sets SHIPPED + resi', async () => {
    prismaMock.order.findFirst.mockResolvedValue(persistedOrder({}));
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const getOrderSpy = vi
      .spyOn(service, 'getOrder')
      .mockResolvedValue({ id: 'o1' } as Awaited<ReturnType<typeof service.getOrder>>);

    await service.markOrderShipped(ORG, USER, 'o1', { noResi: 'NEW-RESI' });

    expect(inventoryMock.applyOrderShipTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, orderId: 'o1' }),
    );
    expect(txMock.order.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'o1' },
      data: expect.objectContaining({ status: 'SHIPPED', noResi: 'NEW-RESI' }),
    });
    getOrderSpy.mockRestore();
  });

  it('refuses to ship an order that is not PAID', async () => {
    prismaMock.order.findFirst.mockResolvedValue(persistedOrder({ status: 'PENDING' }));
    await expect(service.markOrderShipped(ORG, USER, 'o1')).rejects.toThrow(/paid/i);
    expect(inventoryMock.applyOrderShipTx).not.toHaveBeenCalled();
  });

  it('refuses to ship a PAID order whose stock was never reserved', async () => {
    prismaMock.order.findFirst.mockResolvedValue(persistedOrder({ inventoryAppliedAt: null }));
    await expect(service.markOrderShipped(ORG, USER, 'o1')).rejects.toThrow(/not reserved/i);
    expect(inventoryMock.applyOrderShipTx).not.toHaveBeenCalled();
  });
});

describe('cancelOrder (manual)', () => {
  it('releases reserved stock, sets CANCELLED + reason, and propagates', async () => {
    prismaMock.order.findFirst.mockResolvedValue(persistedOrder({}));
    const getOrderSpy = vi
      .spyOn(service, 'getOrder')
      .mockResolvedValue({ id: 'o1' } as Awaited<ReturnType<typeof service.getOrder>>);

    await service.cancelOrder(ORG, USER, 'o1', { reason: 'Buyer changed mind' });

    expect(inventoryMock.applyOrderReleaseTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, orderId: 'o1' }),
    );
    expect(txMock.order.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'o1' },
      data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Buyer changed mind' }),
    });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    getOrderSpy.mockRestore();
  });

  it('refuses to cancel a shipped order (it is a return, not a release)', async () => {
    prismaMock.order.findFirst.mockResolvedValue(
      persistedOrder({ status: 'SHIPPED', inventoryShippedAt: SHIPPED_AT }),
    );
    await expect(service.cancelOrder(ORG, USER, 'o1', {})).rejects.toThrow(/return/i);
    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
  });

  it('cancels a never-reserved order without releasing stock', async () => {
    prismaMock.order.findFirst.mockResolvedValue(
      persistedOrder({ status: 'PENDING', inventoryAppliedAt: null }),
    );
    const getOrderSpy = vi
      .spyOn(service, 'getOrder')
      .mockResolvedValue({ id: 'o1' } as Awaited<ReturnType<typeof service.getOrder>>);

    await service.cancelOrder(ORG, USER, 'o1', {});

    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
    expect(txMock.order.update.mock.calls[0]?.[0]).toMatchObject({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    expect(enqueueMock).not.toHaveBeenCalled();
    getOrderSpy.mockRestore();
  });
});
