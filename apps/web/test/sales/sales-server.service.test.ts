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
  };
};

const { prismaMock, txMock, enqueueMock, inventoryMock, catalogMock } = vi.hoisted(() => {
  const txMock: TxClient = { sale: { count: vi.fn(), create: vi.fn(), update: vi.fn() } };
  return {
    txMock,
    enqueueMock: vi.fn(),
    inventoryMock: {
      applyOfflineSaleTx: vi.fn().mockResolvedValue(0),
      applyOfflineSaleReversalTx: vi.fn().mockResolvedValue(0),
    },
    catalogMock: { resolveBundles: vi.fn().mockResolvedValue(new Map()) },
    prismaMock: {
      productVariant: { findMany: vi.fn() },
      sale: { findMany: vi.fn(), findFirst: vi.fn() },
      inventory: { findUnique: vi.fn() },
      marketplaceProductMapping: { count: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock('@olshop/db', () => ({ prisma: prismaMock }));
vi.mock('@olshop/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/inventory/services/inventory-server.service', () => ({
  inventoryServerService: inventoryMock,
}));
vi.mock('@/modules/catalog/services/catalog-server.service', () => ({
  catalogServerService: catalogMock,
}));

const { SalesServerService } = await import('@/modules/sales/services/sales-server.service');

const service = new SalesServerService();
const USER = 'user-1';
const getSaleSpy = vi
  .spyOn(service, 'getSale')
  .mockResolvedValue({ id: 's1' } as Awaited<ReturnType<typeof service.getSale>>);

beforeEach(() => {
  prismaMock.marketplaceProductMapping.count.mockResolvedValue(1);
  prismaMock.inventory.findUnique.mockResolvedValue({ availableStock: -1 });
  txMock.sale.count.mockResolvedValue(0);
  txMock.sale.create.mockResolvedValue({ id: 's1', code: 'S00001' });
  txMock.sale.update.mockResolvedValue({});
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

    await service.createSale(USER, input);

    const createArgs = txMock.sale.create.mock.calls[0]?.[0] as {
      data: { code: string; totalAmount: number; items: { create: Array<{ sku: string }> } };
    };
    expect(createArgs.data.code).toBe('S00001');
    expect(createArgs.data.totalAmount).toBe(200_000);
    expect(createArgs.data.items.create[0]?.sku).toBe('BLACK-S');

    expect(inventoryMock.applyOfflineSaleTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, saleId: 's1' }),
    );
    // available went negative — still completes; propagation fires for the variant.
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({ variantId: 'v1' });
    expect(getSaleSpy).toHaveBeenCalledWith(USER, 's1');
  });

  it('rejects a sale referencing a variant the user does not own', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([]); // none found

    await expect(service.createSale(USER, input)).rejects.toMatchObject({
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

    await service.createSale(USER, {
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
    });

    await service.voidSale(USER, 's1');

    expect(inventoryMock.applyOfflineSaleReversalTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', quantity: 2, saleId: 's1' }),
    );
    expect(txMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { status: 'VOID' } }),
    );
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(getSaleSpy).toHaveBeenCalledWith(USER, 's1');
  });

  it('is a no-op for an already-voided sale', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({
      id: 's1',
      code: 'S00001',
      status: 'VOID',
      items: [{ productVariantId: 'v1', quantity: 2 }],
    });

    await service.voidSale(USER, 's1');

    expect(inventoryMock.applyOfflineSaleReversalTx).not.toHaveBeenCalled();
    expect(txMock.sale.update).not.toHaveBeenCalled();
    expect(getSaleSpy).toHaveBeenCalledWith(USER, 's1');
  });

  it('throws NOT_FOUND for an unknown sale', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(null);

    await expect(service.voidSale(USER, 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
        inventory: { availableStock: 12 },
        product: { name: 'Cotton Tee' },
      },
    ]);

    const result = await service.searchSellableVariants(USER, 'black');

    expect(result).toEqual([
      {
        variantId: 'v1',
        sku: 'BLACK-S',
        name: 'Black / S',
        productName: 'Cotton Tee',
        price: '100000',
        availableStock: 12,
      },
    ]);
  });
});
