import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inbound-order correctness gaps, exercised through the real pullFromConnections
 * service code with Prisma / the order adapter / the queue mocked:
 *  - Gap 1: a previously-applied order that flips to CANCELLED restocks exactly
 *    once (guarded by inventoryRevertedAt); a never-applied cancel is a no-op.
 *  - Gap 2: stock propagation from an inbound order excludes the source channel.
 */

type TxClient = {
  order: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  orderItem: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
};

const { state, prismaMock, txMock, enqueueMock, inventoryMock, fetchOrdersMock } = vi.hoisted(
  () => {
    const txMock: TxClient = {
      order: { upsert: vi.fn(), update: vi.fn() },
      orderItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    return {
      // Per-test knobs.
      state: {
        saved: {} as Record<string, unknown>,
        variantId: 'v1' as string | null,
        orders: [] as unknown[],
      },
      txMock,
      fetchOrdersMock: vi.fn(),
      enqueueMock: vi.fn(),
      inventoryMock: {
        applyOrderDecrementTx: vi.fn().mockResolvedValue(0),
        applyOrderRestockTx: vi.fn().mockResolvedValue(0),
      },
      prismaMock: {
        marketplaceConnection: { findMany: vi.fn(), update: vi.fn() },
        marketplaceProduct: { findUnique: vi.fn() },
        inventory: { findUnique: vi.fn() },
        order: { findFirst: vi.fn() },
        $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
      },
    };
  },
);

vi.mock('@olshop/db', () => ({ prisma: prismaMock }));
vi.mock('@olshop/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/inventory/services/inventory-server.service', () => ({
  inventoryServerService: inventoryMock,
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

describe('pullFromConnections — Gap 1 (cancellation restock)', () => {
  it('restocks a previously-applied order that is now CANCELLED', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = {
      id: 'o1',
      status: 'CANCELLED',
      marketplaceConnectionId: CONN_ID,
      inventoryAppliedAt: new Date('2026-01-11T00:00:00.000Z'),
      inventoryRevertedAt: null,
    };

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderRestockTx).toHaveBeenCalledTimes(1);
    expect(inventoryMock.applyOrderRestockTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ userId: USER, variantId: 'v1', quantity: 2, orderId: 'o1' }),
    );
    expect(inventoryMock.applyOrderDecrementTx).not.toHaveBeenCalled();
    // inventoryRevertedAt is stamped so a re-pull won't restock again.
    const updateArgs = txMock.order.update.mock.calls.at(-1)?.[0] as {
      data: { inventoryRevertedAt: Date };
    };
    expect(updateArgs.data.inventoryRevertedAt).toBeInstanceOf(Date);
    expect(result.reverted).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('does not double-restock an order that was already reverted', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = {
      id: 'o1',
      status: 'CANCELLED',
      marketplaceConnectionId: CONN_ID,
      inventoryAppliedAt: new Date('2026-01-11T00:00:00.000Z'),
      inventoryRevertedAt: new Date('2026-01-12T00:00:00.000Z'),
    };

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderRestockTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not restock a cancelled order that was never applied', async () => {
    state.orders = [orderFromAdapter('CANCELLED')];
    state.saved = {
      id: 'o1',
      status: 'CANCELLED',
      marketplaceConnectionId: CONN_ID,
      inventoryAppliedAt: null,
      inventoryRevertedAt: null,
    };

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderRestockTx).not.toHaveBeenCalled();
    expect(result.reverted).toBe(0);
  });
});

describe('pullFromConnections — Gap 2 (exclude source channel)', () => {
  it('decrements a PAID order and propagates excluding the order source channel', async () => {
    state.orders = [orderFromAdapter('PAID')];
    state.saved = {
      id: 'o1',
      status: 'PAID',
      marketplaceConnectionId: CONN_ID,
      inventoryAppliedAt: null,
      inventoryRevertedAt: null,
    };

    const result = await service.pullFromConnections(USER);

    expect(inventoryMock.applyOrderDecrementTx).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const payload = enqueueMock.mock.calls[0]?.[0] as {
      variantId: string;
      excludeConnectionId: string;
    };
    expect(payload.variantId).toBe('v1');
    expect(payload.excludeConnectionId).toBe(CONN_ID);
  });
});
