'use client';

import type { MarketplaceAccountStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { MARKETPLACE_ACCOUNT_STATUS_LABELS } from '../dto/marketplace.dto';

const STATUS_VARIANTS: Record<
  MarketplaceAccountStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  CONNECTED: 'default',
  EXPIRED: 'destructive',
  DISCONNECTED: 'secondary',
  ERROR: 'destructive',
  RECONNECT_REQUIRED: 'outline',
  SYNC_DISABLED: 'secondary',
};

export function MarketplaceStatusBadge({
  status,
  className,
}: {
  status: MarketplaceAccountStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className={cn('font-medium', className)}>
      {MARKETPLACE_ACCOUNT_STATUS_LABELS[status]}
    </Badge>
  );
}
