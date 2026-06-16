import { computeStockDrift, resolveSyncWarehouseStock } from '@falka/queue';
import type { DriftExternalInput, DriftMappedInput } from '@falka/queue';
import { describe, expect, it } from 'vitest';

function mapped(
  overrides: Partial<DriftMappedInput> & { externalVariantId: string },
): DriftMappedInput {
  return {
    marketplaceProductId: `mp-${overrides.externalVariantId}`,
    externalProductId: 'P1',
    externalSku: `SKU-${overrides.externalVariantId}`,
    variantId: `v-${overrides.externalVariantId}`,
    variantSku: `SKU-${overrides.externalVariantId}`,
    variantName: 'Variant',
    productName: 'Product',
    internalAvailable: 10,
    syncEnabled: true,
    ...overrides,
  };
}

function external(externalVariantId: string, stock: number): DriftExternalInput {
  return { externalProductId: 'P1', externalVariantId, stock };
}

describe('computeStockDrift', () => {
  it('flags in_sync when external equals internal', () => {
    const result = computeStockDrift({
      mapped: [mapped({ externalVariantId: 'A', internalAvailable: 10 })],
      external: [external('A', 10)],
    });

    expect(result.totalMapped).toBe(1);
    expect(result.inSync).toBe(1);
    expect(result.drifted).toBe(0);
    expect(result.lines[0]?.status).toBe('in_sync');
    expect(result.lines[0]?.delta).toBe(0);
  });

  it('classifies over (external higher = oversell risk) and under', () => {
    const result = computeStockDrift({
      mapped: [
        mapped({ externalVariantId: 'OVER', internalAvailable: 5 }),
        mapped({ externalVariantId: 'UNDER', internalAvailable: 20 }),
      ],
      external: [external('OVER', 12), external('UNDER', 3)],
    });

    const over = result.lines.find((line) => line.externalVariantId === 'OVER');
    const under = result.lines.find((line) => line.externalVariantId === 'UNDER');

    expect(over?.status).toBe('over');
    expect(over?.delta).toBe(7);
    expect(under?.status).toBe('under');
    expect(under?.delta).toBe(-17);
    expect(result.drifted).toBe(2);
  });

  it('marks a mapped listing missing from the pull as missing_external', () => {
    const result = computeStockDrift({
      mapped: [mapped({ externalVariantId: 'GONE', internalAvailable: 4 })],
      external: [],
    });

    expect(result.missingExternal).toBe(1);
    expect(result.lines[0]?.status).toBe('missing_external');
    expect(result.lines[0]?.externalStock).toBeNull();
    expect(result.lines[0]?.delta).toBeNull();
  });

  it('treats external stock of 0 as a real value, not missing', () => {
    const result = computeStockDrift({
      mapped: [mapped({ externalVariantId: 'ZERO', internalAvailable: 8 })],
      external: [external('ZERO', 0)],
    });

    expect(result.missingExternal).toBe(0);
    expect(result.lines[0]?.status).toBe('under');
    expect(result.lines[0]?.externalStock).toBe(0);
    expect(result.lines[0]?.delta).toBe(-8);
  });

  it('counts external listings with no mapping as unmappedExternal', () => {
    const result = computeStockDrift({
      mapped: [mapped({ externalVariantId: 'A', internalAvailable: 10 })],
      external: [external('A', 10), external('STRANGER', 5)],
    });

    expect(result.unmappedExternal).toBe(1);
    expect(result.totalMapped).toBe(1);
  });

  it('counts a repeated unmapped external key only once (distinct keys)', () => {
    const result = computeStockDrift({
      mapped: [mapped({ externalVariantId: 'A', internalAvailable: 10 })],
      external: [external('A', 10), external('DUP', 5), external('DUP', 9)],
    });

    expect(result.unmappedExternal).toBe(1);
  });

  it('orders lines worst-first: bigger drift, then missing, then in-sync', () => {
    const result = computeStockDrift({
      mapped: [
        mapped({ externalVariantId: 'SYNCED', internalAvailable: 10 }),
        mapped({ externalVariantId: 'SMALL', internalAvailable: 10 }),
        mapped({ externalVariantId: 'BIG', internalAvailable: 10 }),
        mapped({ externalVariantId: 'MISSING', internalAvailable: 10 }),
      ],
      external: [external('SYNCED', 10), external('SMALL', 11), external('BIG', 40)],
    });

    expect(result.lines.map((line) => line.externalVariantId)).toEqual([
      'BIG',
      'SMALL',
      'MISSING',
      'SYNCED',
    ]);
  });

  it('returns a clean zero summary for an empty connection', () => {
    const result = computeStockDrift({ mapped: [], external: [] });

    expect(result).toMatchObject({
      totalMapped: 0,
      inSync: 0,
      drifted: 0,
      missingExternal: 0,
      unmappedExternal: 0,
      lines: [],
    });
  });
});

// Falka owns ONE marketplace warehouse: with a sync warehouse configured, drift compares
// against THAT warehouse's own sellable (Option A), not the cross-warehouse sum — otherwise
// other warehouses' stock would always read as drift.
describe('resolveSyncWarehouseStock', () => {
  const listing = {
    stock: 1155, // Σ across warehouses
    warehouses: [
      { code: 'dropshipping', sellable: 45 },
      { code: 'ID67YE4SPX-WH-10010', sellable: 1110 },
    ],
  };

  it('returns the sync warehouse sellable, not the cross-warehouse sum', () => {
    expect(resolveSyncWarehouseStock(listing, 'dropshipping')).toBe(45);
  });

  it('returns 0 when the SKU does not carry the sync warehouse', () => {
    expect(resolveSyncWarehouseStock(listing, 'ID67YE4SPX-WH-99999')).toBe(0);
  });

  it('falls back to the total sellable when no sync warehouse is configured', () => {
    expect(resolveSyncWarehouseStock(listing, null)).toBe(1155);
    expect(resolveSyncWarehouseStock(listing, '   ')).toBe(1155);
  });

  it('falls back to the total when the listing carries no per-warehouse data', () => {
    expect(resolveSyncWarehouseStock({ stock: 7 }, 'dropshipping')).toBe(7);
  });
});
