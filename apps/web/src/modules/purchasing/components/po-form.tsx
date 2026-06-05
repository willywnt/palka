'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, PackagePlus, Plus, ScanLine, Trash2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useScanSoundPref } from '@/hooks/use-scan-sound-pref';
import { useSoundUnlock } from '@/hooks/use-sound-unlock';
import { formatCurrency } from '@/lib/formatters';
import { unlockScanSound } from '@/lib/scan-sound';
import { cn } from '@/lib/utils';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';
import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import { useReorderReportQuery } from '@/modules/inventory/hooks/use-inventory';

import {
  useCreatePurchaseOrderMutation,
  usePurchaseVariantsQuery,
} from '../hooks/use-purchase-orders';
import { usePurchaseScanner, type PoScannerStatus } from '../hooks/use-purchase-scanner';
import type { PurchasableVariant } from '../types';

/** Per-state copy + accent for the PO phone-scanner indicator. */
const SCAN_STATUS_META: Record<PoScannerStatus, { dot: string; cta: string; hint: string | null }> =
  {
    off: { dot: '', cta: '', hint: null },
    idle: { dot: 'bg-muted-foreground/40', cta: 'Scan with phone', hint: null },
    waiting: { dot: 'bg-amber-500', cta: 'Show QR', hint: 'Waiting for your phone to connect…' },
    connected: {
      dot: 'bg-emerald-500',
      cta: 'Phone connected',
      hint: 'Phone connected — scan a product label to add it to the order.',
    },
    disconnected: {
      dot: 'bg-destructive',
      cta: 'Reconnect',
      hint: 'Phone disconnected. Tap Reconnect to show a fresh QR.',
    },
  };

type PoLine = {
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  quantity: number;
  unitCost: number;
  availableStock: number;
  incomingStock: number;
};

export function PoForm() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const { data: results, isLoading } = usePurchaseVariantsQuery(debouncedSearch, page, pageSize);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  const variants = results?.items ?? [];
  const meta = results?.meta;

  const [lines, setLines] = useState<PoLine[]>([]);
  const [supplierName, setSupplierName] = useState('');

  const reorder = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });
  const createPo = useCreatePurchaseOrderMutation();

  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref('olshop-purchasing-scan-sound');
  useSoundUnlock();
  // Mobile scan-to-order: a paired phone scans a product label → add/bump the line.
  const { scannerEnabled, status: scannerStatus } = usePurchaseScanner({
    onResolved: addOrBumpVariant,
    soundEnabled: soundOn,
  });
  const scanMeta = SCAN_STATUS_META[scannerStatus];

  function openScanner() {
    unlockScanSound();
    setScannerOpen(true);
  }

  const totalCost = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
    [lines],
  );

  function addLine(line: PoLine) {
    setLines((prev) => {
      if (prev.some((existing) => existing.variantId === line.variantId)) return prev;
      return [...prev, line];
    });
  }

  function addVariant(variant: PurchasableVariant) {
    addLine({
      variantId: variant.variantId,
      sku: variant.sku,
      name: variant.name,
      productName: variant.productName,
      quantity: 1,
      unitCost: Number(variant.cost ?? 0),
      availableStock: variant.availableStock,
      incomingStock: variant.incomingStock,
    });
  }

  /** Scanner add: append the line, or bump its qty if the variant is already on the order. */
  function addOrBumpVariant(variant: PurchasableVariant) {
    setLines((prev) => {
      const existing = prev.find((line) => line.variantId === variant.variantId);
      if (existing) {
        return prev.map((line) =>
          line.variantId === variant.variantId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.variantId,
          sku: variant.sku,
          name: variant.name,
          productName: variant.productName,
          quantity: 1,
          unitCost: Number(variant.cost ?? 0),
          availableStock: variant.availableStock,
          incomingStock: variant.incomingStock,
        },
      ];
    });
  }

  function loadReorderSuggestions() {
    const items = reorder.data?.items ?? [];
    const suggestions = items.filter(
      (item) =>
        (item.status === 'URGENT' || item.status === 'SOON') && item.suggestedReorderQty > 0,
    );
    if (suggestions.length === 0) {
      toast.info('No reorder suggestions right now.');
      return;
    }
    for (const item of suggestions) {
      addLine({
        variantId: item.variantId,
        sku: item.sku,
        name: item.variantName,
        productName: item.productName,
        quantity: item.suggestedReorderQty,
        unitCost: 0,
        availableStock: item.availableStock,
        incomingStock: item.incomingStock,
      });
    }
    toast.success(`Loaded ${suggestions.length} suggestion(s)`, {
      description: 'Set the unit costs.',
    });
  }

  function patchLine(variantId: string, patch: Partial<PoLine>) {
    setLines((prev) =>
      prev.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((line) => line.variantId !== variantId));
  }

  async function handleCreate() {
    if (lines.length === 0) return;
    try {
      const po = await createPo.mutateAsync({
        supplierName: supplierName.trim() || undefined,
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
      });
      toast.success(`Purchase order ${po.code} created`, {
        description: `${formatCurrency(po.totalCost)} · marked incoming`,
      });
      router.push(`/dashboard/purchasing/${po.id}`);
    } catch (error) {
      toast.error('Could not create the purchase order', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Product picker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Find product</CardTitle>
            {scannerEnabled ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleSound}
                  aria-label={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
                  title={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
                >
                  {soundOn ? (
                    <Volume2 className="size-4" />
                  ) : (
                    <VolumeX className="text-muted-foreground size-4" />
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={openScanner}>
                  <span className={cn('size-2 rounded-full', scanMeta.dot)} aria-hidden />
                  <ScanLine className="size-4" />
                  {scanMeta.cta}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search SKU or product name..."
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              onClick={loadReorderSuggestions}
              disabled={reorder.isLoading}
              title="Add the reorder report's suggested items"
            >
              <ClipboardList className="size-4" />
              Reorder
            </Button>
          </div>
          {scannerEnabled && scanMeta.hint ? (
            <p
              className={cn(
                'text-xs',
                scannerStatus === 'disconnected' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {scanMeta.hint}
            </p>
          ) : null}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : variants.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {debouncedSearch
                ? 'No matching products.'
                : 'Type to search, or load reorder suggestions.'}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {variants.map((variant) => (
                <li
                  key={variant.variantId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {variant.productName} · {variant.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {variant.sku} · {variant.availableStock} avail · {variant.incomingStock}{' '}
                      incoming
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addVariant(variant)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {meta && meta.total > 0 ? (
            <TablePagination
              page={meta.page}
              pageSize={pageSize}
              total={meta.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* PO lines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="supplier" className="text-muted-foreground text-xs">
              Supplier (optional)
            </Label>
            <Input
              id="supplier"
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              placeholder="Supplier name"
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              title="No items yet"
              description="Search a product or load reorder suggestions to build the order."
            />
          ) : (
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.variantId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {line.productName} · {line.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {line.sku} · {line.availableStock} avail · {line.incomingStock} incoming
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeLine(line.variantId)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
                    <div>
                      <Label className="text-muted-foreground text-xs">Qty</Label>
                      <NumberInput
                        value={line.quantity}
                        onChange={(value) =>
                          patchLine(line.variantId, { quantity: Math.max(1, value) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Unit cost</Label>
                      <NumberInput
                        value={line.unitCost}
                        onChange={(value) =>
                          patchLine(line.variantId, { unitCost: Math.max(0, value) })
                        }
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground text-xs">Line</div>
                      <div className="font-medium tabular-nums">
                        {formatCurrency(line.unitCost * line.quantity)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground text-sm">Total cost</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(totalCost)}
              </span>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleCreate()}
              disabled={lines.length === 0 || createPo.isPending}
            >
              <PackagePlus className="size-4" />
              {createPo.isPending ? 'Creating...' : 'Create purchase order'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConnectScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} purpose="PURCHASING" />
    </div>
  );
}
