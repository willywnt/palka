import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { requireOrgPermission } from '@/modules/auth/services/session';
import { ReportsInsights } from '@/modules/reporting/components/reports-insights';

export const metadata: Metadata = {
  title: 'Laba & channel',
};

export default async function ProfitReportPage() {
  await requireOrgPermission('reports.view');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laporan"
        title="Laba & channel"
        description="Omzet, HPP, margin, dan perbandingan tiap channel — lihat dari mana untung kamu datang."
      />
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <ReportsInsights />
      </Suspense>
    </div>
  );
}
