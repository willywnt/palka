import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Purchasing service, exercised against the real service with Prisma, the queue,
 * and the inventory service mocked. Guards: create bumps incoming per line; receive
 * moves incoming→available and recomputes status (partial vs full) + propagates;
 * cancel removes outstanding incoming; searchVariants maps.
 */

type TxClient = {
  purchaseOrder: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  purchaseOrderItem: { update: ReturnType<typeof vi.fn> };
};

const { prismaMock, txMock, enqueueMock, inventoryMock, catalogMock } = vi.hoisted(() => {
  const txMock: TxClient = {
    purchaseOrder: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    purchaseOrderItem: { update: vi.fn() },
  };
  return {
    txMock,
    enqueueMock: vi.fn(),
    inventoryMock: {
      adjustIncomingTx: vi.fn().mockResolvedValue(undefined),
      applyPurchaseReceiveTx: vi.fn().mockResolvedValue(0),
    },
    catalogMock: {
      resolveBundles: vi.fn().mockResolvedValue(new Map()),
    },
    prismaMock: {
      productVariant: { findMany: vi.fn(), count: vi.fn() },
      purchaseOrder: { findMany: vi.fn(), findFirst: vi.fn() },
      inventory: { findUnique: vi.fn() },
      marketplaceProductMapping: { count: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock('@falka/db', () => ({
  prisma: prismaMock,
  buildPaginatedResult: (items: unknown[], total: number, page: number, pageSize: number) => ({
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  }),
}));
vi.mock('@falka/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/inventory/services/inventory-server.service', () => ({
  inventoryServerService: inventoryMock,
}));
vi.mock('@/modules/catalog/services/bundle-server.service', () => ({
  bundleServerService: catalogMock,
}));

const { PurchasingServerService } =
  await import('@/modules/purchasing/services/purchasing-server.service');

const service = new PurchasingServerService();
const ORG = 'org-1';
const USER = 'user-1';
const getSpy = vi
  .spyOn(service, 'getPurchaseOrder')
  .mockResolvedValue({ id: 'po1' } as Awaited<ReturnType<typeof service.getPurchaseOrder>>);

beforeEach(() => {
  prismaMock.marketplaceProductMapping.count.mockResolvedValue(1);
  prismaMock.inventory.findUnique.mockResolvedValue({ availableStock: 20 });
  txMock.purchaseOrder.count.mockResolvedValue(0);
  txMock.purchaseOrder.create.mockResolvedValue({ id: 'po1', code: 'PO00001' });
  txMock.purchaseOrder.update.mockResolvedValue({});
  txMock.purchaseOrderItem.update.mockResolvedValue({});
  catalogMock.resolveBundles.mockResolvedValue(new Map());
});

describe('createPurchaseOrder', () => {
  it('snapshots the variant, sets the total, and bumps incoming per line', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([
      { id: 'v1', sku: 'BLACK-S', name: 'Black / S' },
    ]);

    await service.createPurchaseOrder(ORG, USER, {
      items: [{ kind: 'variant', variantId: 'v1', quantity: 20, unitCost: 50_000 }],
    });

    const args = txMock.purchaseOrder.create.mock.calls[0]?.[0] as {
      data: { code: string; totalCost: number; items: { create: Array<{ sku: string }> } };
    };
    expect(args.data.code).toBe('PO00001');
    expect(args.data.totalCost).toBe(1_000_000);
    expect(args.data.items.create[0]?.sku).toBe('BLACK-S');
    expect(inventoryMock.adjustIncomingTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', delta: 20 }),
    );
    expect(getSpy).toHaveBeenCalledWith(ORG, 'po1');
  });

  it('explodes a bundle line into per-component rows (qty × component qty, bundle-tagged)', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([]);
    catalogMock.resolveBundles.mockResolvedValue(
      new Map([
        [
          'b1',
          {
            id: 'b1',
            name: 'Paket',
            sku: 'PKT',
            price: '0',
            available: 9,
            components: [
              {
                productVariantId: 'c1',
                sku: 'C1',
                name: 'C1',
                quantity: 2,
                availableStock: 0,
                price: '0',
                cost: '5000',
              },
            ],
          },
        ],
      ]),
    );

    await service.createPurchaseOrder(ORG, USER, {
      items: [{ kind: 'bundle', bundleId: 'b1', quantity: 3, unitCost: 30_000 }],
    });

    const args = txMock.purchaseOrder.create.mock.calls[0]?.[0] as {
      data: {
        items: {
          create: Array<{ productVariantId: string; quantity: number; bundleName: string | null }>;
        };
      };
    };
    const componentLine = args.data.items.create[0];
    expect(componentLine?.productVariantId).toBe('c1');
    expect(componentLine?.quantity).toBe(6);
    expect(componentLine?.bundleName).toBe('Paket');
    expect(inventoryMock.adjustIncomingTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'c1', delta: 6 }),
    );
  });
});

describe('receivePurchaseOrder', () => {
  const orderedPo = {
    id: 'po1',
    status: 'ORDERED',
    items: [{ id: 'poi1', productVariantId: 'v1', quantity: 20, receivedQuantity: 0 }],
  };

  it('receives partially → PARTIALLY_RECEIVED, moves incoming→available, propagates', async () => {
    prismaMock.purchaseOrder.findFirst.mockResolvedValue(orderedPo);

    await service.receivePurchaseOrder(ORG, USER, 'po1', {
      lines: [{ purchaseOrderItemId: 'poi1', quantity: 5 }],
    });

    expect(inventoryMock.applyPurchaseReceiveTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 5, purchaseOrderId: 'po1' }),
    );
    const updateArgs = txMock.purchaseOrder.update.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArgs.data.status).toBe('PARTIALLY_RECEIVED');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('receives the remainder → RECEIVED + receivedAt', async () => {
    prismaMock.purchaseOrder.findFirst.mockResolvedValue(orderedPo);

    await service.receivePurchaseOrder(ORG, USER, 'po1', {
      lines: [{ purchaseOrderItemId: 'poi1', quantity: 20 }],
    });

    const updateArgs = txMock.purchaseOrder.update.mock.calls[0]?.[0] as {
      data: { status: string; receivedAt: Date | null };
    };
    expect(updateArgs.data.status).toBe('RECEIVED');
    expect(updateArgs.data.receivedAt).toBeInstanceOf(Date);
  });

  it('rejects receiving when nothing is outstanding', async () => {
    prismaMock.purchaseOrder.findFirst.mockResolvedValue({
      ...orderedPo,
      items: [{ id: 'poi1', productVariantId: 'v1', quantity: 20, receivedQuantity: 20 }],
    });

    await expect(
      service.receivePurchaseOrder(ORG, USER, 'po1', {
        lines: [{ purchaseOrderItemId: 'poi1', quantity: 5 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(inventoryMock.applyPurchaseReceiveTx).not.toHaveBeenCalled();
  });
});

describe('cancelPurchaseOrder', () => {
  it('removes the outstanding incoming and marks CANCELLED', async () => {
    prismaMock.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      status: 'ORDERED',
      items: [{ id: 'poi1', productVariantId: 'v1', quantity: 20, receivedQuantity: 5 }],
    });

    await service.cancelPurchaseOrder(ORG, USER, 'po1');

    expect(inventoryMock.adjustIncomingTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', delta: -15 }),
    );
    const updateArgs = txMock.purchaseOrder.update.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArgs.data.status).toBe('CANCELLED');
  });
});

describe('searchVariants', () => {
  it('maps variants with cost + available/incoming', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        cost: 50_000,
        inventory: { availableStock: 5, incomingStock: 20 },
        product: { name: 'Cotton Tee' },
      },
    ]);
    prismaMock.productVariant.count.mockResolvedValue(1);

    const result = await service.searchVariants(ORG, { q: 'black', page: 1, pageSize: 10 });

    expect(result.items).toEqual([
      {
        variantId: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        productName: 'Cotton Tee',
        cost: '50000',
        availableStock: 5,
        incomingStock: 20,
      },
    ]);
    expect(result.meta.total).toBe(1);
  });
});
