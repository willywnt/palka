import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gap 1 (cancellation restock): applyOrderRestockTx must add the cancelled units
 * back to available stock and append a positive-delta ORDER_RELEASE ledger row, so
 * the reorder velocity nets it out against the original ORDER_RESERVE. Prisma is
 * mocked — this guards the transaction body, not a real database.
 */

type TxClient = {
  inventory: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  stockLedger: { create: ReturnType<typeof vi.fn> };
};

const { txMock } = vi.hoisted(() => ({
  txMock: {
    inventory: { findUnique: vi.fn(), upsert: vi.fn() },
    stockLedger: { create: vi.fn() },
  } satisfies TxClient,
}));

vi.mock('@olshop/db', () => ({ prisma: {} }));
vi.mock('@olshop/queue', () => ({ enqueuePropagateInventoryStock: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { InventoryServerService } =
  await import('@/modules/inventory/services/inventory-server.service');

const service = new InventoryServerService();
const PARAMS = { userId: 'user-1', variantId: 'v1', quantity: 3, orderId: 'order-1' };

beforeEach(() => {
  txMock.inventory.upsert.mockResolvedValue({});
  txMock.stockLedger.create.mockResolvedValue({});
});

describe('applyOrderRestockTx', () => {
  it('adds the quantity back onto current available stock', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 5 });

    const balanceAfter = await service.applyOrderRestockTx(txMock as never, PARAMS);

    expect(balanceAfter).toBe(8);
    const upsertArgs = txMock.inventory.upsert.mock.calls[0]?.[0] as {
      update: { availableStock: number };
    };
    expect(upsertArgs.update.availableStock).toBe(8);
  });

  it('treats a missing inventory row as zero available', async () => {
    txMock.inventory.findUnique.mockResolvedValue(null);

    const balanceAfter = await service.applyOrderRestockTx(txMock as never, PARAMS);

    expect(balanceAfter).toBe(3);
  });

  it('writes a positive-delta ORDER_RELEASE / MARKETPLACE ledger row keyed to the order', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 5 });

    await service.applyOrderRestockTx(txMock as never, PARAMS);

    const ledgerArgs = txMock.stockLedger.create.mock.calls[0]?.[0] as {
      data: {
        delta: number;
        balanceAfter: number;
        reason: string;
        source: string;
        referenceId: string;
      };
    };
    expect(ledgerArgs.data).toMatchObject({
      delta: 3,
      balanceAfter: 8,
      reason: 'ORDER_RELEASE',
      source: 'MARKETPLACE',
      referenceId: 'order-1',
    });
  });
});
