'use client';

import { useState } from 'react';
import { PackageOpen, Play, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/empty-state';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { computeSaleTotals } from '../utils/sale-totals';
import type { HeldSale } from '../store/pos-held-sales.store';

/** The held sale's final total (mirrors the POS math: subtotal − discount + PPN). */
function heldSaleTotal(held: HeldSale): number {
  const subtotal = held.cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return computeSaleTotals(
    subtotal,
    held.discount.value > 0 ? held.discount : null,
    held.tax.enabled ? held.tax.rate : 0,
    held.tax.inclusive,
  ).totalAmount;
}

/**
 * The parked-sales tray: resume a held cart back into the terminal, or discard it.
 * Pure presentation — the store + terminal own the state and the resume side effects.
 */
export function PosHeldSalesDialog({
  open,
  onOpenChange,
  heldSales,
  onResume,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heldSales: HeldSale[];
  onResume: (held: HeldSale) => void;
  onRemove: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<HeldSale | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pesanan tertahan</DialogTitle>
          <DialogDescription>
            Lanjutkan pesanan yang ditahan ke keranjang, atau hapus. Tersimpan di perangkat ini.
          </DialogDescription>
        </DialogHeader>

        {heldSales.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="Belum ada pesanan tertahan"
            description="Tekan Tahan di keranjang untuk menyimpan transaksi sementara."
          />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {heldSales.map((held) => (
              <li
                key={held.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{held.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {held.cart.length} item ·{' '}
                    <span className="num">{formatCurrency(heldSaleTotal(held))}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatDateTime(new Date(held.createdAt))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" onClick={() => onResume(held)}>
                    <Play className="size-4" />
                    Lanjutkan
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Hapus pesanan tertahan"
                    onClick={() => setPendingDelete(held)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pesanan tertahan?</AlertDialogTitle>
            <AlertDialogDescription>
              Keranjang yang ditahan ini akan dibuang dan tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onRemove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
