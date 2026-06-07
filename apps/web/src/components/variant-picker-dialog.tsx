'use client';

import { useState, type ReactNode } from 'react';
import { Package } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useStockOverviewQuery } from '@/modules/inventory/hooks/use-inventory';

/**
 * Search-and-pick an internal variant — the shared dialog behind "map an order
 * item to a product" and "map a marketplace listing to a variant". Pure UI:
 * reads the stock-overview hook for the list, hands the chosen variantId back via
 * `onSelect`; the caller owns the mutation. Debounced search, resets on close.
 */
export function VariantPickerDialog({
  open,
  onOpenChange,
  onSelect,
  title,
  description,
  busy = false,
  limit = 30,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (variantId: string) => void;
  title: string;
  description?: ReactNode;
  /** Disables the rows while the caller's mutation runs. */
  busy?: boolean;
  limit?: number;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading } = useStockOverviewQuery(debounced.trim() || undefined, false);
  const variants = (data ?? []).slice(0, limit);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="truncate">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search SKU or variant..."
          autoFocus
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))
          ) : variants.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No variants found.</p>
          ) : (
            variants.map((variant) => (
              <button
                key={variant.variantId}
                type="button"
                disabled={busy}
                onClick={() => onSelect(variant.variantId)}
                className="hover:bg-accent flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50"
              >
                <Package className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{variant.productName}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {variant.variantName} · {variant.sku}
                  </span>
                </span>
                <span className="text-muted-foreground num shrink-0 text-xs">
                  {variant.availableStock} in stock
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
