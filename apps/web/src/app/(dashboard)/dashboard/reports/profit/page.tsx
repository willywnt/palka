import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { ProfitReport } from '@/modules/reporting/components/profit-report';

export const metadata: Metadata = {
  title: 'Profit & margin',
};

export default function ProfitReportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Profit & margin"
        description="Revenue, COGS and gross margin across channels — see which SKUs actually make money."
      />
      <Suspense fallback={null}>
        <ProfitReport />
      </Suspense>
    </div>
  );
}
