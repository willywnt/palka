'use client';

import { useState } from 'react';
import { ChevronDown, Printer } from 'lucide-react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/formatters';

import { QrImage } from './qr-image';

/** Printed QR edge length (mm) per size choice. */
const SIZE_OPTIONS: { label: string; mm: number }[] = [
  { label: 'Kecil', mm: 30 },
  { label: 'Sedang', mm: 50 },
  { label: 'Besar', mm: 70 },
];

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );
}

/**
 * Print one QR label through a hidden iframe whose document contains ONLY the
 * label. Printing the in-page node fought the modal's transform + the tall body
 * (the label landed on a second, blank-first page); an isolated document always
 * prints a single, centered page — and the size is fully under our control.
 */
async function printQrLabel(opts: { value: string; name: string; sku: string; mm: number }) {
  // 3× device px for a crisp print at the chosen millimetre size.
  const px = Math.round((opts.mm / 25.4) * 96) * 3;
  const qr = await QRCode.toDataURL(opts.value, { width: px, margin: 2 });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.sku)}</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .label { display: flex; flex-direction: column; align-items: center; gap: 2mm; padding: 4mm; text-align: center; }
  .name { font-size: 11pt; font-weight: 600; line-height: 1.25; max-width: ${opts.mm + 24}mm; }
  .qr { width: ${opts.mm}mm; height: ${opts.mm}mm; }
  .sku { font-size: 9pt; color: #444; }
</style></head>
<body><div class="label">
  <div class="name">${escapeHtml(opts.name)}</div>
  <img class="qr" src="${qr}" alt="${escapeHtml(opts.value)}" />
  <div class="sku">${escapeHtml(opts.sku)}</div>
</div></body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 300);
  };
  win.addEventListener('afterprint', cleanup);

  doc.open();
  doc.write(html);
  doc.close();

  // Let the (already-embedded data-URL) image lay out, then print.
  setTimeout(() => {
    win.focus();
    win.print();
    // Fallback cleanup for browsers that don't fire afterprint.
    setTimeout(cleanup, 1000);
  }, 200);
}

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
 * Shows an enlarged QR label for a single variant/bundle (name → QR → SKU) and
 * prints it at a chosen size via an isolated iframe (always one centered page).
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
  const [printing, setPrinting] = useState(false);

  const handlePrint = async (mm: number) => {
    setPrinting(true);
    try {
      onPrint?.();
      await printQrLabel({ value, name, sku, mm });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>QR Code</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
          <div className="text-sm font-medium text-balance">{name}</div>
          <QrImage value={value} size={208} />
          <div className="num text-muted-foreground text-sm">{sku}</div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" className="w-full" disabled={printing}>
              <Printer className="size-4" />
              {printing ? 'Menyiapkan…' : lastPrintedAt ? 'Cetak lagi' : 'Cetak'}
              <ChevronDown className="ml-auto size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {SIZE_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.mm} onClick={() => void handlePrint(option.mm)}>
                {option.label}
                <span className="text-muted-foreground ml-auto text-xs">{option.mm} mm</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <p className="text-muted-foreground text-center text-xs" suppressHydrationWarning>
          {lastPrintedAt
            ? `Terakhir dicetak ${formatRelativeTime(lastPrintedAt)}`
            : 'Belum dicetak'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
