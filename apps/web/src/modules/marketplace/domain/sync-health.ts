import type { MarketplaceSyncJobStatus } from '@prisma/client';

export type SyncHealthIssue =
  | 'failed_sync'
  | 'retrying_sync'
  | 'stale_mapping'
  | 'token_expired'
  | 'account_disconnected'
  | 'sync_disabled'
  | 'provider_unhealthy';

export type SyncHealth = {
  syncReady: boolean;
  issues: SyncHealthIssue[];
};

export function resolveSyncHealth(input: {
  syncStatus: MarketplaceSyncJobStatus;
  mappingSyncEnabled: boolean;
  accountStatus: string;
  tokenExpiresAt: Date | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
}): SyncHealth {
  const issues: SyncHealthIssue[] = [];

  if (input.syncStatus === 'FAILED') issues.push('failed_sync');
  if (input.syncStatus === 'RETRYING') issues.push('retrying_sync');
  if (!input.mappingSyncEnabled) issues.push('sync_disabled');
  if (input.accountStatus !== 'CONNECTED') issues.push('account_disconnected');

  if (input.tokenExpiresAt && input.tokenExpiresAt.getTime() <= Date.now()) {
    issues.push('token_expired');
  }

  if (input.consecutiveFailures >= 3) {
    issues.push('provider_unhealthy');
  }

  if (input.lastSuccessAt && Date.now() - input.lastSuccessAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
    issues.push('stale_mapping');
  }

  const syncReady =
    issues.length === 0 && (input.syncStatus === 'SUCCESS' || input.syncStatus === 'PENDING');

  return { syncReady, issues };
}

export const SYNC_JOB_STATUS_LABELS: Record<MarketplaceSyncJobStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  RETRYING: 'Retrying',
  DISABLED: 'Disabled',
};
