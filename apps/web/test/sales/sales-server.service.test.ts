import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Offline POS sales service, exercised against the real service with Prisma, the
 * queue, and the inventory service mocked. Guards: createSale snapshots variants,
 * decrements each line via the inventory service (oversell allowed), propagates the
 * affected variants, and rejects an unknown variant; searchSellableVariants maps.
 */

type TxClient = {
  sale: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  saleRefund: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  // void/refund take a per-sale advisory lock (pg_advisory_xact_lock) via $executeRaw.
  $executeRaw: ReturnType<typeof vi.fn>;
};

const { prismaMock, txMock, enqueueMock, inventoryMock, catalogMock, notificationMock } =
  vi.hoisted(() => {
    const txMock: TxClient = {
      sale: { count: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
      saleRefund: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      $executeRaw: vi.fn(),
    };
    return {
      txMock,
      enqueueMock: vi.fn(),
      inventoryMock: {
        applyOfflineSaleTx: vi.fn().mockResolvedValue(0),
        applyOfflineSaleReversalTx: vi.fn().mockResolvedValue(0),
      },
      catalogMock: { resolveBundles: vi.fn().mockResolvedValue(new Map()) },
      notificationMock: { emit: vi.fn() },
      prismaMock: {
        productVariant: { findMany: vi.fn(), count: vi.fn() },
        sale: { findMany: vi.fn(), findFirst: vi.fn() },
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
vi.mock('@/modules/notifications/services/notification-server.service', () => ({
  notificationServerService: notificationMock,
}));

const { SalesServerService } = await import('@/modules/sales/services/sales-server.service');

const service = new SalesServerService();
const ORG = 'org-1';
const ACTOR = 'user-1';
const getSaleSpy = vi
  .spyOn(service, 'getSale')
  .mockResolvedValue({ id: 's1' } as Awaited<ReturnType<typeof service.getSale>>);

beforeEach(() => {
  prismaMock.marketplaceProductMapping.count.mockResolvedValue(1);
  prismaMock.inventory.findUnique.mockResolvedValue({ availableStock: -1 });
  txMock.sale.count.mockResolvedValue(0);
  txMock.sale.create.mockResolvedValue({ id: 's1', code: 'S00001' });
  txMock.sale.update.mockResolvedValue({});
  txMock.sale.findUnique.mockResolvedValue({ status: 'COMPLETED', _count: { refunds: 0 } });
  txMock.saleRefund.count.mockResolvedValue(0);
  txMock.saleRefund.create.mockResolvedValue({ id: 'rf1', code: 'RF00001' });
  txMock.saleRefund.findMany.mockResolvedValue([]);
  txMock.$executeRaw.mockResolvedValue(1);
  catalogMock.resolveBundles.mockResolvedValue(new Map());
});

describe('createSale', () => {
  const input = {
    items: [{ kind: 'variant' as const, variantId: 'v1', quantity: 2, unitPrice: 100_000 }],
    paymentMethod: 'CASH' as const,
  };

  it('snapshots the variant, decrements stock, and propagates (oversell allowed)', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([
      { id: 'v1', sku: 'BLACK-S', name: 'Black / S' },
    ]);

    await service.createSale(ORG, ACTOR, input);

    const createArgs = txMock.sale.create.mock.calls[0]?.[0] as {
      data: {
        code: string;
        totalAmount: number;
        userId: string;
        organizationId: string;
        items: { create: Array<{ sku: string }> };
      };
    };
    expect(createArgs.data.code).toBe('S00001');
    expect(createArgs.data.totalAmount).toBe(200_000);
    // The row is scoped to the organization; userId records the kasir (actor).
    expect(createArgs.data.userId).toBe(ACTOR);
    expect(createArgs.data.organizationId).toBe(ORG);
    expect(createArgs.data.items.create[0]?.sku).toBe('BLACK-S');

    expect(inventoryMock.applyOfflineSaleTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        organizationId: ORG,
        actorUserId: ACTOR,
        variantId: 'v1',
        quantity: 2,
        saleId: 's1',
      }),
    );
    // available went negative — still completes; propagation fires for the variant.
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      organizationId: ORG,
      actorUserId: ACTOR,
      variantId: 'v1',
    });
    expect(getSaleSpy).toHaveBeenCalledWith(ORG, 's1');
  });

  it('rejects a sale referencing a variant the organization does not own', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([]); // none found

    await expect(service.createSale(ORG, ACTOR, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(inventoryMock.applyOfflineSaleTx).not.toHaveBeenCalled();
  });

  it('explodes a bundle line into its components (qty × componentQty, bundleName stamped)', async () => {
    catalogMock.resolveBundles.mockResolvedValue(
      new Map([
        [
          'b1',
          {
            id: 'b1',
            name: 'Paket',
            sku: 'PKT',
            price: '150000',
            available: 5,
            components: [
              {
                productVariantId: 'c1',
                sku: 'C1',
                name: 'C1',
                quantity: 2,
                availableStock: 50,
                price: '100000',
                cost: null,
              },
            ],
          },
        ],
      ]),
    );

    await service.createSale(ORG, ACTOR, {
      items: [{ kind: 'bundle' as const, bundleId: 'b1', quantity: 2, unitPrice: 150_000 }],
      paymentMethod: 'CASH' as const,
    });

    // The component decrements by quantity × componentQty (2 × 2 = 4).
    expect(inventoryMock.applyOfflineSaleTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'c1', quantity: 4, saleId: 's1' }),
    );
    // The exploded line snapshots the bundle's name.
    const createArgs = txMock.sale.create.mock.calls[0]?.[0] as {
      data: { items: { create: Array<{ productVariantId: string; bundleName: string | null }> } };
    };
    expect(createArgs.data.items.create[0]).toMatchObject({
      productVariantId: 'c1',
      bundleName: 'Paket',
    });
  });
});

describe('voidSale', () => {
  it('restocks every line, marks the sale VOID, and propagates', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({
      id: 's1',
      code: 'S00001',
      status: 'COMPLETED',
      items: [{ productVariantId: 'v1', quantity: 2 }],
      refunds: [],
    });

    await service.voidSale(ORG, ACTOR, 's1');

    expect(inventoryMock.applyOfflineSaleReversalTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        organizationId: ORG,
        actorUserId: ACTOR,
        variantId: 'v1',
        quantity: 2,
        saleId: 's1',
      }),
    );
    expect(txMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { status: 'VOID' } }),
    );
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(getSaleSpy).toHaveBeenCalledWith(ORG, 's1');
  });

  it('refuses to void a sale that already has refunds (would double-restock)', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({
      id: 's1',
      code: 'S00001',
      status: 'PARTIALLY_REFUNDED',
      items: [{ productVariantId: 'v1', quantity: 2 }],
      refunds: [{ id: 'rf1' }],
    });

    await expect(service.voidSale(ORG, ACTOR, 's1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
    expect(txMock.sale.update).not.toHaveBeenCalled();
  });

  it('is a no-op for an already-voided sale', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({
      id: 's1',
      code: 'S00001',
      status: 'VOID',
      items: [{ productVariantId: 'v1', quantity: 2 }],
    });

    await service.voidSale(ORG, ACTOR, 's1');

    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
    expect(txMock.sale.update).not.toHaveBeenCalled();
    expect(getSaleSpy).toHaveBeenCalledWith(ORG, 's1');
  });

  it('throws NOT_FOUND for an unknown sale', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(null);

    await expect(service.voidSale(ORG, ACTOR, 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
  });
});

describe('createSaleRefund', () => {
  const sale = {
    id: 's1',
    code: 'S00001',
    status: 'COMPLETED',
    taxRate: 0,
    taxInclusive: false,
    items: [
      {
        id: 'si1',
        productVariantId: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        quantity: 5,
        unitPrice: 100_000,
        discountAmount: 0,
      },
    ],
    refunds: [],
  };

  it('refunds part of a sale: restocks the qty and flips status to PARTIALLY_REFUNDED', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(sale);

    await service.createSaleRefund(ORG, ACTOR, 's1', {
      items: [{ saleItemId: 'si1', quantity: 2 }],
    });

    const refundArgs = txMock.saleRefund.create.mock.calls[0]?.[0] as {
      data: { code: string; items: { create: Array<{ saleItemId: string; quantity: number }> } };
    };
    expect(refundArgs.data.code).toBe('RF00001');
    expect(refundArgs.data.items.create[0]).toMatchObject({ saleItemId: 'si1', quantity: 2 });
    expect(inventoryMock.applyOfflineSaleReversalTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, saleId: 's1' }),
    );
    expect(txMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { status: 'PARTIALLY_REFUNDED' } }),
    );
  });

  it('rejects an over-refund created by a concurrent refund (re-checks remaining in the tx)', async () => {
    // Outside read sees no prior refund (remaining 5 — passes), but a concurrent
    // refund of 4 committed before our tx, so the in-tx re-read leaves only 1.
    prismaMock.sale.findFirst.mockResolvedValue(sale);
    txMock.saleRefund.findMany.mockResolvedValue([{ items: [{ saleItemId: 'si1', quantity: 4 }] }]);

    await expect(
      service.createSaleRefund(ORG, ACTOR, 's1', { items: [{ saleItemId: 'si1', quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
    expect(txMock.sale.update).not.toHaveBeenCalled();
  });

  it('rejects a refund when the sale was voided concurrently (re-checks status in the tx)', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(sale); // outside read: COMPLETED
    txMock.sale.findUnique.mockResolvedValue({ status: 'VOID' }); // concurrent void committed

    await expect(
      service.createSaleRefund(ORG, ACTOR, 's1', { items: [{ saleItemId: 'si1', quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
  });

  it('rejects a refund on an already-voided sale (outside guard)', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({ ...sale, status: 'VOID' });

    await expect(
      service.createSaleRefund(ORG, ACTOR, 's1', { items: [{ saleItemId: 'si1', quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
  });
});

describe('searchSellableVariants', () => {
  it('maps active variants to the picker shape with price + stock', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        price: 100_000,
        inventory: { availableStock: 12, incomingStock: 20 },
        product: { name: 'Cotton Tee' },
      },
    ]);
    prismaMock.productVariant.count.mockResolvedValue(1);

    const result = await service.searchSellableVariants(ORG, {
      q: 'black',
      page: 1,
      pageSize: 10,
    });

    expect(result.items).toEqual([
      {
        variantId: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        productName: 'Cotton Tee',
        price: '100000',
        cost: null,
        availableStock: 12,
        incomingStock: 20,
      },
    ]);
    expect(result.meta.total).toBe(1);
  });
});
