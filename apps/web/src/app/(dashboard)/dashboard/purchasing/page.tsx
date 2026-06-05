import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { PurchasingDashboard } from '@/modules/purchasing/components/purchasing-dashboard';

export const metadata: Metadata = {
  title: 'Purchasing',
};

export default function PurchasingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Purchasing"
        description="Order stock from suppliers. Ordered units show as incoming, then become available on receipt."
      />
      <PurchasingDashboard />
    </div>
  );
}
