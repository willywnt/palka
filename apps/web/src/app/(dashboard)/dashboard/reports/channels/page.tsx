import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { ChannelPerformanceReport } from '@/modules/reporting/components/channel-performance-report';

export const metadata: Metadata = {
  title: 'Performa channel',
};

export default function ChannelPerformanceReportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insight"
        title="Performa channel"
        description="Bandingkan tiap channel jualan — omzet, porsi, margin, transaksi, dan retur — biar tahu mana yang paling menghasilkan."
      />
      <Suspense fallback={null}>
        <ChannelPerformanceReport />
      </Suspense>
    </div>
  );
}
