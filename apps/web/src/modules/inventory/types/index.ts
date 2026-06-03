import type { StockLedgerReason, StockLedgerSource } from '@prisma/client';

import type { ReorderStatus } from '../utils/reorder-math';

export type { ReorderStatus };

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

export type InventoryDashboardSummary = {
  variantCount: number;
  totalAvailableUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  oversoldCount: number;
  /** Sum of available * cost, serialized; approximate (display KPI). */
  totalStockValue: string;
};

export type InventoryLowStockItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  availableStock: number;
  lowStockThreshold: number;
};

export type InventoryMovementItem = {
  id: string;
  variantSku: string;
  variantName: string;
  delta: number;
  reason: StockLedgerReason;
  source: StockLedgerSource;
  createdAt: string;
};

export type InventoryDashboard = {
  summary: InventoryDashboardSummary;
  lowStock: InventoryLowStockItem[];
  recentMovements: InventoryMovementItem[];
};

export type ReorderItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  availableStock: number;
  incomingStock: number;
  /** Net units sold inside the window (returns netted out). */
  unitsSold: number;
  /** Average units sold per day over the variant's effective window. */
  dailyVelocity: number;
  /** Days the available stock lasts at the current velocity; null = no demand. */
  daysOfCover: number | null;
  /** Units suggested to reorder up to the lead+target horizon. */
  suggestedReorderQty: number;
  status: ReorderStatus;
  /** available * cost, rounded + serialized; '0' when cost is unset. */
  stockValue: string;
};

export type ReorderSummary = {
  windowDays: number;
  leadTimeDays: number;
  targetCoverDays: number;
  /** Variants needing a reorder (URGENT or SOON). */
  reorderCount: number;
  /** Subset of reorderCount that will stock out within the lead time. */
  urgentCount: number;
  /** Variants holding stock with no sales past the dead-stock age. */
  deadStockCount: number;
  /** Sum of stock value across dead-stock variants, rounded + serialized. */
  deadStockValue: string;
};

export type ReorderReport = {
  summary: ReorderSummary;
  items: ReorderItem[];
};
