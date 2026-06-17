'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Boxes,
  ClipboardList,
  Minus,
  PackagePlus,
  Plus,
  ScanLine,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
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
import { formatProductVariantLabel } from '@/lib/variant-label';
import { useBundlesQuery } from '@/modules/catalog/hooks/use-bundles';
import type { BundleComponentLine, BundleDetail, BundleListItem } from '@/modules/catalog/types';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';
import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import { useReorderReportQuery } from '@/modules/inventory/hooks/use-inventory';

import {
  useCreatePurchaseOrderMutation,
  usePurchaseVariantsQuery,
} from '../hooks/use-purchase-orders';
import { useSupplierOptionsQuery } from '../hooks/use-suppliers';
import { usePurchaseScanner, type PoScannerStatus } from '../hooks/use-purchase-scanner';
import type { PurchasableVariant, ScannedPurchaseItem } from '../types';

/** Sentinel Select value for the "type a supplier name manually" option. */
const MANUAL_SUPPLIER = '__manual__';

/** Per-state copy + accent for the PO phone-scanner indicator. */
const SCAN_STATUS_META: Record<PoScannerStatus, { dot: string; cta: string; hint: string | null }> =
  {
    off: { dot: '', cta: '', hint: null },
    idle: { dot: 'bg-muted-foreground/40', cta: 'Scan dengan ponsel', hint: null },
    waiting: { dot: 'bg-highlight', cta: 'Tampilkan QR', hint: 'Menunggu ponsel kamu terhubung…' },
    connected: {
      dot: 'bg-status-ok',
      cta: 'Ponsel terhubung',
      hint: 'Ponsel terhubung — scan label produk buat nambahin ke pembelian.',
    },
    disconnected: {
      dot: 'bg-destructive',
      cta: 'Hubungkan ulang',
      hint: 'Ponsel terputus. Ketuk Hubungkan ulang buat tampilin QR baru.',
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
  variantGroup: string | null;
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
  const searchParams = useSearchParams();
  const prefillVariantId = searchParams.get('variant');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const {
    data: results,
    isLoading,
    error: variantsError,
    refetch: refetchVariants,
  } = usePurchaseVariantsQuery(debouncedSearch, page, pageSize);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  const variants = results?.items ?? [];
  const meta = results?.meta;

  // Bundles for the Bundling tab (debounced search). A separate unfiltered query
  // decides whether the tab is worth showing at all (≥1 bundle exists).
  const {
    data: bundlesData,
    isLoading: bundlesLoading,
    error: bundlesError,
    refetch: refetchBundles,
  } = useBundlesQuery(debouncedSearch, 'all', 1, 100);
  const { data: bundleExistsData } = useBundlesQuery('', 'all', 1, 1);
  const hasBundles = (bundleExistsData?.summary.total ?? 0) > 0;
  const resolveBundleDetail = useResolveBundleDetail();

  const [lines, setLines] = useState<PoLine[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  // True when the user chose "ketik manual" — reveals the free-text name field.
  const [manualSupplier, setManualSupplier] = useState(false);
  const supplierOptions = useSupplierOptionsQuery();
  const hasSuppliers = (supplierOptions.data?.length ?? 0) > 0;

  const reorder = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });
  const createPo = useCreatePurchaseOrderMutation();

  // One-click PO from the inventory table: ?variant=<id> appends that variant's
  // reorder suggestion as a line once the report is in. The ref keeps it a
  // one-shot (strict-mode double effects, report refetches).
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (!prefillVariantId || prefillHandled.current) return;
    const report = reorder.data;
    if (!report) return;
    prefillHandled.current = true;

    const item = report.items.find((entry) => entry.variantId === prefillVariantId);
    if (!item) {
      toast.info('Varian tidak ditemukan di laporan restok.');
      return;
    }
    setLines((prev) => {
      if (prev.some((line) => line.kind === 'variant' && line.variantId === item.variantId)) {
        return prev;
      }
      return [
        ...prev,
        {
          kind: 'variant',
          variantId: item.variantId,
          sku: item.sku,
          name: item.variantName,
          productName: item.productName,
          variantGroup: null,
          quantity: Math.max(item.suggestedReorderQty, item.minOrderQty ?? 0, 1),
          unitCost: 0,
          availableStock: item.availableStock,
          incomingStock: item.incomingStock,
          imageUrl: item.imageUrl,
        },
      ];
    });
  }, [prefillVariantId, reorder.data]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref('falka-purchasing-scan-sound');
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

  /** Append a variant line, or do nothing if it is already on the order (reorder suggestions). */
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

  /** Manual Tambah + scanner: append the variant line, or bump its qty if already on the order. */
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
          variantGroup: variant.variantGroup,
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
      toast.error('Gagal menambahkan bundel', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
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
      toast.info('Belum ada saran restok.');
      return;
    }
    for (const item of suggestions) {
      addVariantLine({
        kind: 'variant',
        variantId: item.variantId,
        sku: item.sku,
        name: item.variantName,
        productName: item.productName,
        variantGroup: null,
        quantity: item.suggestedReorderQty,
        unitCost: 0,
        availableStock: item.availableStock,
        incomingStock: item.incomingStock,
        imageUrl: null,
      });
    }
    toast.success(`${suggestions.length} saran dimuat`, {
      description: 'Jangan lupa atur modal satuan-nya.',
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
        supplierId: supplierId || undefined,
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
      toast.success(`Pembelian ${po.code} dibuat`, {
        description: `${formatCurrency(po.totalCost)} · masuk stok akan datang`,
      });
      router.push(`/dashboard/purchasing/${po.id}`);
    } catch (error) {
      toast.error('Gagal membuat pembelian', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Product picker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Cari produk</CardTitle>
            {scannerEnabled ? (
              <div className="flex items-center gap-1.5">
                <ActionTooltip label={soundOn ? 'Bisukan suara scan' : 'Aktifkan suara scan'}>
                  <Button variant="ghost" size="icon" onClick={toggleSound}>
                    {soundOn ? (
                      <Volume2 className="size-4" />
                    ) : (
                      <VolumeX className="text-muted-foreground size-4" />
                    )}
                    <span className="sr-only">
                      {soundOn ? 'Bisukan suara scan' : 'Aktifkan suara scan'}
                    </span>
                  </Button>
                </ActionTooltip>
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
              placeholder="Cari SKU atau nama produk..."
              autoFocus
            />
            <ActionTooltip label="Tambah item saran dari laporan restok">
              <Button
                type="button"
                variant="outline"
                onClick={loadReorderSuggestions}
                disabled={reorder.isLoading}
              >
                <ClipboardList className="size-4" />
                Restok
              </Button>
            </ActionTooltip>
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
                  Produk
                </TabsTrigger>
                <TabsTrigger value="bundling" className="flex-1">
                  Bundel
                </TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="mt-3">
                <VariantResults
                  variants={variants}
                  isLoading={isLoading}
                  error={variantsError}
                  onRetry={() => void refetchVariants()}
                  hasSearch={Boolean(debouncedSearch)}
                  onAdd={addOrBumpVariant}
                />
              </TabsContent>
              <TabsContent value="bundling" className="mt-3">
                <BundleResults
                  bundles={bundlesData?.items.filter((bundle) => bundle.isActive)}
                  isLoading={bundlesLoading}
                  error={bundlesError}
                  onRetry={() => void refetchBundles()}
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
              error={variantsError}
              onRetry={() => void refetchVariants()}
              hasSearch={Boolean(debouncedSearch)}
              onAdd={addOrBumpVariant}
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
          <CardTitle className="text-base">Pembelian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Pemasok (opsional)</Label>
            {hasSuppliers ? (
              <>
                <Select
                  id="supplier"
                  value={manualSupplier ? MANUAL_SUPPLIER : supplierId}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === MANUAL_SUPPLIER) {
                      setManualSupplier(true);
                      setSupplierId('');
                      setSupplierName('');
                      return;
                    }
                    setManualSupplier(false);
                    setSupplierId(value);
                    setSupplierName(
                      supplierOptions.data?.find((option) => option.id === value)?.name ?? '',
                    );
                  }}
                >
                  <option value="">Tanpa pemasok</option>
                  {(supplierOptions.data ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                  <option value={MANUAL_SUPPLIER}>+ Pemasok lain (ketik manual)…</option>
                </Select>
                {manualSupplier ? (
                  <Input
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    placeholder="Nama pemasok baru"
                  />
                ) : null}
              </>
            ) : (
              <Input
                id="supplier"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder="Nama pemasok"
              />
            )}
          </div>

          {lines.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              title="Belum ada item"
              description="Cari produk atau muat saran restok buat mulai bikin pembelian."
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
              <span className="text-muted-foreground text-sm">Total modal</span>
              <span className="num text-lg font-semibold">{formatCurrency(totalCost)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleCreate()}
              disabled={lines.length === 0 || createPo.isPending}
            >
              <PackagePlus className="size-4" />
              {createPo.isPending ? 'Membuat...' : 'Buat pembelian'}
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
  error,
  onRetry,
  hasSearch,
  onAdd,
}: {
  variants: PurchasableVariant[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
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

  if (error) {
    return <ErrorState className="p-6" title="Gagal memuat produk" onRetry={onRetry} />;
  }

  if (variants.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {hasSearch
          ? 'Tidak ada produk yang cocok.'
          : 'Ketik untuk mencari, atau muat saran restok.'}
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
                {formatProductVariantLabel(variant.productName, variant)}
              </div>
              <div className="text-muted-foreground text-xs">
                {variant.sku} · <span className="num">{variant.availableStock}</span> tersedia ·{' '}
                <span className="num">{variant.incomingStock}</span> akan datang
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onAdd(variant)}>
            <Plus className="size-4" />
            Tambah
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
  error,
  onRetry,
  hasSearch,
  isAdding,
  onAdd,
}: {
  bundles: BundleListItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
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

  if (error) {
    return <ErrorState className="p-6" title="Gagal memuat bundel" onRetry={onRetry} />;
  }

  if ((bundles?.length ?? 0) === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {hasSearch ? 'Tidak ada bundel yang cocok.' : 'Belum ada bundel.'}
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
                  Bundel
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {bundle.sku} · <span className="num">{bundle.totalVariant}</span> item
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={isAdding} onClick={() => onAdd(bundle)}>
            <Plus className="size-4" />
            Tambah
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * − / + buttons flanking the qty input. Both paths go through the SAME clamped
 * (≥1) update the input itself reports — typing still works.
 */
function QtyStepper({
  id,
  quantity,
  onQuantityChange,
}: {
  id: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="shrink-0"
        onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
        disabled={quantity <= 1}
        aria-label="Kurangi jumlah"
      >
        <Minus className="size-4" />
      </Button>
      <NumberInput
        id={id}
        className="w-16 text-center"
        value={quantity}
        onChange={(value) => onQuantityChange(Math.max(1, value))}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="shrink-0"
        onClick={() => onQuantityChange(quantity + 1)}
        aria-label="Tambah jumlah"
      >
        <Plus className="size-4" />
      </Button>
    </div>
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
              {formatProductVariantLabel(line.productName, line)}
            </div>
            <div className="text-muted-foreground text-xs">
              {line.sku} · <span className="num">{line.availableStock}</span> tersedia ·{' '}
              <span className="num">{line.incomingStock}</span> akan datang
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Hapus">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`po-line-qty-${line.variantId}`}>Qty</Label>
          <QtyStepper
            id={`po-line-qty-${line.variantId}`}
            quantity={line.quantity}
            onQuantityChange={(quantity) => onPatch({ quantity })}
          />
        </div>
        <div className="min-w-28 flex-1 space-y-1.5">
          <Label htmlFor={`po-line-cost-${line.variantId}`}>Modal satuan</Label>
          <NumberInput
            id={`po-line-cost-${line.variantId}`}
            value={line.unitCost}
            onChange={(value) => onPatch({ unitCost: Math.max(0, value) })}
          />
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitCost * line.quantity)}</div>
        </div>
      </div>
    </div>
  );
}

/** A bundle PO row: a violet badge, a bundle-cost input, and its per-component breakdown. */
function BundlePoRow({
  line,
  onPatch,
  onRemove,
}: {
  line: BundlePoLine;
  onPatch: (patch: Partial<BundlePoLine>) => void;
  onRemove: () => void;
}) {
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
                Bundel
              </Badge>
            </div>
            <div className="text-muted-foreground text-xs">{line.sku}</div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Hapus">
          <Trash2 className="size-4" />
        </Button>
      </div>

      <ul className="bg-muted/40 mt-2 space-y-1 rounded-md px-2.5 py-2">
        {line.components.map((component) => (
          <li
            key={component.name}
            className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate">{component.name}</span>
            <span className="num whitespace-nowrap">{line.quantity * component.quantity}×</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`po-bundle-qty-${line.bundleId}`}>Qty</Label>
          <QtyStepper
            id={`po-bundle-qty-${line.bundleId}`}
            quantity={line.quantity}
            onQuantityChange={(quantity) => onPatch({ quantity })}
          />
        </div>
        <div className="min-w-28 flex-1 space-y-1.5">
          <Label htmlFor={`po-bundle-cost-${line.bundleId}`}>Modal bundel</Label>
          <NumberInput
            id={`po-bundle-cost-${line.bundleId}`}
            value={line.unitCost}
            onChange={(value) => onPatch({ unitCost: Math.max(0, value) })}
          />
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitCost * line.quantity)}</div>
        </div>
      </div>
    </div>
  );
}
