import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { SalesDashboard } from '@/modules/sales/components/sales-dashboard';

export const metadata: Metadata = {
  title: 'Sales',
};

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales channels"
        title="Sales (POS)"
        description="In-store sales that draw from the same stock as your marketplaces — no double selling."
      />
      <SalesDashboard />
    </div>
  );
}
