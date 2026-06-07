import type { StockLedgerReason } from '@prisma/client';

export const STOCK_REASON_LABELS: Record<StockLedgerReason, string> = {
  MANUAL_ADJUST: 'Manual adjust',
  RESTOCK: 'Restock',
  DAMAGE: 'Damage',
  DAMAGE_WRITE_OFF: 'Damage write-off',
  RECONCILE: 'Reconcile',
  ORDER_RESERVE: 'Order reserved',
  ORDER_RELEASE: 'Order released',
  ORDER_SHIP: 'Order shipped',
  RETURN: 'Return',
  SALE: 'Offline sale',
  MARKETPLACE_SYNC: 'Marketplace sync',
};

export function stockReasonLabel(reason: StockLedgerReason): string {
  return STOCK_REASON_LABELS[reason];
}
