'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  PackagePlus,
  Plus,
  ScanLine,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useScanSoundPref } from '@/hooks/use-scan-sound-pref';
import { useSoundUnlock } from '@/hooks/use-sound-unlock';
import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { formatCurrency } from '@/lib/formatters';
import { unlockScanSound } from '@/lib/scan-sound';
import { cn } from '@/lib/utils';
import { useBundlesQuery } from '@/modules/catalog/hooks/use-bundles';
import type { BundleComponentLine, BundleDetail, BundleListItem } from '@/modules/catalog/types';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';
import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import { useReorderReportQuery } from '@/modules/inventory/hooks/use-inventory';

import {
  useCreatePurchaseOrderMutation,
  usePurchaseVariantsQuery,
} from '../hooks/use-purchase-orders';
import { usePurchaseScanner, type PoScannerStatus } from '../hooks/use-purchase-scanner';
import type { PurchasableVariant, ScannedPurchaseItem } from '../types';

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

/** A component variant a bundle line will buy (for the resulting-quantity breakdown). */
type BundleLineComponent = {
  name: string;
  quantity: number;
};

type VariantPoLine = {
  kind: 'variant';
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  quantity: number;
  unitCost: number;
  availableStock: number;
  incomingStock: number;
  imageUrl: string | null;
};

type BundlePoLine = {
  kind: 'bundle';
  bundleId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  imageUrl: string | null;
  components: BundleLineComponent[];
};

type PoLine = VariantPoLine | BundlePoLine;

/** Sum a bundle's component costs (× per-bundle qty) — the default whole-bundle cost. */
function defaultBundleCost(components: BundleComponentLine[]): number {
  return components.reduce(
    (sum, component) => sum + Number(component.cost ?? 0) * component.quantity,
    0,
  );
}

function toLineComponents(components: BundleComponentLine[]): BundleLineComponent[] {
  return components.map((component) => ({
    name: component.name,
    quantity: component.quantity,
  }));
}

/** Fetch a bundle's components on demand (Bundling-tab "Add" needs the full composition). */
function useResolveBundleDetail() {
  return useMutation({
    mutationFn: async (bundleId: string) => {
      const result = await apiFetch<BundleDetail>(`${apiRoutes.bundles}/${bundleId}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

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

  // Bundles for the Bundling tab (debounced search). A separate unfiltered query
  // decides whether the tab is worth showing at all (≥1 bundle exists).
  const { data: bundlesData, isLoading: bundlesLoading } = useBundlesQuery(
    debouncedSearch,
    'all',
    1,
    100,
  );
  const { data: bundleExistsData } = useBundlesQuery('', 'all', 1, 1);
  const hasBundles = (bundleExistsData?.summary.total ?? 0) > 0;
  const resolveBundleDetail = useResolveBundleDetail();

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
  // Mobile scan-to-order: a paired phone scans a product/bundle label → add/bump the line.
  const { scannerEnabled, status: scannerStatus } = usePurchaseScanner({
    onResolved: handleScanned,
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

  /** Append a variant line, or do nothing if it is already on the order. */
  function addVariantLine(line: VariantPoLine) {
    setLines((prev) => {
      if (
        prev.some(
          (existing) => existing.kind === 'variant' && existing.variantId === line.variantId,
        )
      ) {
        return prev;
      }
      return [...prev, line];
    });
  }

  function addVariant(variant: PurchasableVariant) {
    addVariantLine({
      kind: 'variant',
      variantId: variant.variantId,
      sku: variant.sku,
      name: variant.name,
      productName: variant.productName,
      quantity: 1,
      unitCost: Number(variant.cost ?? 0),
      availableStock: variant.availableStock,
      incomingStock: variant.incomingStock,
      imageUrl: variant.imageUrl,
    });
  }

  /** Scanner add: append the variant line, or bump its qty if already on the order. */
  function addOrBumpVariant(variant: PurchasableVariant) {
    setLines((prev) => {
      const existing = prev.find(
        (line) => line.kind === 'variant' && line.variantId === variant.variantId,
      );
      if (existing) {
        return prev.map((line) =>
          line.kind === 'variant' && line.variantId === variant.variantId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...prev,
        {
          kind: 'variant',
          variantId: variant.variantId,
          sku: variant.sku,
          name: variant.name,
          productName: variant.productName,
          quantity: 1,
          unitCost: Number(variant.cost ?? 0),
          availableStock: variant.availableStock,
          incomingStock: variant.incomingStock,
          imageUrl: variant.imageUrl,
        },
      ];
    });
  }

  /** Add or bump a bundle line (its components drive the per-variant buy quantities). */
  function addBundleToOrder(bundle: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    components: BundleComponentLine[];
  }) {
    setLines((prev) => {
      const existing = prev.find((line) => line.kind === 'bundle' && line.bundleId === bundle.id);
      if (existing) {
        return prev.map((line) =>
          line.kind === 'bundle' && line.bundleId === bundle.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...prev,
        {
          kind: 'bundle',
          bundleId: bundle.id,
          name: bundle.name,
          sku: bundle.sku,
          quantity: 1,
          unitCost: defaultBundleCost(bundle.components),
          imageUrl: bundle.imageUrl,
          components: toLineComponents(bundle.components),
        },
      ];
    });
  }

  async function handleAddBundleFromList(item: BundleListItem) {
    try {
      const detail = await resolveBundleDetail.mutateAsync(item.id);
      addBundleToOrder({
        id: detail.id,
        name: detail.name,
        sku: detail.sku,
        imageUrl: detail.imageUrl,
        components: detail.components,
      });
    } catch (error) {
      toast.error('Could not add bundle', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Mobile scan-to-order: a paired phone scans a product/bundle label → add the line.
  function handleScanned(scanned: ScannedPurchaseItem) {
    if (scanned.kind === 'variant') {
      addOrBumpVariant(scanned.variant);
    } else {
      addBundleToOrder({
        id: scanned.bundle.id,
        name: scanned.bundle.name,
        sku: scanned.bundle.sku,
        imageUrl: null,
        components: scanned.bundle.components,
      });
    }
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
      addVariantLine({
        kind: 'variant',
        variantId: item.variantId,
        sku: item.sku,
        name: item.variantName,
        productName: item.productName,
        quantity: item.suggestedReorderQty,
        unitCost: 0,
        availableStock: item.availableStock,
        incomingStock: item.incomingStock,
        imageUrl: null,
      });
    }
    toast.success(`Loaded ${suggestions.length} suggestion(s)`, {
      description: 'Set the unit costs.',
    });
  }

  function patchVariantLine(variantId: string, patch: Partial<VariantPoLine>) {
    setLines((prev) =>
      prev.map((line) =>
        line.kind === 'variant' && line.variantId === variantId ? { ...line, ...patch } : line,
      ),
    );
  }

  function patchBundleLine(bundleId: string, patch: Partial<BundlePoLine>) {
    setLines((prev) =>
      prev.map((line) =>
        line.kind === 'bundle' && line.bundleId === bundleId ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeVariantLine(variantId: string) {
    setLines((prev) =>
      prev.filter((line) => !(line.kind === 'variant' && line.variantId === variantId)),
    );
  }

  function removeBundleLine(bundleId: string) {
    setLines((prev) =>
      prev.filter((line) => !(line.kind === 'bundle' && line.bundleId === bundleId)),
    );
  }

  async function handleCreate() {
    if (lines.length === 0) return;
    try {
      const po = await createPo.mutateAsync({
        supplierName: supplierName.trim() || undefined,
        items: lines.map((line) =>
          line.kind === 'variant'
            ? {
                kind: 'variant',
                variantId: line.variantId,
                quantity: line.quantity,
                unitCost: line.unitCost,
              }
            : {
                kind: 'bundle',
                bundleId: line.bundleId,
                quantity: line.quantity,
                unitCost: line.unitCost,
              },
        ),
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

          {hasBundles ? (
            <Tabs defaultValue="products">
              <TabsList className="w-full">
                <TabsTrigger value="products" className="flex-1">
                  Products
                </TabsTrigger>
                <TabsTrigger value="bundling" className="flex-1">
                  Bundling
                </TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="mt-3">
                <VariantResults
                  variants={variants}
                  isLoading={isLoading}
                  hasSearch={Boolean(debouncedSearch)}
                  onAdd={addVariant}
                />
              </TabsContent>
              <TabsContent value="bundling" className="mt-3">
                <BundleResults
                  bundles={bundlesData?.items.filter((bundle) => bundle.isActive)}
                  isLoading={bundlesLoading}
                  hasSearch={Boolean(debouncedSearch)}
                  isAdding={resolveBundleDetail.isPending}
                  onAdd={handleAddBundleFromList}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <VariantResults
              variants={variants}
              isLoading={isLoading}
              hasSearch={Boolean(debouncedSearch)}
              onAdd={addVariant}
            />
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
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Supplier (optional)</Label>
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
              {lines.map((line) =>
                line.kind === 'variant' ? (
                  <VariantPoRow
                    key={`variant-${line.variantId}`}
                    line={line}
                    onPatch={(patch) => patchVariantLine(line.variantId, patch)}
                    onRemove={() => removeVariantLine(line.variantId)}
                  />
                ) : (
                  <BundlePoRow
                    key={`bundle-${line.bundleId}`}
                    line={line}
                    onPatch={(patch) => patchBundleLine(line.bundleId, patch)}
                    onRemove={() => removeBundleLine(line.bundleId)}
                  />
                ),
              )}
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

/** The variant search list (shared between the no-tabs and Products-tab layouts). */
function VariantResults({
  variants,
  isLoading,
  hasSearch,
  onAdd,
}: {
  variants: PurchasableVariant[];
  isLoading: boolean;
  hasSearch: boolean;
  onAdd: (variant: PurchasableVariant) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {hasSearch ? 'No matching products.' : 'Type to search, or load reorder suggestions.'}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {variants.map((variant) => (
        <li key={variant.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <ImageThumb src={variant.imageUrl} alt={variant.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {variant.productName} · {variant.name}
              </div>
              <div className="text-muted-foreground text-xs">
                {variant.sku} · {variant.availableStock} avail · {variant.incomingStock} incoming
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onAdd(variant)}>
            <Plus className="size-4" />
            Add
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The bundle list for the Bundling tab. */
function BundleResults({
  bundles,
  isLoading,
  hasSearch,
  isAdding,
  onAdd,
}: {
  bundles: BundleListItem[] | undefined;
  isLoading: boolean;
  hasSearch: boolean;
  isAdding: boolean;
  onAdd: (bundle: BundleListItem) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if ((bundles?.length ?? 0) === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {hasSearch ? 'No matching bundles.' : 'No bundles yet.'}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {bundles?.map((bundle) => (
        <li key={bundle.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <ImageThumb src={bundle.imageUrl} alt={bundle.name} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{bundle.name}</span>
                <Badge
                  variant="outline"
                  className="border-violet-500/40 text-violet-600 dark:text-violet-400"
                >
                  Bundle
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {bundle.sku} · {bundle.totalVariant} items
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={isAdding} onClick={() => onAdd(bundle)}>
            <Plus className="size-4" />
            Add
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A standalone-variant PO row. */
function VariantPoRow({
  line,
  onPatch,
  onRemove,
}: {
  line: VariantPoLine;
  onPatch: (patch: Partial<VariantPoLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ImageThumb src={line.imageUrl} alt={line.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {line.productName} · {line.name}
            </div>
            <div className="text-muted-foreground text-xs">
              {line.sku} · {line.availableStock} avail · {line.incomingStock} incoming
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
        <div className="space-y-1.5">
          <Label>Qty</Label>
          <NumberInput
            value={line.quantity}
            onChange={(value) => onPatch({ quantity: Math.max(1, value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unit cost</Label>
          <NumberInput
            value={line.unitCost}
            onChange={(value) => onPatch({ unitCost: Math.max(0, value) })}
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
  );
}

/** A bundle PO row: a violet badge, a bundle-cost input, and an expandable per-component breakdown. */
function BundlePoRow({
  line,
  onPatch,
  onRemove,
}: {
  line: BundlePoLine;
  onPatch: (patch: Partial<BundlePoLine>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ImageThumb src={line.imageUrl} alt={line.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{line.name}</span>
              <Badge
                variant="outline"
                className="border-violet-500/40 text-violet-600 dark:text-violet-400"
              >
                <Boxes className="size-3" />
                Bundle
              </Badge>
            </div>
            <div className="text-muted-foreground text-xs">{line.sku}</div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove">
          <Trash2 className="size-4" />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1 text-xs"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {line.components.length} component{line.components.length === 1 ? '' : 's'}
      </button>
      {expanded ? (
        <ul className="bg-muted/40 mt-2 space-y-1 rounded-md px-2.5 py-2">
          {line.components.map((component) => (
            <li
              key={component.name}
              className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{component.name}</span>
              <span className="whitespace-nowrap tabular-nums">
                {line.quantity * component.quantity}×
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
        <div className="space-y-1.5">
          <Label>Qty</Label>
          <NumberInput
            value={line.quantity}
            onChange={(value) => onPatch({ quantity: Math.max(1, value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Bundle cost</Label>
          <NumberInput
            value={line.unitCost}
            onChange={(value) => onPatch({ unitCost: Math.max(0, value) })}
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
  );
}
