import type { MarketplaceAccountStatus } from '@prisma/client';

import { parseAccountMetadata } from './account-metadata';
import { getTokenStatus, isTokenExpired, isTokenExpiringSoon } from '../utils/token-lifecycle';

export type MarketplaceHealthIssue =
  | 'token_expired'
  | 'token_expiring_soon'
  | 'disconnected'
  | 'error'
  | 'reconnect_required'
  | 'sync_disabled'
  | 'refresh_failures';

export type MarketplaceAccountHealth = {
  status: MarketplaceAccountStatus;
  tokenStatus: ReturnType<typeof getTokenStatus>;
  issues: MarketplaceHealthIssue[];
  requiresReconnect: boolean;
  syncEligible: boolean;
  refreshFailureCount: number;
  lastValidatedAt: string | null;
  lastRefreshAt: string | null;
};

const RECONNECT_STATUSES: MarketplaceAccountStatus[] = ['EXPIRED', 'ERROR', 'RECONNECT_REQUIRED'];

const SYNC_BLOCKED_STATUSES: MarketplaceAccountStatus[] = [
  'DISCONNECTED',
  'ERROR',
  'RECONNECT_REQUIRED',
  'SYNC_DISABLED',
];

export function reconcileAccountStatus(
  storedStatus: MarketplaceAccountStatus,
  tokenExpiresAt: Date | null | undefined,
  now = new Date(),
): MarketplaceAccountStatus {
  if (storedStatus === 'DISCONNECTED' || storedStatus === 'SYNC_DISABLED') {
    return storedStatus;
  }

  if (storedStatus === 'ERROR' || storedStatus === 'RECONNECT_REQUIRED') {
    return storedStatus;
  }

  if (isTokenExpired(tokenExpiresAt, now)) {
    return 'EXPIRED';
  }

  if (storedStatus === 'EXPIRED' && !isTokenExpired(tokenExpiresAt, now)) {
    return 'CONNECTED';
  }

  return storedStatus === 'EXPIRED' ? 'EXPIRED' : 'CONNECTED';
}

export function resolveAccountHealth(
  status: MarketplaceAccountStatus,
  tokenExpiresAt: Date | null | undefined,
  metadataInput?: unknown,
  now = new Date(),
): MarketplaceAccountHealth {
  const metadata = parseAccountMetadata(metadataInput);
  const effectiveStatus = reconcileAccountStatus(status, tokenExpiresAt, now);
  const tokenStatus = getTokenStatus(tokenExpiresAt, now);
  const issues: MarketplaceHealthIssue[] = [];

  if (effectiveStatus === 'DISCONNECTED') issues.push('disconnected');
  if (effectiveStatus === 'ERROR') issues.push('error');
  if (effectiveStatus === 'RECONNECT_REQUIRED') issues.push('reconnect_required');
  if (effectiveStatus === 'SYNC_DISABLED') issues.push('sync_disabled');
  if (tokenStatus === 'expired') issues.push('token_expired');
  if (tokenStatus === 'valid' && isTokenExpiringSoon(tokenExpiresAt, now)) {
    issues.push('token_expiring_soon');
  }

  const refreshFailureCount = metadata.refreshFailureCount ?? 0;

  if (refreshFailureCount > 0) {
    issues.push('refresh_failures');
  }

  const requiresReconnect =
    RECONNECT_STATUSES.includes(effectiveStatus) ||
    tokenStatus === 'expired' ||
    refreshFailureCount >= 3;

  const syncEligible =
    !SYNC_BLOCKED_STATUSES.includes(effectiveStatus) && tokenStatus !== 'expired';

  return {
    status: effectiveStatus,
    tokenStatus,
    issues,
    requiresReconnect,
    syncEligible,
    refreshFailureCount,
    lastValidatedAt: metadata.lastValidatedAt ?? null,
    lastRefreshAt: metadata.lastRefreshAt ?? null,
  };
}
