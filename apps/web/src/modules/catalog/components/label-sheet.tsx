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

/** Date-only id-ID stamp for the print footer (e.g. "11 Juni 2026"). */
const PRINT_STAMP_FORMAT = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

function LabelCell({ label, qr }: { label: PrintableLabel; qr: string | undefined }) {
  const code = labelCodeFor(label);

  return (
    <div className="flex break-inside-avoid flex-col items-center gap-1 rounded-md border p-2 text-center">
      <div className="line-clamp-2 text-[11px] leading-tight font-medium">
        {label.productName ? `${label.productName} · ${label.name}` : label.name}
      </div>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic QR data URL
        <img src={qr} alt={code} className="size-20" />
      ) : (
        <div className="bg-muted size-20 animate-pulse rounded" />
      )}
      <div className="num text-muted-foreground text-[10px]">{label.sku}</div>
      <div className="num text-xs font-semibold">{formatCurrency(label.price)}</div>
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
      <div className="text-muted-foreground col-span-full mt-3 flex items-baseline justify-between gap-2 border-t pt-2 text-[10px]">
        <span className="font-semibold">Falka</span>
        <span suppressHydrationWarning>dicetak {PRINT_STAMP_FORMAT.format(new Date())}</span>
      </div>
    </div>
  );
}
