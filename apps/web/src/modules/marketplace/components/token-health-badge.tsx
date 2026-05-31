'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { MarketplaceAccountListItemDto } from '../dto/marketplace.dto';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function TokenHealthBadge({
  account,
  className,
}: {
  account: MarketplaceAccountListItemDto;
  className?: string;
}) {
  if (account.health.issues.includes('token_expired')) {
    return (
      <Badge variant="destructive" className={cn('gap-1', className)}>
        <AlertTriangle className="size-3" />
        Expired
      </Badge>
    );
  }

  if (account.health.issues.includes('token_expiring_soon')) {
    return (
      <Badge variant="outline" className={cn('gap-1 border-amber-500 text-amber-700', className)}>
        <AlertTriangle className="size-3" />
        Expiring soon
      </Badge>
    );
  }

  if (account.health.refreshFailureCount > 0) {
    return (
      <Badge variant="outline" className={cn('gap-1', className)}>
        <AlertTriangle className="size-3" />
        Refresh issues
      </Badge>
    );
  }

  if (account.tokenStatus === 'valid') {
    return (
      <Badge variant="secondary" className={cn('gap-1', className)}>
        <CheckCircle2 className="size-3" />
        Healthy
      </Badge>
    );
  }

  return null;
}
