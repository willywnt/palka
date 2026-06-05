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

type QrCodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scannable code (barcode or SKU). */
  value: string;
  /** Product · variant name. */
  title: string;
  /** Secondary line (e.g. SKU or price). */
  subtitle?: string;
  /** When this label was last printed (ISO); null/undefined = never. */
  lastPrintedAt?: string | null;
  /** Called when Print is pressed — record the print + refresh. */
  onPrint?: () => void;
};

/**
 * Shows an enlarged, printable QR label for a single variant. The QR area is the
 * `[data-print-root]` so Print outputs just the label (see globals.css @media print).
 */
export function QrCodeDialog({
  open,
  onOpenChange,
  value,
  title,
  subtitle,
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
              <DialogTitle>QR label</DialogTitle>
              <DialogDescription className="truncate">{title}</DialogDescription>
            </div>
            <Button type="button" size="sm" onClick={handlePrint} className="shrink-0">
              <Printer className="size-4" />
              {lastPrintedAt ? 'Print again' : 'Print'}
            </Button>
          </div>
        </DialogHeader>

        <div
          data-print-root
          className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center"
        >
          <div className="text-sm font-medium text-balance">{title}</div>
          <QrImage value={value} size={208} />
          <div className="font-mono text-sm">{value}</div>
          {subtitle ? <div className="text-muted-foreground text-xs">{subtitle}</div> : null}
        </div>

        <p className="text-muted-foreground text-center text-xs" suppressHydrationWarning>
          {lastPrintedAt ? `Last printed ${formatRelativeTime(lastPrintedAt)}` : 'Not printed yet'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
