import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { requireOrgPermission } from '@/modules/auth/services/session';
import { StockHealthInsights } from '@/modules/reporting/components/stock-health-insights';

export const metadata: Metadata = {
  title: 'Stok mati & ABC',
};

export default async function StockHealthPage() {
  await requireOrgPermission('reports.view');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laporan"
        title="Stok mati & ABC"
        description="Lihat modal yang nyangkut di stok yang nggak laku, dan SKU mana yang benar-benar menyumbang omzet (Pareto A/B/C)."
      />
      {/* useSearchParams (the ?tab sync) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <StockHealthInsights />
      </Suspense>
    </div>
  );
}
