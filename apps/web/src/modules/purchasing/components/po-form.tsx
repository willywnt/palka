'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatCurrency } from '@/lib/formatters';
import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import { useReorderReportQuery } from '@/modules/inventory/hooks/use-inventory';

import {
  useCreatePurchaseOrderMutation,
  usePurchaseVariantsQuery,
} from '../hooks/use-purchase-orders';
import type { PurchasableVariant } from '../types';

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
  const { data: results, isLoading } = usePurchaseVariantsQuery(debouncedSearch);

  const [lines, setLines] = useState<PoLine[]>([]);
  const [supplierName, setSupplierName] = useState('');

  const reorder = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });
  const createPo = useCreatePurchaseOrderMutation();

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
          <CardTitle className="text-base">Find product</CardTitle>
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
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : (results?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {debouncedSearch
                ? 'No matching products.'
                : 'Type to search, or load reorder suggestions.'}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {results?.map((variant) => (
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
    </div>
  );
}
