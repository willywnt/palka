import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { OrdersDashboard } from '@/modules/orders/components/orders-dashboard';

export const metadata: Metadata = {
  title: 'Orders',
};

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Marketplace orders pulled into your source of truth — paid orders decrement stock."
      />
      <OrdersDashboard />
    </div>
  );
}
