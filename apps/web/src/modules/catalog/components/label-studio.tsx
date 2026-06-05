'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Printer, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatCurrency, formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { useLabelVariantsQuery, useMarkLabelsPrintedMutation } from '../hooks/use-products';
import { useQrCodes } from '../hooks/use-qr-codes';
import type { LabelVariant } from '../types';
import { LabelSheet, labelCodeFor } from './label-sheet';

/**
 * Phase A of POS QR-scan: pick variants and print an A4 sheet of QR labels
 * (each encodes `barcode ?? sku`). Pure client render — no new tables. Selection
 * is held as a Map so picks survive search changes that filter a row out of view.
 */
export function LabelStudio() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const [page, setPage] = useState(1);
  const { data: results, isLoading } = useLabelVariantsQuery(debouncedSearch, page);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const [selected, setSelected] = useState<Map<string, LabelVariant>>(new Map());
  const labels = useMemo(() => [...selected.values()], [selected]);
  const codeValues = useMemo(() => labels.map(labelCodeFor), [labels]);
  const qrCodes = useQrCodes(codeValues);
  const qrReady = codeValues.every((value) => qrCodes.has(value));
  const markPrinted = useMarkLabelsPrintedMutation();

  const variants = results?.items ?? [];
  const meta = results?.meta;

  function handlePrint() {
    if (labels.length === 0 || !qrReady) return;
    // Stamp the printed time so the picker flags these as already printed.
    markPrinted.mutate(labels.map((label) => label.variantId));
    window.print();
  }

  function toggle(variant: LabelVariant) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(variant.variantId)) next.delete(variant.variantId);
      else next.set(variant.variantId, variant);
      return next;
    });
  }

  function selectPage() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const variant of variants) next.set(variant.variantId, variant);
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
          placeholder="Search SKU, barcode, or product name..."
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={selectPage} disabled={variants.length === 0}>
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
              Variants
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
            ) : variants.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {debouncedSearch ? 'No matching variants.' : 'No active variants to label.'}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {variants.map((variant) => {
                  const isSelected = selected.has(variant.variantId);
                  return (
                    <li key={variant.variantId}>
                      <button
                        type="button"
                        onClick={() => toggle(variant)}
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
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {variant.productName} · {variant.name}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {labelCodeFor(variant)} · {formatCurrency(variant.price)}
                          </span>
                          {variant.labelPrintedAt ? (
                            <span
                              className="block truncate text-[11px] text-amber-600"
                              suppressHydrationWarning
                            >
                              Printed {formatRelativeTime(variant.labelPrintedAt)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {meta && meta.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-muted-foreground text-xs">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!meta.hasPreviousPage}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!meta.hasNextPage}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div>
          {labels.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="No labels selected"
              description="Pick variants on the left to build a printable label sheet."
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
