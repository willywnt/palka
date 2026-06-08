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
  /** Optional scan code; the QR action encodes `barcode ?? sku`. */
  barcode: string | null;
  variantName: string;
  /** Parent group label when this is a subvariant; null = standalone. */
  variantGroup: string | null;
  availableStock: number;
  /** Units committed to paid-not-shipped orders. on-hand = available + reserved. */
  reservedStock: number;
  /** Units written off from returns as unsellable. */
  damagedStock: number;
  /** Units on order from suppliers (purchase orders not yet received). */
  incomingStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
  /** When a QR/barcode label was last printed for this variant; null = never. */
  labelPrintedAt: string | null;
  /** When stock was last changed (ISO). */
  lastUpdatedAt: string | null;
};

export type InventoryDashboardSummary = {
  variantCount: number;
  totalAvailableUnits: number;
  /** Units committed to paid-not-shipped orders across all variants. */
  totalReservedUnits: number;
  /** Units written off as damaged (e.g. from returns) across all variants. */
  totalDamagedUnits: number;
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
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
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

/** One row of the stock activity log — a ledger entry joined to its variant. */
export type StockActivityItem = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
  delta: number;
  balanceAfter: number;
  reason: StockLedgerReason;
  source: StockLedgerSource;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
};

/** Stock units moved in (positive deltas) vs out (negative deltas) on one day. */
export type DailyMovementPoint = {
  /** UTC day, "YYYY-MM-DD". */
  date: string;
  in: number;
  out: number;
};

export type InventoryDashboard = {
  summary: InventoryDashboardSummary;
  lowStock: InventoryLowStockItem[];
  recentMovements: InventoryMovementItem[];
  /** Daily in/out stock flow over a recent window — for the dashboard trend chart. */
  dailyMovement: DailyMovementPoint[];
};

export type ReorderItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
  availableStock: number;
  incomingStock: number;
  /** Net units sold inside the window (returns netted out). */
  unitsSold: number;
  /** Average units sold per day over the variant's effective window. */
  dailyVelocity: number;
  /** Days the available stock lasts at the current velocity; null = no demand. */
  daysOfCover: number | null;
  /** Effective lead time used (per-variant override, else the request default). */
  leadTimeDays: number;
  /** Minimum order quantity applied; null = none. */
  minOrderQty: number | null;
  /** Units suggested to reorder up to the lead+target horizon (≥ MOQ when set). */
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
