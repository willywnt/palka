import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stock-opname service, exercised against the real service with Prisma, the queue,
 * the inventory service, audit, and notifications mocked. Guards the count lifecycle:
 * add snapshots the system qty ONCE, scan tallies +1, posting writes one RECONCILE
 * per non-zero variance (skipping zero-variance lines) + completes + propagates, and
 * every mutating path refuses a non-DRAFT session.
 */

type TxClient = {
  stockOpname: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  stockOpnameItem: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const { prismaMock, txMock, enqueueMock, inventoryMock } = vi.hoisted(() => {
  const txMock: TxClient = {
    stockOpname: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    stockOpnameItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  return {
    txMock,
    enqueueMock: vi.fn(),
    inventoryMock: {
      applyReconcileTx: vi.fn().mockResolvedValue({ availableStock: 5, ledgerId: 'led-1' }),
    },
    prismaMock: {
      stockOpname: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      stockOpnameItem: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      productVariant: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      marketplaceProductMapping: { count: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock('@falka/db', () => ({
  prisma: prismaMock,
  buildPaginatedResult: (items: unknown[], total: number, page: number, pageSize: number) => ({
    items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }),
}));
vi.mock('@falka/queue', () => ({ enqueuePropagateInventoryStock: enqueueMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/db-retry', () => ({
  retryOnCodeCollision: (fn: () => unknown) => fn(),
}));
vi.mock('@/modules/inventory/services/inventory-server.service', () => ({
  inventoryServerService: inventoryMock,
}));
vi.mock('@/modules/audit/services/audit.service', () => ({ auditService: { log: vi.fn() } }));
vi.mock('@/modules/notifications/services/notification-server.service', () => ({
  notificationServerService: { emit: vi.fn() },
}));

const { StockOpnameService } = await import('@/modules/inventory/services/stock-opname.service');

const service = new StockOpnameService();
const ORG = 'org-1';
const USER = 'user-1';
const getSpy = vi
  .spyOn(service, 'getOpname')
  .mockResolvedValue({ id: 'op1' } as Awaited<ReturnType<typeof service.getOpname>>);

/** A variant in the COUNTABLE_SELECT shape (used by scan/search resolution). */
function countableVariant(availableStock: number) {
  return {
    id: 'v1',
    sku: 'BLACK-S',
    name: 'Black / S',
    variantGroup: null,
    imageUrl: null,
    product: { name: 'Cotton Tee' },
    inventory: { availableStock },
  };
}

beforeEach(() => {
  getSpy.mockResolvedValue({ id: 'op1' } as Awaited<ReturnType<typeof service.getOpname>>);
  prismaMock.marketplaceProductMapping.count.mockResolvedValue(1);
  inventoryMock.applyReconcileTx.mockResolvedValue({ availableStock: 5, ledgerId: 'led-1' });
  txMock.stockOpname.count.mockResolvedValue(0);
  txMock.stockOpname.create.mockResolvedValue({ id: 'op1', code: 'OP00001' });
  txMock.stockOpname.update.mockResolvedValue({});
  txMock.stockOpnameItem.findUnique.mockResolvedValue(null);
  txMock.stockOpnameItem.create.mockResolvedValue({});
  txMock.stockOpnameItem.update.mockResolvedValue({});
  prismaMock.stockOpnameItem.deleteMany.mockResolvedValue({ count: 1 });
});

describe('createOpname', () => {
  it('generates the per-org code OP00001 and stores the note', async () => {
    await service.createOpname(ORG, USER, { note: 'Cycle count gudang' });

    const args = txMock.stockOpname.create.mock.calls[0]?.[0] as {
      data: { code: string; note: string | null; userId: string };
    };
    expect(args.data.code).toBe('OP00001');
    expect(args.data.note).toBe('Cycle count gudang');
    expect(args.data.userId).toBe(USER);
    expect(getSpy).toHaveBeenCalledWith(ORG, 'op1');
  });
});

describe('upsertItem', () => {
  it('snapshots the system qty from live inventory on first add', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    prismaMock.productVariant.findFirst.mockResolvedValue({
      id: 'v1',
      sku: 'BLACK-S',
      name: 'Black / S',
      inventory: { availableStock: 10 },
    });
    prismaMock.stockOpnameItem.findUnique.mockResolvedValue(null);

    await service.upsertItem(ORG, 'op1', { variantId: 'v1', countedQuantity: 7 });

    const args = prismaMock.stockOpnameItem.create.mock.calls[0]?.[0] as {
      data: { systemQuantity: number; countedQuantity: number; variance: number };
    };
    expect(args.data.systemQuantity).toBe(10);
    expect(args.data.countedQuantity).toBe(7);
    expect(args.data.variance).toBe(-3);
  });

  it('keeps the original baseline on edit (does NOT re-snapshot live qty)', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    // Live qty has since moved to 99, but the line was first added at baseline 10.
    prismaMock.productVariant.findFirst.mockResolvedValue({
      id: 'v1',
      sku: 'BLACK-S',
      name: 'Black / S',
      inventory: { availableStock: 99 },
    });
    prismaMock.stockOpnameItem.findUnique.mockResolvedValue({ id: 'item1', systemQuantity: 10 });

    await service.upsertItem(ORG, 'op1', { variantId: 'v1', countedQuantity: 8 });

    const args = prismaMock.stockOpnameItem.update.mock.calls[0]?.[0] as {
      data: { countedQuantity: number; variance: number };
    };
    expect(args.data.countedQuantity).toBe(8);
    expect(args.data.variance).toBe(-2); // 8 − 10 (baseline), NOT 8 − 99
  });

  it('refuses to add to a closed (non-DRAFT) session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'COMPLETED' });

    await expect(
      service.upsertItem(ORG, 'op1', { variantId: 'v1', countedQuantity: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.stockOpnameItem.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown variant', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    prismaMock.productVariant.findFirst.mockResolvedValue(null);

    await expect(
      service.upsertItem(ORG, 'op1', { variantId: 'nope', countedQuantity: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws notFound when the opname is missing', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue(null);

    await expect(
      service.upsertItem(ORG, 'op1', { variantId: 'v1', countedQuantity: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('scanCountItem', () => {
  it('creates the line at 1 on first scan, snapshotting the system qty', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    prismaMock.productVariant.findFirst.mockResolvedValue(countableVariant(4));
    txMock.stockOpnameItem.findUnique.mockResolvedValue(null);

    const result = await service.scanCountItem(ORG, 'op1', 'BLACK-S');

    const args = txMock.stockOpnameItem.create.mock.calls[0]?.[0] as {
      data: { countedQuantity: number; systemQuantity: number; variance: number };
    };
    expect(args.data.countedQuantity).toBe(1);
    expect(args.data.systemQuantity).toBe(4);
    expect(args.data.variance).toBe(-3); // 1 − 4
    expect(result.matched?.countedQuantity).toBe(1);
  });

  it('increments the counted qty by 1 on a repeat scan', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    prismaMock.productVariant.findFirst.mockResolvedValue(countableVariant(4));
    txMock.stockOpnameItem.findUnique.mockResolvedValue({
      id: 'item1',
      systemQuantity: 4,
      countedQuantity: 2,
    });

    const result = await service.scanCountItem(ORG, 'op1', 'BLACK-S');

    const args = txMock.stockOpnameItem.update.mock.calls[0]?.[0] as {
      data: { countedQuantity: number; variance: number };
    };
    expect(args.data.countedQuantity).toBe(3);
    expect(args.data.variance).toBe(-1); // 3 − 4
    expect(result.matched?.countedQuantity).toBe(3);
  });

  it('returns matched:null when the code does not resolve (no tx)', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });
    prismaMock.productVariant.findFirst.mockResolvedValue(null);

    const result = await service.scanCountItem(ORG, 'op1', 'ghost');

    expect(result).toEqual({ matched: null, detail: null });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to scan into a closed session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'CANCELLED' });

    await expect(service.scanCountItem(ORG, 'op1', 'BLACK-S')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('completeOpname', () => {
  const draftWithVariances = {
    id: 'op1',
    code: 'OP00001',
    status: 'DRAFT',
    items: [
      { productVariantId: 'v1', variance: -3 },
      { productVariantId: 'v2', variance: 0 },
      { productVariantId: 'v3', variance: 5 },
    ],
  };

  it('posts one RECONCILE per non-zero variance, skips zero, and completes', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue(draftWithVariances);

    await service.completeOpname(ORG, USER, 'op1');

    expect(inventoryMock.applyReconcileTx).toHaveBeenCalledTimes(2);
    expect(inventoryMock.applyReconcileTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v1', delta: -3, note: 'Opname OP00001' }),
    );
    expect(inventoryMock.applyReconcileTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ variantId: 'v3', delta: 5 }),
    );
    const updateArgs = txMock.stockOpname.update.mock.calls[0]?.[0] as {
      data: { status: string; completedAt: Date };
    };
    expect(updateArgs.data.status).toBe('COMPLETED');
    expect(updateArgs.data.completedAt).toBeInstanceOf(Date);
    // Both corrected variants propagate to channels (mapping count mocked > 0).
    expect(enqueueMock).toHaveBeenCalledTimes(2);
  });

  it('refuses to post a non-DRAFT session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({
      ...draftWithVariances,
      status: 'COMPLETED',
    });

    await expect(service.completeOpname(ORG, USER, 'op1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(inventoryMock.applyReconcileTx).not.toHaveBeenCalled();
  });

  it('refuses to post an empty session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ ...draftWithVariances, items: [] });

    await expect(service.completeOpname(ORG, USER, 'op1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(inventoryMock.applyReconcileTx).not.toHaveBeenCalled();
  });
});

describe('cancelOpname', () => {
  it('cancels a DRAFT session without writing stock', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });

    await service.cancelOpname(ORG, 'op1');

    const args = prismaMock.stockOpname.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(args.data.status).toBe('CANCELLED');
    expect(inventoryMock.applyReconcileTx).not.toHaveBeenCalled();
  });

  it('refuses to cancel a non-DRAFT session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'COMPLETED' });

    await expect(service.cancelOpname(ORG, 'op1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.stockOpname.update).not.toHaveBeenCalled();
  });
});

describe('removeItem', () => {
  it('deletes a line scoped to the session (DRAFT only)', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'DRAFT' });

    await service.removeItem(ORG, 'op1', 'item1');

    expect(prismaMock.stockOpnameItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'item1', stockOpnameId: 'op1' },
    });
  });

  it('refuses to remove a line from a closed session', async () => {
    prismaMock.stockOpname.findFirst.mockResolvedValue({ id: 'op1', status: 'COMPLETED' });

    await expect(service.removeItem(ORG, 'op1', 'item1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.stockOpnameItem.deleteMany).not.toHaveBeenCalled();
  });
});

describe('searchCountableVariants', () => {
  it('maps variants to the current system quantity', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([countableVariant(12)]);
    prismaMock.productVariant.count.mockResolvedValue(1);

    const result = await service.searchCountableVariants(ORG, {
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
        variantGroup: null,
        systemQuantity: 12,
        imageUrl: null,
      },
    ]);
    expect(result.meta.total).toBe(1);
  });
});
