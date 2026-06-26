import { beforeEach, describe, expect, it } from 'vitest';

import type { CartLine } from '@/modules/sales/components/pos-cart-types';
import { usePosHeldSalesStore } from '@/modules/sales/store/pos-held-sales.store';

function snapshot(label: string) {
  return {
    label,
    cart: [] as CartLine[],
    customerName: label,
    discount: { type: 'PERCENT' as const, value: 0 },
    tax: { enabled: false, rate: 11, inclusive: false },
  };
}

describe('pos-held-sales store', () => {
  beforeEach(() => usePosHeldSalesStore.setState({ heldSales: [] }));

  it('parks newest-first and removes by id', () => {
    const store = usePosHeldSalesStore.getState();
    store.holdSale(snapshot('A'));
    store.holdSale(snapshot('B'));

    const held = usePosHeldSalesStore.getState().heldSales;
    expect(held.map((h) => h.label)).toEqual(['B', 'A']);

    usePosHeldSalesStore.getState().removeHeldSale(held[0]!.id);
    expect(usePosHeldSalesStore.getState().heldSales.map((h) => h.label)).toEqual(['A']);
  });

  it('caps the list at 20 and drops the oldest', () => {
    for (let i = 0; i < 25; i += 1) usePosHeldSalesStore.getState().holdSale(snapshot(`S${i}`));

    const held = usePosHeldSalesStore.getState().heldSales;
    expect(held).toHaveLength(20);
    expect(held[0]?.label).toBe('S24'); // newest kept
    expect(held.at(-1)?.label).toBe('S5'); // oldest still kept (S0–S4 dropped)
  });
});
