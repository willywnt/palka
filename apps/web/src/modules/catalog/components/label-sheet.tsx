'use client';

import { formatCurrency } from '@/lib/formatters';

/**
 * The minimum a row needs to render a printable QR label. Both a `LabelVariant`
 * and a `BundleLabel` are adapted to this shape — `productName` is the optional
 * grouping prefix (a variant has one, a bundle does not). `id` keys the cell.
 */
export type PrintableLabel = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  /** Decimal serialized as a string to avoid float precision loss. */
  price: string;
  /** Optional prefix shown before the name (e.g. a variant's product name). */
  productName?: string;
};

/** The QR encodes the scannable code: a real barcode when present, else the SKU. */
export function labelCodeFor(label: Pick<PrintableLabel, 'barcode' | 'sku'>): string {
  return label.barcode?.trim() || label.sku;
}

function LabelCell({ label, qr }: { label: PrintableLabel; qr: string | undefined }) {
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
        {label.productName ? `${label.productName} · ${label.name}` : label.name}
      </div>
      <div className="text-muted-foreground font-mono text-[10px]">{code}</div>
      <div className="text-xs font-semibold tabular-nums">{formatCurrency(label.price)}</div>
    </div>
  );
}

/**
 * The printable A4 grid — one cell per selected label. `data-print-root` is the
 * single element revealed by the print stylesheet (globals.css `@media print`).
 */
export function LabelSheet({
  labels,
  qrCodes,
}: {
  labels: PrintableLabel[];
  qrCodes: Map<string, string>;
}) {
  return (
    <div
      data-print-root
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-1.5"
    >
      {labels.map((label) => (
        <LabelCell key={label.id} label={label} qr={qrCodes.get(labelCodeFor(label))} />
      ))}
    </div>
  );
}
