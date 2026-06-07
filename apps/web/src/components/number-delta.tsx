import { ArrowDown, ArrowUp } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A signed numeric in ledger style: calm-green for a gain (+), ember for a loss
 * (−), muted for zero. Mono/tabular so deltas align in a column. The reusable
 * unit behind every signed number — stock deltas, velocity, margin moves, future
 * transfers/refunds/AP. Pass `format` for currency/percent rendering.
 */
export function NumberDelta({
  value,
  format,
  arrow = false,
  showZero = false,
  className,
}: {
  value: number;
  /** Render the magnitude (sign handled here); defaults to the integer. */
  format?: (abs: number) => string;
  arrow?: boolean;
  showZero?: boolean;
  className?: string;
}) {
  if (value === 0 && !showZero) {
    return <span className={cn('text-muted-foreground num', className)}>—</span>;
  }

  const up = value > 0;
  const down = value < 0;
  const magnitude = format ? format(Math.abs(value)) : String(Math.abs(value));
  const sign = up ? '+' : down ? '−' : '';
  const Icon = up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 tabular-nums',
        up && 'text-signed-up',
        down && 'text-signed-down',
        !up && !down && 'text-muted-foreground',
        className,
      )}
    >
      {arrow && (up || down) ? <Icon className="size-3.5" aria-hidden /> : null}
      {sign}
      {magnitude}
    </span>
  );
}
