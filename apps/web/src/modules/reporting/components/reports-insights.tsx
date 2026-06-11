'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { DateRange } from 'react-day-picker';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ChannelPerformanceReport } from './channel-performance-report';
import { ProfitReport } from './profit-report';
import { ReportRangeControls, rangeToParams } from './report-range-controls';
import { channelPerformanceExportUrl, profitExportUrl } from '../hooks/use-reporting';
import type { ProfitPeriodGranularity } from '../types';

type ReportTab = 'laba' | 'channel';

/**
 * The merged Laba + Channel insight page: one shared date-range/grouping filter
 * and a per-tab CSV export, switching between the profit view (laba/margin/SKU)
 * and the channel-comparison view. Reads `?tab=channel` for the initial tab so
 * the old /reports/channels link lands on the right view, and writes the active
 * tab back to the URL so refresh/back/share keeps it.
 */
export function ReportsInsights() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab: ReportTab = searchParams.get('tab') === 'channel' ? 'channel' : 'laba';

  const [tab, setTab] = useState<ReportTab>(initialTab);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<ProfitPeriodGranularity>('day');

  const changeTab = useCallback(
    (next: ReportTab) => {
      setTab(next);
      const nextParams = new URLSearchParams(searchParams.toString());
      if (next === 'channel') nextParams.set('tab', 'channel');
      else nextParams.delete('tab');
      const qs = nextParams.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const params = rangeToParams(range, groupBy);
  const exportUrl =
    tab === 'channel' ? channelPerformanceExportUrl(params) : profitExportUrl(params);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => changeTab(value as ReportTab)}
      className="space-y-6"
    >
      <TabsList>
        <TabsTrigger value="laba">Laba &amp; margin</TabsTrigger>
        <TabsTrigger value="channel">Per channel</TabsTrigger>
      </TabsList>

      <ReportRangeControls
        range={range}
        onRangeChange={setRange}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        exportUrl={exportUrl}
      />

      <TabsContent value="laba">
        <ProfitReport params={params} onSeeChannels={() => changeTab('channel')} />
      </TabsContent>
      <TabsContent value="channel">
        <ChannelPerformanceReport params={params} />
      </TabsContent>
    </Tabs>
  );
}
