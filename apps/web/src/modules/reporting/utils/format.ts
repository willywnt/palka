/** A percentage for display, or an em-dash when it is not defined (null). */
export function formatPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/** Text class for a margin/profit cell: muted when unknown, ember when negative. */
export function marginClass(value: number | null): string | undefined {
  if (value === null) return 'text-muted-foreground';
  if (value < 0) return 'text-destructive';
  return undefined;
}
