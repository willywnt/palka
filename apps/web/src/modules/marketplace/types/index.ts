import type { StockDriftStatus, StockDriftSummary } from '@palka/queue';
import type {
  MarketplaceImportStatus,
  MarketplaceMappingStatus,
  MarketplaceProvider,
  MarketplaceSyncStatus,
} from '@prisma/client';

import type { SkuMatchQuality } from '../utils/sku-match';
import type { TokenStatus } from '../utils/token-lifecycle';

export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'expired';

export type MarketplaceConnectionListItem = {
  id: string;
  provider: MarketplaceProvider;
  shopId: string;
  shopName: string;
  isActive: boolean;
  tokenExpiresAt: string | null;
  tokenStatus: TokenStatus;
  connectionStatus: MarketplaceConnectionStatus;
  createdAt: string;
  updatedAt: string;
  /** When this shop's listings were last imported (null = never). */
  lastImportedAt: string | null;
  /** When this shop's orders were last pulled (null = never) — shown in the pull dialog. */
  lastOrdersPulledAt: string | null;
  /**
   * Lazada multi-warehouse: the ONE warehouse Palka owns (stock push targets only it, leaving
   * the others untouched). null = single-warehouse bare path (behavior unchanged).
   */
  syncWarehouseCode: string | null;
  /** Distinct warehouseCodes seen across the shop's listings at import — the picker's options. */
  knownWarehouseCodes: string[];
  /** Commission rate as a percent string (e.g. "5.00"); "0" = no auto-derived commission. */
  commissionRate: string;
  /** Listings whose auto-map needs a human look (list endpoint only). */
  needsReviewCount?: number;
  /** Listings whose last stock push failed (list endpoint only). */
  failedSyncCount?: number;
};

export type MarketplaceConnectionDetail = MarketplaceConnectionListItem;

export const MARKETPLACE_CONNECTION_STATUS_LABELS: Record<MarketplaceConnectionStatus, string> = {
  connected: 'Terhubung',
  disconnected: 'Terputus',
  expired: 'Token kedaluwarsa',
};

export type MarketplaceListingMapping = {
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  syncEnabled: boolean;
  autoMapped: boolean;
  mappingStatus: MarketplaceMappingStatus;
  lastSyncStatus: MarketplaceSyncStatus | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

export type MarketplaceSuggestedVariant = {
  id: string;
  sku: string;
  name: string;
  productName: string;
  /** EXACT = identical SKU; NORMALIZED = same after case/separator/order normalization. */
  quality: SkuMatchQuality;
};

export type MarketplaceListingItem = {
  marketplaceProductId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  lastImportedAt: string;
  mapping: MarketplaceListingMapping | null;
  /** Exact-SKU candidate offered for unmapped listings (one-click mapping). */
  suggestedVariant: MarketplaceSuggestedVariant | null;
};

export type ImportListingsResult = {
  imported: number;
  autoMapped: number;
};

/**
 * A catalog-import run as the client sees it. Lazada imports are durable background jobs (the UI
 * polls until a terminal status); non-Lazada (stub) imports finish inline. `async=true` → keep
 * polling; `async=false` → terminal already. `id` is null for an inline (non-job) result.
 */
export type MarketplaceImportJobDto = {
  id: string | null;
  status: MarketplaceImportStatus;
  totalProducts: number | null;
  processedProducts: number;
  importedRows: number;
  autoMappedCount: number;
  errorCount: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  async: boolean;
};

export type MarketplaceHealthTone = 'ok' | 'warn' | 'danger';

/** A per-connection health snapshot, computed on-read from local data (no provider call). */
export type MarketplaceConnectionHealth = {
  connectionId: string;
  provider: MarketplaceProvider;
  shopId: string;
  shopName: string;
  isActive: boolean;
  connectionStatus: MarketplaceConnectionStatus;
  tokenStatus: TokenStatus;
  tokenExpiresAt: string | null;
  /** Whole days until the token expires; negative once expired, null when unset. */
  tokenExpiresInDays: number | null;
  tokenExpiringSoon: boolean;
  lastImportedAt: string | null;
  lastOrdersPulledAt: string | null;
  mappedCount: number;
  syncEnabledCount: number;
  needsReviewCount: number;
  failedSyncCount: number;
  /** Sync-job outcomes over the recent window (last 7 days). */
  recentSync: { success: number; failed: number; pending: number };
  tone: MarketplaceHealthTone;
};

export const MARKETPLACE_HEALTH_LABELS: Record<MarketplaceHealthTone, string> = {
  ok: 'Sehat',
  warn: 'Perlu perhatian',
  danger: 'Bermasalah',
};

// Drift shapes live in @palka/queue so the worker reconciliation job and this
// web service compute drift the same way; re-exported here for the client.
export type { StockDriftLine, StockDriftStatus, StockDriftSummary } from '@palka/queue';

export const STOCK_DRIFT_STATUS_LABELS: Record<StockDriftStatus, string> = {
  in_sync: 'Sinkron',
  over: 'Marketplace lebih banyak',
  under: 'Marketplace lebih sedikit',
  missing_external: 'Hilang di marketplace',
};

/** Status tone for the drift badge — over (oversell) is the most dangerous. */
export const STOCK_DRIFT_STATUS_TONE: Record<
  StockDriftStatus,
  'ok' | 'warn' | 'danger' | 'neutral'
> = {
  in_sync: 'ok',
  over: 'danger',
  under: 'warn',
  missing_external: 'neutral',
};

/** The result of a live drift check against one connection's provider. */
export type MarketplaceDriftReport = {
  connectionId: string;
  provider: MarketplaceProvider;
  shopName: string;
  checkedAt: string;
  summary: StockDriftSummary;
};
