'use client';

import type { MarketplaceMappingStatus } from '@prisma/client';

import { MAPPING_STATUS_LABELS } from '../dto/mapping.dto';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const VARIANTS: Record<
  MarketplaceMappingStatus | 'UNMAPPED',
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  MAPPED: 'default',
  UNMAPPED: 'secondary',
  BROKEN: 'destructive',
  CONFLICT: 'destructive',
  SYNC_DISABLED: 'outline',
};

export function MappingStatusBadge({
  status,
  className,
}: {
  status: MarketplaceMappingStatus | 'UNMAPPED';
  className?: string;
}) {
  return (
    <Badge variant={VARIANTS[status]} className={cn('font-medium', className)}>
      {status === 'UNMAPPED' ? 'Unmapped' : MAPPING_STATUS_LABELS[status]}
    </Badge>
  );
}
