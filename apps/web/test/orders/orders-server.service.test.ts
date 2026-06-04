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
  orderItem: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
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
    orderItem: { deleteMany: vi.fn(), createMany: vi.fn() },
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
      marketplaceProduct: { findUnique: vi.fn() },
      inventory: { findUnique: vi.fn() },
      order: { findFirst: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock('@olshop/db', () => ({ prisma: prismaMock }));
vi.mock('@olshop/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
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
      provider: 'SHOPEE',
      shopId: 'shop-1',
      shopName: 'Toko A',
      lastOrdersPulledAt: null,
    },
  ]);
  prismaMock.marketplaceConnection.update.mockResolvedValue({});
  prismaMock.marketplaceProduct.findUnique.mockImplementation(() =>
    Promise.resolve(state.variantId ? { mapping: { productVariantId: state.variantId } } : null),
  );
  prismaMock.inventory.findUnique.mockResolvedValue({ availableStock: 10 });
  txMock.order.upsert.mockImplementation(() => Promise.resolve(state.saved));
  txMock.order.update.mockResolvedValue({});
  txMock.orderItem.deleteMany.mockResolvedValue({});
  txMock.orderItem.createMany.mockResolvedValue({});
  fetchOrdersMock.mockImplementation(() => Promise.resolve(state.orders));

  state.variantId = 'v1';
});

describe('pullFromConnections — reserve (PAID)', () => {
  it('reserves a freshly-paid order and propagates excluding the source channel', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = savedOrder({ status: 'PAID' });

    const result = await service.pullFromConnections(USER);

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

describe('pullFromConnections — ship (SHIPPED/COMPLETED)', () => {
  it('reserves then ships an order first seen as SHIPPED', async () => {
    state.orders = [orderFromAdapter('SHIPPED')];
    state.saved = savedOrder({ status: 'SHIPPED' });

    const result = await service.pullFromConnections(USER);

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

    const result = await service.pullFromConnections(USER);

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

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderShipTx).not.toHaveBeenCalled();
    expect(result.shipped).toBe(0);
  });
});

describe('pullFromConnections — release (CANCELLED)', () => {
  it('releases a reserved order that is cancelled before shipping', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = savedOrder({ status: 'CANCELLED', inventoryAppliedAt: APPLIED_AT });

    const result = await service.pullFromConnections(USER);

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

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(returnsMock.createReturn).toHaveBeenCalledWith(USER, 'o1', { autoDetected: true });
  });

  it('does not release a cancelled order that was never reserved', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = savedOrder({ status: 'CANCELLED' });

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderReleaseTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
  });
});

describe('findByResi / markFulfilledByResi (fulfillment)', () => {
  it('resolves the most recent order for a resi', async () => {
    prismaMock.order.findFirst.mockResolvedValue({ id: 'o9' });
    const getOrderSpy = vi
      .spyOn(service, 'getOrder')
      .mockResolvedValue({ id: 'o9' } as Awaited<ReturnType<typeof service.getOrder>>);

    const result = await service.findByResi(USER, 'RESI-1');

    expect(getOrderSpy).toHaveBeenCalledWith(USER, 'o9');
    expect(result).toMatchObject({ id: 'o9' });
    getOrderSpy.mockRestore();
  });

  it('returns null when no order matches the resi', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect(await service.findByResi(USER, 'RESI-NONE')).toBeNull();
  });

  it('stamps fulfilledAt only on not-yet-fulfilled matching orders', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    const count = await service.markFulfilledByResi(USER, 'RESI-1');

    expect(count).toBe(1);
    const args = prismaMock.order.updateMany.mock.calls[0]?.[0] as {
      where: { userId: string; noResi: string; fulfilledAt: null };
      data: { fulfilledAt: Date };
    };
    expect(args.where).toMatchObject({ userId: USER, noResi: 'RESI-1', fulfilledAt: null });
    expect(args.data.fulfilledAt).toBeInstanceOf(Date);
  });
});
