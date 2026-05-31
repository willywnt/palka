import type { MarketplaceSyncJobStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { SYNC_JOB_STATUS_LABELS } from '../domain/sync-health';

const STATUS_VARIANT: Record<
  MarketplaceSyncJobStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  PROCESSING: 'default',
  SUCCESS: 'outline',
  FAILED: 'destructive',
  RETRYING: 'secondary',
  DISABLED: 'outline',
};

export function SyncStatusBadge({ status }: { status: MarketplaceSyncJobStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{SYNC_JOB_STATUS_LABELS[status]}</Badge>;
}
