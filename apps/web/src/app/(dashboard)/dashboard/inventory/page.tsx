import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { InventoryOverview } from '@/modules/inventory/components/inventory-overview';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock levels across your catalog — the source of truth for every channel."
      />
      <InventoryOverview />
    </div>
  );
}
