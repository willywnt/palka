'use client';

import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Download } from 'lucide-react';

import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';

import type { ProfitReportParams } from '../hooks/use-reporting';
import type { ProfitPeriodGranularity } from '../types';

const GROUP_OPTIONS: { value: ProfitPeriodGranularity; label: string }[] = [
  { value: 'day', label: 'Harian' },
  { value: 'week', label: 'Mingguan' },
  { value: 'month', label: 'Bulanan' },
];

/** Turn the picker's DateRange + grouping into report query params (shared by every report). */
export function rangeToParams(
  range: DateRange | undefined,
  groupBy: ProfitPeriodGranularity,
): ProfitReportParams {
  return {
    groupBy,
    ...(range?.from ? { from: format(range.from, 'yyyy-MM-dd') } : {}),
    ...(range?.to ? { to: format(range.to, 'yyyy-MM-dd') } : {}),
  };
}

/** The shared report filter bar: a date range, a day/week/month toggle, and a CSV export. */
export function ReportRangeControls({
  range,
  onRangeChange,
  groupBy,
  onGroupByChange,
  exportUrl,
}: {
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  groupBy: ProfitPeriodGranularity;
  onGroupByChange: (groupBy: ProfitPeriodGranularity) => void;
  exportUrl: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={onRangeChange} placeholder="30 hari terakhir" />
        <div className="flex items-center gap-1">
          {GROUP_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={groupBy === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onGroupByChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={exportUrl} download>
          <Download className="size-4" />
          Ekspor CSV
        </a>
      </Button>
    </div>
  );
}
