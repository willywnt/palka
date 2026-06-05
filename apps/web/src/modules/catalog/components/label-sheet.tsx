'use client';

import { formatCurrency } from '@/lib/formatters';

import type { LabelVariant } from '../types';

/** The QR encodes the scannable code: a real barcode when present, else the SKU. */
export function labelCodeFor(label: LabelVariant): string {
  return label.barcode?.trim() || label.sku;
}

function LabelCell({ label, qr }: { label: LabelVariant; qr: string | undefined }) {
  const code = labelCodeFor(label);

  return (
    <div className="flex break-inside-avoid flex-col items-center gap-1 rounded-md border p-2 text-center">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic QR data URL
        <img src={qr} alt={code} className="size-20" />
      ) : (
        <div className="bg-muted size-20 animate-pulse rounded" />
      )}
      <div className="line-clamp-2 text-[11px] leading-tight font-medium">
        {label.productName} · {label.name}
      </div>
      <div className="text-muted-foreground font-mono text-[10px]">{code}</div>
      <div className="text-xs font-semibold tabular-nums">{formatCurrency(label.price)}</div>
    </div>
  );
}

/**
 * The printable A4 grid — one cell per selected variant. `data-print-root` is the
 * single element revealed by the print stylesheet (globals.css `@media print`).
 */
export function LabelSheet({
  labels,
  qrCodes,
}: {
  labels: LabelVariant[];
  qrCodes: Map<string, string>;
}) {
  return (
    <div
      data-print-root
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-1.5"
    >
      {labels.map((label) => (
        <LabelCell key={label.variantId} label={label} qr={qrCodes.get(labelCodeFor(label))} />
      ))}
    </div>
  );
}
