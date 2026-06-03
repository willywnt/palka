import type { StockLedgerReason, StockLedgerSource } from '@prisma/client';

export type InventorySnapshot = {
  variantId: string;
  availableStock: number;
  reservedStock: number;
  damagedStock: number;
  incomingStock: number;
  lastAdjustedAt: string | null;
};

export type StockLedgerEntryItem = {
  id: string;
  variantId: string;
  delta: number;
  balanceAfter: number;
  reason: StockLedgerReason;
  source: StockLedgerSource;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
};

export type InventoryView = {
  snapshot: InventorySnapshot;
  ledger: StockLedgerEntryItem[];
};

export type AdjustStockResult = {
  inventory: InventorySnapshot;
  entry: StockLedgerEntryItem;
};

export type StockOverviewItem = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  variantName: string;
  availableStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
};
