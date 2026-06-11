'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, startOfDay, startOfMonth, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

function formatRange(range: DateRange | undefined, placeholder: string): string {
  if (!range?.from) return placeholder;
  if (!range.to) return format(range.from, 'd MMM yyyy');
  return `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`;
}

/* Quick ranges sellers actually think in — applying one commits immediately. */
const PRESETS: ReadonlyArray<{ label: string; range: () => DateRange }> = [
  { label: 'Hari ini', range: () => ({ from: startOfDay(new Date()), to: new Date() }) },
  { label: '7 hari', range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: new Date() }) },
  {
    label: '30 hari',
    range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: new Date() }),
  },
  { label: 'Bulan ini', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
];

/**
 * Single-popover from–to date range picker. Selection is held as a draft and only
 * committed (via `onChange`) when the user clicks Apply, so the caller doesn't
 * re-query on every day click.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = 'Rentang tanggal',
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  // One month under sm — the two-month grid (~600px) overflows phone viewports.
  const singleMonth = useMediaQuery('(max-width: 639px)');

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    setOpen(next);
  }

  function applyPreset(range: DateRange) {
    setDraft(range);
    onChange(range);
    setOpen(false);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  function clear() {
    setDraft(undefined);
    onChange(undefined);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 min-w-44 justify-start gap-2 font-normal',
            !value?.from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span className="truncate">{formatRange(value, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="start">
        <div className="flex flex-wrap items-center gap-1.5 border-b p-2.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyPreset(preset.range())}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={singleMonth ? 1 : 2}
          autoFocus
        />
        <div className="flex items-center justify-between gap-3 border-t p-2.5">
          <span className="text-muted-foreground px-1 text-xs">
            {draft?.from ? formatRange(draft, '') : 'Pilih rentang'}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={clear} disabled={!draft?.from}>
              Bersihkan
            </Button>
            <Button size="sm" onClick={apply} disabled={!draft?.from}>
              Terapkan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
