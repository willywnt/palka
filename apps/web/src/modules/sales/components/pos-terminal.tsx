'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  PackageSearch,
  Plus,
  ScanLine,
  ShoppingCart,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SalePaymentMethod } from '@prisma/client';

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
import type { BundleDetail, BundleListItem, BundleResolution } from '@/modules/catalog/types';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';

import { useCreateSaleMutation, useSellableVariantsQuery } from '../hooks/use-sales';
import { usePosScanner, type PosScannerStatus } from '../hooks/use-pos-scanner';
import type { ScannedSaleItem, SellableVariant } from '../types';

const SCAN_SOUND_STORAGE_KEY = 'olshop-pos-scan-sound';

/** Per-state copy + accent for the POS phone-scanner indicator. */
const SCAN_STATUS_META: Record<
  PosScannerStatus,
  { dot: string; cta: string; hint: string | null }
> = {
  off: { dot: '', cta: '', hint: null },
  idle: { dot: 'bg-muted-foreground/40', cta: 'Scan menggunakan ponsel', hint: null },
  waiting: {
    dot: 'bg-amber-500',
    cta: 'Tampilkan QR',
    hint: 'Menunggu ponsel kamu terhubung…',
  },
  connected: {
    dot: 'bg-emerald-500',
    cta: 'ponsel terhubung',
    hint: 'ponsel terhubung — scan label produk buat masukin ke keranjang.',
  },
  disconnected: {
    dot: 'bg-destructive',
    cta: 'Hubungkan ulang',
    hint: 'ponsel terputus. Ketuk Hubungkan ulang buat tampilin QR baru.',
  },
};

/** A single component variant a bundle line will consume (for oversell math + display). */
type BundleCartComponent = {
  productVariantId: string;
  name: string;
  quantity: number;
  availableStock: number;
};

type VariantCartLine = {
  kind: 'variant';
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  variantGroup: string | null;
  unitPrice: number;
  quantity: number;
  availableStock: number;
  incomingStock: number;
  imageUrl: string | null;
};

type BundleCartLine = {
  kind: 'bundle';
  bundleId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  components: BundleCartComponent[];
};

type CartLine = VariantCartLine | BundleCartLine;

const PAYMENT_OPTIONS: ReadonlyArray<{ value: SalePaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Tunai' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'CARD', label: 'Kartu' },
  { value: 'OTHER', label: 'Lainnya' },
];

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

export function PosTerminal() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const { data: results, isLoading } = useSellableVariantsQuery(debouncedSearch, page, pageSize);

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

  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [customerName, setCustomerName] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref(SCAN_SOUND_STORAGE_KEY);

  // Unlock Web Audio on the first interaction so scan beeps can play.
  useSoundUnlock();

  function openScanner() {
    // Opening from a click unlocks audio so later socket-driven beeps can play.
    unlockScanSound();
    setScannerOpen(true);
  }

  const createSale = useCreateSaleMutation();

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  // Total demand and known availability PER variant across the whole cart, so a
  // variant sold both standalone AND inside a bundle warns once their combined
  // demand exceeds its stock (oversell is allowed — this is just a heads-up).
  const { demandByVariant, availableByVariant } = useMemo(() => {
    const demand = new Map<string, number>();
    const available = new Map<string, number>();
    for (const line of cart) {
      if (line.kind === 'variant') {
        demand.set(line.variantId, (demand.get(line.variantId) ?? 0) + line.quantity);
        available.set(line.variantId, line.availableStock);
      } else {
        for (const component of line.components) {
          demand.set(
            component.productVariantId,
            (demand.get(component.productVariantId) ?? 0) + line.quantity * component.quantity,
          );
          available.set(component.productVariantId, component.availableStock);
        }
      }
    }
    return { demandByVariant: demand, availableByVariant: available };
  }, [cart]);

  /** A cart line oversells if ANY variant it contributes to is over its available stock. */
  function isLineOversold(line: CartLine): boolean {
    const variantIds =
      line.kind === 'variant'
        ? [line.variantId]
        : line.components.map((component) => component.productVariantId);
    return variantIds.some(
      (variantId) =>
        (demandByVariant.get(variantId) ?? 0) > (availableByVariant.get(variantId) ?? 0),
    );
  }

  function addVariantToCart(variant: SellableVariant) {
    setCart((prev) => {
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
          unitPrice: Number(variant.price),
          quantity: 1,
          availableStock: variant.availableStock,
          incomingStock: variant.incomingStock,
          imageUrl: variant.imageUrl,
        },
      ];
    });
  }

  /** Add or bump a bundle line. Components carry stock so the oversell math sees them. */
  function addBundleToCart(bundle: {
    id: string;
    name: string;
    sku: string;
    price: string;
    imageUrl: string | null;
    components: BundleCartComponent[];
  }) {
    setCart((prev) => {
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
          unitPrice: Number(bundle.price),
          quantity: 1,
          imageUrl: bundle.imageUrl,
          components: bundle.components,
        },
      ];
    });
  }

  function bundleResolutionToComponents(bundle: BundleResolution | BundleDetail) {
    return bundle.components.map((component) => ({
      productVariantId: component.productVariantId,
      name: component.name,
      quantity: component.quantity,
      availableStock: component.availableStock,
    }));
  }

  async function handleAddBundleFromList(item: BundleListItem) {
    try {
      const detail = await resolveBundleDetail.mutateAsync(item.id);
      addBundleToCart({
        id: detail.id,
        name: detail.name,
        sku: detail.sku,
        price: detail.price,
        imageUrl: detail.imageUrl,
        components: bundleResolutionToComponents(detail),
      });
    } catch (error) {
      toast.error('Gagal menambahkan bundel', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  // Mobile scan-to-cart: a paired phone scans a product/bundle label → add the line.
  function handleScanned(scanned: ScannedSaleItem) {
    if (scanned.kind === 'variant') {
      addVariantToCart(scanned.variant);
    } else {
      addBundleToCart({
        id: scanned.bundle.id,
        name: scanned.bundle.name,
        sku: scanned.bundle.sku,
        price: scanned.bundle.price,
        imageUrl: null,
        components: bundleResolutionToComponents(scanned.bundle),
      });
    }
  }

  const { scannerEnabled, status: scannerStatus } = usePosScanner({
    onResolved: handleScanned,
    soundEnabled: soundOn,
  });
  const scanMeta = SCAN_STATUS_META[scannerStatus];

  function patchVariantLine(variantId: string, patch: Partial<VariantCartLine>) {
    setCart((prev) =>
      prev.map((line) =>
        line.kind === 'variant' && line.variantId === variantId ? { ...line, ...patch } : line,
      ),
    );
  }

  function patchBundleLine(bundleId: string, patch: Partial<BundleCartLine>) {
    setCart((prev) =>
      prev.map((line) =>
        line.kind === 'bundle' && line.bundleId === bundleId ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeVariantLine(variantId: string) {
    setCart((prev) =>
      prev.filter((line) => !(line.kind === 'variant' && line.variantId === variantId)),
    );
  }

  function removeBundleLine(bundleId: string) {
    setCart((prev) =>
      prev.filter((line) => !(line.kind === 'bundle' && line.bundleId === bundleId)),
    );
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    try {
      const sale = await createSale.mutateAsync({
        items: cart.map((line) =>
          line.kind === 'variant'
            ? {
                kind: 'variant',
                variantId: line.variantId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              }
            : {
                kind: 'bundle',
                bundleId: line.bundleId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              },
        ),
        paymentMethod,
        customerName: customerName.trim() || undefined,
      });
      toast.success(`Penjualan ${sale.code} tercatat`, {
        description: `${formatCurrency(sale.totalAmount)} · stok diperbarui`,
      });
      setCart([]);
      setCustomerName('');
      setSearchInput('');
    } catch (error) {
      toast.error('Checkout gagal', {
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleSound}
                  aria-label={soundOn ? 'Bisukan suara scan' : 'Aktifkan suara scan'}
                  title={soundOn ? 'Bisukan suara scan' : 'Aktifkan suara scan'}
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
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Cari SKU atau nama produk..."
            autoFocus
          />
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
                <ProductResults
                  variants={variants}
                  isLoading={isLoading}
                  hasSearch={Boolean(debouncedSearch)}
                  onAdd={addVariantToCart}
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
            <ProductResults
              variants={variants}
              isLoading={isLoading}
              hasSearch={Boolean(debouncedSearch)}
              onAdd={addVariantToCart}
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

      {/* Cart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keranjang</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Keranjang kosong"
              description="Cari produk lalu tambahkan buat mulai jualan."
            />
          ) : (
            <div className="space-y-3">
              {cart.map((line) =>
                line.kind === 'variant' ? (
                  <VariantCartRow
                    key={`variant-${line.variantId}`}
                    line={line}
                    oversold={isLineOversold(line)}
                    onPatch={(patch) => patchVariantLine(line.variantId, patch)}
                    onRemove={() => removeVariantLine(line.variantId)}
                  />
                ) : (
                  <BundleCartRow
                    key={`bundle-${line.bundleId}`}
                    line={line}
                    oversold={isLineOversold(line)}
                    onPatch={(patch) => patchBundleLine(line.bundleId, patch)}
                    onRemove={() => removeBundleLine(line.bundleId)}
                  />
                ),
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment">Pembayaran</Label>
                <Select
                  id="payment"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as SalePaymentMethod)}
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer">Pelanggan (opsional)</Label>
                <Input
                  id="customer"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Pelanggan langsung"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground text-sm">Total harga</span>
              <span className="num text-lg font-semibold">{formatCurrency(total)}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleCheckout()}
              disabled={cart.length === 0 || createSale.isPending}
            >
              <PackageSearch className="size-4" />
              {createSale.isPending ? 'Memproses...' : 'Checkout'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConnectScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} purpose="POS" />
    </div>
  );
}

/** The variant search list (shared between the no-tabs and Products-tab layouts). */
function ProductResults({
  variants,
  isLoading,
  hasSearch,
  onAdd,
}: {
  variants: SellableVariant[] | undefined;
  isLoading: boolean;
  hasSearch: boolean;
  onAdd: (variant: SellableVariant) => void;
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

  if ((variants?.length ?? 0) === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {hasSearch ? 'Tidak ada produk yang cocok.' : 'Ketik untuk mencari produk.'}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {variants?.map((variant) => (
        <li key={variant.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <ImageThumb src={variant.imageUrl} alt={variant.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {formatProductVariantLabel(variant.productName, variant)}
              </div>
              <div className="text-muted-foreground text-xs">
                {variant.sku} · {formatCurrency(variant.price)} ·{' '}
                <span className={variant.availableStock <= 0 ? 'text-destructive' : ''}>
                  {variant.availableStock} tersedia
                </span>
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
                {bundle.sku} · {formatCurrency(bundle.price)} · {bundle.totalVariant} item ·{' '}
                <span className={bundle.available <= 0 ? 'text-destructive' : ''}>
                  {bundle.available} tersedia
                </span>
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

/** A standalone-variant cart row. */
function VariantCartRow({
  line,
  oversold,
  onPatch,
  onRemove,
}: {
  line: VariantCartLine;
  oversold: boolean;
  onPatch: (patch: Partial<VariantCartLine>) => void;
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
              {line.sku} · {line.availableStock} tersedia · {line.incomingStock} akan datang
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Hapus">
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
          <Label>Harga satuan</Label>
          <NumberInput
            value={line.unitPrice}
            onChange={(value) => onPatch({ unitPrice: Math.max(0, value) })}
          />
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitPrice * line.quantity)}</div>
        </div>
      </div>
      {oversold ? (
        <Badge variant="outline" className="mt-2 border-amber-500 text-amber-600">
          Melebihi stok (boleh, barangnya ada di tangan) · sisa {line.availableStock} di sistem
        </Badge>
      ) : null}
    </div>
  );
}

/** A bundle cart row: a violet badge + its component variants and resulting quantities. */
function BundleCartRow({
  line,
  oversold,
  onPatch,
  onRemove,
}: {
  line: BundleCartLine;
  oversold: boolean;
  onPatch: (patch: Partial<BundleCartLine>) => void;
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
            key={component.productVariantId}
            className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate">{component.name}</span>
            <span className="num whitespace-nowrap">{line.quantity * component.quantity}×</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
        <div className="space-y-1.5">
          <Label>Qty</Label>
          <NumberInput
            value={line.quantity}
            onChange={(value) => onPatch({ quantity: Math.max(1, value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Harga bundel</Label>
          <NumberInput
            value={line.unitPrice}
            onChange={(value) => onPatch({ unitPrice: Math.max(0, value) })}
          />
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitPrice * line.quantity)}</div>
        </div>
      </div>
      {oversold ? (
        <Badge variant="outline" className="mt-2 border-amber-500 text-amber-600">
          Melebihi stok (boleh, barangnya ada di tangan) · ada komponen yang kurang
        </Badge>
      ) : null}
    </div>
  );
}
