'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Printer, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { formatCurrency, formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { useBundleLabelsQuery, useMarkBundleLabelsPrintedMutation } from '../hooks/use-bundles';
import { useQrCodes } from '../hooks/use-qr-codes';
import type { BundleLabel } from '../types';
import { LabelSheet, labelCodeFor, type PrintableLabel } from './label-sheet';

/**
 * Bundle counterpart of {@link LabelStudio}: pick bundles and print an A4 sheet
 * of QR labels (each encodes `barcode ?? sku`, so the mobile scanner can add the
 * whole bundle to a sale / PO). Selection is a Map keyed by bundle id so picks
 * survive a search change that filters a row out of view.
 */
export function BundleLabelStudio() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const { data: results, isLoading } = useBundleLabelsQuery(debouncedSearch, page, pageSize);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  const [selected, setSelected] = useState<Map<string, BundleLabel>>(new Map());
  const picked = useMemo(() => [...selected.values()], [selected]);
  const labels = useMemo<PrintableLabel[]>(
    () =>
      picked.map((bundle) => ({
        id: bundle.bundleId,
        name: bundle.name,
        sku: bundle.sku,
        barcode: bundle.barcode,
        price: bundle.price,
      })),
    [picked],
  );
  const codeValues = useMemo(() => labels.map(labelCodeFor), [labels]);
  const qrCodes = useQrCodes(codeValues);
  const qrReady = codeValues.every((value) => qrCodes.has(value));
  const markPrinted = useMarkBundleLabelsPrintedMutation();

  const bundles = results?.items ?? [];
  const meta = results?.meta;

  function handlePrint() {
    if (labels.length === 0 || !qrReady) return;
    // Stamp the printed time so the picker flags these as already printed.
    markPrinted.mutate(picked.map((bundle) => bundle.bundleId));
    window.print();
  }

  function toggle(bundle: BundleLabel) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(bundle.bundleId)) next.delete(bundle.bundleId);
      else next.set(bundle.bundleId, bundle);
      return next;
    });
  }

  function selectPage() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const bundle of bundles) next.set(bundle.bundleId, bundle);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Map());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search bundle SKU, barcode, or name..."
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={selectPage} disabled={bundles.length === 0}>
            Select page
          </Button>
          <Button variant="outline" onClick={clearAll} disabled={selected.size === 0}>
            Clear ({selected.size})
          </Button>
          <Button onClick={handlePrint} disabled={labels.length === 0 || !qrReady}>
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">
              Bundles
              {meta ? (
                <span className="text-muted-foreground font-normal"> · {meta.total}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : bundles.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {debouncedSearch ? 'No matching bundles.' : 'No bundles to label.'}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {bundles.map((bundle) => {
                  const isSelected = selected.has(bundle.bundleId);
                  return (
                    <li key={bundle.bundleId}>
                      <button
                        type="button"
                        onClick={() => toggle(bundle)}
                        aria-pressed={isSelected}
                        className="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input',
                          )}
                        >
                          {isSelected ? <Check className="size-3" /> : null}
                        </span>
                        <ImageThumb src={bundle.imageUrl} alt={bundle.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{bundle.name}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {labelCodeFor(bundle)} · {formatCurrency(bundle.price)}
                          </span>
                          {bundle.labelPrintedAt ? (
                            <span
                              className="block truncate text-[11px] text-amber-600"
                              suppressHydrationWarning
                            >
                              Printed {formatRelativeTime(bundle.labelPrintedAt)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
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

        <div>
          {labels.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="No labels selected"
              description="Pick bundles on the left to build a printable label sheet."
              className="print:hidden"
            />
          ) : (
            <LabelSheet labels={labels} qrCodes={qrCodes} />
          )}
        </div>
      </div>
    </div>
  );
}
