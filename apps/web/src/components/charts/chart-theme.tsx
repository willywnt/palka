'use client';

import { formatCurrency } from '@/lib/formatters';

/** Shared axis tick style for recharts — muted ink, small, tabular handled by formatter. */
export const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;
export const GRID_COLOR = 'var(--border)';

/** Compact a period key for an axis tick: "2026-06-10"→"06-10", "2026-06"→"06", "2026-W23"→"W23". */
export function shortPeriod(period: string): string {
  if (/^\d{4}-W\d{2}$/.test(period)) return period.slice(5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period.slice(5);
  if (/^\d{4}-\d{2}$/.test(period)) return period.slice(5);
  return period;
}

/** Abbreviate a rupiah amount for a Y axis tick: 1_250_000 → "1,3jt", 12_000 → "12rb". */
export function shortRupiah(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}jt`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
}

type TooltipItem = {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

/**
 * A hairline-card tooltip that renders each series as a colored dot + label +
 * mono currency value — keeps the ledger identity (recharts' default tooltip is
 * generic). `active`/`payload`/`label` are injected by recharts at runtime.
 */
export function CurrencyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
}) {
  return <SeriesTooltip active={active} payload={payload} label={label} format={formatCurrency} />;
}

/** Same hairline tooltip as CurrencyTooltip, but values are plain counts ("12 unit"). */
export function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
}) {
  return (
    <SeriesTooltip
      active={active}
      payload={payload}
      label={label}
      format={(value) => `${value.toLocaleString('id-ID')} unit`}
    />
  );
}

function SeriesTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  format: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border px-3 py-2 text-xs shadow-sm">
      {label != null ? (
        <div className="text-muted-foreground mb-1 font-medium">{String(label)}</div>
      ) : null}
      <ul className="space-y-0.5">
        {payload.map((item, index) => (
          <li key={index} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? 'var(--muted-foreground)' }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </span>
            <span className="num font-medium">{format(Number(item.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
