import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberDelta } from '@/components/number-delta';
import { cn } from '@/lib/utils';

/**
 * Tinted icon-chip palettes, so a row of stats/actions isn't one flat colour.
 * Decorative tones resolve through theme tokens (chart ramp + suar + signed
 * pair) — dark mode comes free, and no raw Tailwind palette survives. The
 * legacy tone names stay so call sites don't churn.
 */
export const STAT_TONES = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-highlight/15 text-highlight-strong',
  rose: 'bg-chart-5/10 text-chart-5',
  sky: 'bg-chart-4/10 text-chart-4',
  violet: 'bg-chart-2/10 text-chart-2',
  emerald: 'bg-signed-up/10 text-signed-up',
  muted: 'bg-muted text-muted-foreground',
} as const;

export type StatTone = keyof typeof STAT_TONES;

/**
 * A single KPI tile: label + big value, an optional tinted icon chip and a
 * footnote. The shared shape every dashboard/report stat row is built from.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'muted',
  hint,
  delta,
  accentClassName,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  hint?: ReactNode;
  /** Optional signed trend shown under the value (+gain green / −loss ember). */
  delta?: number;
  accentClassName?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-muted-foreground">{label}</p>
          {Icon ? (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                STAT_TONES[tone],
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
        <CardTitle className={cn('num-display', accentClassName)}>{value}</CardTitle>
      </CardHeader>
      {hint || delta != null ? (
        <CardContent className="pt-0">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            {delta != null ? <NumberDelta value={delta} arrow /> : null}
            {hint ? <span>{hint}</span> : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
