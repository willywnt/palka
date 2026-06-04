import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { StockActivity } from '@/modules/inventory/components/stock-activity';

export const metadata: Metadata = {
  title: 'Stock activity',
};

export default function StockActivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Stock activity"
        description="Every stock change, newest first — search and export the full history."
      />
      <Suspense fallback={null}>
        <StockActivity />
      </Suspense>
    </div>
  );
}
