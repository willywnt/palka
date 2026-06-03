import type { OrderStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant?: BadgeVariant; className?: string }
> = {
  PENDING: { label: 'Pending', variant: 'outline' },
  PAID: { label: 'Paid', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  SHIPPED: { label: 'Shipped', variant: 'secondary' },
  COMPLETED: { label: 'Completed', variant: 'secondary' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
