'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/lib/formatters';

import { QrImage } from './qr-image';

/** Date-only id-ID stamp for the print footer (e.g. "11 Juni 2026"). */
const PRINT_STAMP_FORMAT = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

type QrCodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scannable code encoded in the QR (barcode ?? sku). */
  value: string;
  /** Display name: bundle name, or the variant label (group · name / name). */
  name: string;
  /** SKU shown under the QR. */
  sku: string;
  /** When this label was last printed (ISO); null/undefined = never. */
  lastPrintedAt?: string | null;
  /** Called when Print is pressed — record the print + refresh. */
  onPrint?: () => void;
};

/**
 * Shows an enlarged, printable QR label for a single variant/bundle, laid out
 * name → QR → SKU. The QR area is the `[data-print-root]` so Print outputs just
 * the label (see globals.css @media print).
 */
export function QrCodeDialog({
  open,
  onOpenChange,
  value,
  name,
  sku,
  lastPrintedAt,
  onPrint,
}: QrCodeDialogProps) {
  const handlePrint = () => {
    onPrint?.();
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle>QR Code</DialogTitle>
              <DialogDescription className="truncate">{name}</DialogDescription>
            </div>
            <Button type="button" size="sm" onClick={handlePrint} className="shrink-0">
              <Printer className="size-4" />
              {lastPrintedAt ? 'Cetak lagi' : 'Cetak'}
            </Button>
          </div>
        </DialogHeader>

        <div
          data-print-root
          className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center"
        >
          <div className="text-sm font-medium text-balance">{name}</div>
          <QrImage value={value} size={208} />
          <div className="num text-muted-foreground text-sm">{sku}</div>
          <div className="text-muted-foreground mt-3 flex w-full items-baseline justify-between gap-2 border-t pt-2 text-[10px]">
            <span className="font-semibold">Falka</span>
            <span suppressHydrationWarning>dicetak {PRINT_STAMP_FORMAT.format(new Date())}</span>
          </div>
        </div>

        <p className="text-muted-foreground text-center text-xs" suppressHydrationWarning>
          {lastPrintedAt
            ? `Terakhir dicetak ${formatRelativeTime(lastPrintedAt)}`
            : 'Belum dicetak'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
