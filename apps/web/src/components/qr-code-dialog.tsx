'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
};

/**
 * Shows an enlarged, printable QR label for a single variant. The QR area is the
 * `[data-print-root]` so Print outputs just the label (see globals.css @media print).
 */
export function QrCodeDialog({ open, onOpenChange, value, title, subtitle }: QrCodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>QR label</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
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

        <DialogFooter>
          <Button type="button" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
