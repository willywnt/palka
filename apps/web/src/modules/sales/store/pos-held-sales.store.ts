import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CartLine } from '../components/pos-cart-types';

/** Past this, a "parked sales" list stops being a quick glance — drop the oldest. */
const MAX_HELD_SALES = 20;

export type HeldSaleDiscount = { type: 'PERCENT' | 'AMOUNT'; value: number };
export type HeldSaleTax = { enabled: boolean; rate: number; inclusive: boolean };

/**
 * A parked (held) POS transaction — the cashier sets a cart aside to serve another
 * customer, then resumes it. This is a CLIENT-SIDE DRAFT (user-owned in-progress UI
 * state, persisted per-browser), NOT cached server state: the lines are exactly what the
 * cashier built and are rung up at the held price on resume. It is not synced across
 * devices (a single register is the v1 scope).
 */
export type HeldSale = {
  id: string;
  /** A glanceable label (customer name, or a time fallback). */
  label: string;
  /** Epoch ms when parked — for display + ordering. */
  createdAt: number;
  cart: CartLine[];
  customerName: string;
  discount: HeldSaleDiscount;
  tax: HeldSaleTax;
};

type HeldSalesState = { heldSales: HeldSale[] };

type HeldSalesActions = {
  /** Park the current cart; newest first, capped. */
  holdSale: (sale: Omit<HeldSale, 'id' | 'createdAt'>) => void;
  /** Drop one (after resuming it, or discarding it). */
  removeHeldSale: (id: string) => void;
};

export type PosHeldSalesStore = HeldSalesState & HeldSalesActions;

export const usePosHeldSalesStore = create<PosHeldSalesStore>()(
  persist(
    (set) => ({
      heldSales: [],
      holdSale: (sale) =>
        set((state) => {
          const entry: HeldSale = { ...sale, id: crypto.randomUUID(), createdAt: Date.now() };
          const next = [entry, ...state.heldSales];
          return { heldSales: next.length > MAX_HELD_SALES ? next.slice(0, MAX_HELD_SALES) : next };
        }),
      removeHeldSale: (id) =>
        set((state) => ({ heldSales: state.heldSales.filter((held) => held.id !== id) })),
    }),
    { name: 'falka-pos-held-sales' },
  ),
);
