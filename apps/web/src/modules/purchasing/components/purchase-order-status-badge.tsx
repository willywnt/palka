import type { PurchaseOrderStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_CONFIG: Record<
  PurchaseOrderStatus,
  { label: string; variant?: BadgeVariant; className?: string }
> = {
  ORDERED: { label: 'Ordered', variant: 'outline', className: 'border-sky-500 text-sky-600' },
  PARTIALLY_RECEIVED: {
    label: 'Partially received',
    variant: 'outline',
    className: 'border-amber-500 text-amber-600',
  },
  RECEIVED: { label: 'Received', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
