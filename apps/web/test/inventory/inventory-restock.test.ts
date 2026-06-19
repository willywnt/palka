import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gap 3 (reserved-vs-available lifecycle): the inbound-order stock trio.
 *  - reserve: available−, reserved+ (ORDER_RESERVE, negative available delta)
 *  - ship:    reserved− only, available unchanged (ORDER_SHIP, delta 0)
 *  - release: available+, reserved− (ORDER_RELEASE, positive available delta)
 * Prisma is mocked — this guards the transaction bodies, not a real database.
 */

type TxClient = {
  inventory: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  stockLedger: { create: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
};

const { txMock, warnMock } = vi.hoisted(() => ({
  txMock: {
    inventory: { findUnique: vi.fn(), upsert: vi.fn() },
    stockLedger: { create: vi.fn() },
    // Each mutation takes a per-variant advisory lock (pg_advisory_xact_lock) via
    // $executeRaw before the read-compute-write to serialize concurrent writers.
    $executeRaw: vi.fn(),
  } satisfies TxClient,
  warnMock: vi.fn(),
}));

vi.mock('@falka/db', () => ({ prisma: {} }));
vi.mock('@falka/queue', () => ({ enqueuePropagateInventoryStock: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: warnMock, error: vi.fn(), debug: vi.fn() },
}));

const { InventoryServerService } =
  await import('@/modules/inventory/services/inventory-server.service');

const service = new InventoryServerService();
const PARAMS = {
  organizationId: 'org-1',
  actorUserId: 'user-1',
  variantId: 'v1',
  quantity: 3,
  orderId: 'order-1',
};

function upsertUpdateArg() {
  return txMock.inventory.upsert.mock.calls[0]?.[0] as {
    update: { availableStock?: number; reservedStock?: number | { increment: number } };
  };
}
function ledgerArg() {
  return txMock.stockLedger.create.mock.calls[0]?.[0] as {
    data: {
      delta: number;
      balanceAfter: number;
      reason: string;
      source: string;
      referenceId: string;
    };
  };
}

beforeEach(() => {
  txMock.inventory.upsert.mockResolvedValue({});
  txMock.stockLedger.create.mockResolvedValue({});
  txMock.$executeRaw.mockResolvedValue(1);
});

describe('per-variant advisory lock', () => {
  it('takes an advisory lock before reading the inventory row', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 5, reservedStock: 1 });

    await service.applyOrderReserveTx(txMock as never, PARAMS);

    // The lock query runs (regression guard for the lost-update fix). $executeRaw is
    // a tagged template, so the first arg is the SQL strings array.
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    const sqlParts = txMock.$executeRaw.mock.calls[0]?.[0] as readonly string[];
    expect(sqlParts.join('')).toContain('pg_advisory_xact_lock');
  });
});

describe('applyOrderReserveTx', () => {
  it('drops available and bumps reserved, logging an ORDER_RESERVE row', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 5, reservedStock: 1 });

    const balanceAfter = await service.applyOrderReserveTx(txMock as never, PARAMS);

    expect(balanceAfter).toBe(2);
    expect(upsertUpdateArg().update).toMatchObject({
      availableStock: 2,
      reservedStock: { increment: 3 },
    });
    expect(ledgerArg().data).toMatchObject({
      delta: -3,
      balanceAfter: 2,
      reason: 'ORDER_RESERVE',
      source: 'MARKETPLACE',
      referenceId: 'order-1',
    });
  });

  it('allows available to go negative (channel oversell stays honest)', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 1, reservedStock: 0 });
    expect(await service.applyOrderReserveTx(txMock as never, PARAMS)).toBe(-2);
  });
});

describe('applyOrderShipTx', () => {
  it('consumes the reservation without touching available (ORDER_SHIP, delta 0)', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 2, reservedStock: 3 });

    const balanceAfter = await service.applyOrderShipTx(txMock as never, PARAMS);

    expect(balanceAfter).toBe(2);
    expect(upsertUpdateArg().update).toMatchObject({ reservedStock: 0 });
    expect(upsertUpdateArg().update.availableStock).toBeUndefined();
    expect(ledgerArg().data).toMatchObject({ delta: 0, balanceAfter: 2, reason: 'ORDER_SHIP' });
  });

  it('clamps reserved at 0 and warns for an order reserved before this lifecycle', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 5, reservedStock: 0 });

    await service.applyOrderShipTx(txMock as never, PARAMS);

    expect(upsertUpdateArg().update.reservedStock).toBe(0);
    expect(warnMock).toHaveBeenCalledWith(
      'inventory.reserved.underflow_clamped',
      expect.any(Object),
    );
  });
});

describe('applyOrderReleaseTx', () => {
  it('restores available and drops reserved (ORDER_RELEASE, positive delta)', async () => {
    txMock.inventory.findUnique.mockResolvedValue({ availableStock: 2, reservedStock: 3 });

    const balanceAfter = await service.applyOrderReleaseTx(txMock as never, PARAMS);

    expect(balanceAfter).toBe(5);
    expect(upsertUpdateArg().update).toMatchObject({ availableStock: 5, reservedStock: 0 });
    expect(ledgerArg().data).toMatchObject({
      delta: 3,
      balanceAfter: 5,
      reason: 'ORDER_RELEASE',
      source: 'MARKETPLACE',
      referenceId: 'order-1',
    });
  });
});
