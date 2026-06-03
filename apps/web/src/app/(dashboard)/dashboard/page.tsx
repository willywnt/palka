import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { InventoryDashboard } from '@/modules/inventory/components/inventory-dashboard';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Your inventory at a glance." />
      <InventoryDashboard />
    </div>
  );
}
