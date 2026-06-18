'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SalePaymentMethod } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMediaQuery } from '@/hooks/use-media-query';
import { usePagination } from '@/hooks/use-pagination';
import { useScanSoundPref } from '@/hooks/use-scan-sound-pref';
import { useSoundUnlock } from '@/hooks/use-sound-unlock';
import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { formatCurrency } from '@/lib/formatters';
import { unlockScanSound } from '@/lib/scan-sound';
import { useBundlesQuery } from '@/modules/catalog/hooks/use-bundles';
import type { BundleDetail, BundleListItem, BundleResolution } from '@/modules/catalog/types';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';

import { useCreateSaleMutation, useSellableVariantsQuery } from '../hooks/use-sales';
import { usePosScanner } from '../hooks/use-pos-scanner';
import { usePosFavoritesStore } from '../store/pos-favorites.store';
import { computeSaleTotals } from '../utils/sale-totals';
import { computeQuickTenderValues } from '../utils/pos-tender';
import type { ScannedSaleItem, SellableVariant } from '../types';
import type {
  BundleCartComponent,
  BundleCartLine,
  CartLine,
  VariantCartLine,
} from './pos-cart-types';
import { PosCart } from './pos-cart';
import { PosPaymentPanel, PAYMENT_OPTIONS, paymentMethodLabel } from './pos-payment-panel';
import { PosProductBrowser } from './pos-product-browser';

export { PAYMENT_OPTIONS, paymentMethodLabel };

const SCAN_SOUND_STORAGE_KEY = 'falka-pos-scan-sound';

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
  const {
    data: results,
    isLoading,
    error: variantsError,
    refetch: refetchVariants,
  } = useSellableVariantsQuery(debouncedSearch, page, pageSize);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  // Auto-focus the search box on desktop only — on a phone it would pop the
  // keyboard over the page on load. (autoFocus can't wait for matchMedia, so
  // focus imperatively once the query resolves to desktop.)
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const payButtonRef = useRef<HTMLButtonElement>(null);
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (isDesktop && !didAutoFocusRef.current) {
      didAutoFocusRef.current = true;
      searchInputRef.current?.focus();
    }
  }, [isDesktop]);

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

  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [customerName, setCustomerName] = useState('');
  // Change calculator (CASH only) — pure client math, never sent to the server.
  const [cashReceived, setCashReceived] = useState(0);
  // Cart-level discount (reset per sale) + PPN settings (sticky per register).
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(11);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref(SCAN_SOUND_STORAGE_KEY);

  // Pinned favorites (ids only — the items themselves come from the queries above).
  const { favoriteVariantIds, favoriteBundleIds, toggleFavoriteVariant, toggleFavoriteBundle } =
    usePosFavoritesStore();

  // Unlock Web Audio on the first interaction so scan beeps can play.
  useSoundUnlock();

  function openScanner() {
    // Opening from a click unlocks audio so later socket-driven beeps can play.
    unlockScanSound();
    setScannerOpen(true);
  }

  const createSale = useCreateSaleMutation();

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );
  // Mirrors the server's authoritative math exactly (same shared util).
  const totals = useMemo(
    () =>
      computeSaleTotals(
        subtotal,
        discountValue > 0 ? { type: discountType, value: discountValue } : null,
        taxEnabled ? taxRate : 0,
        taxInclusive,
      ),
    [subtotal, discountType, discountValue, taxEnabled, taxRate, taxInclusive],
  );
  const total = totals.totalAmount;

  // Quick cash tender: the 3 smallest common notes that still cover the total.
  const quickTenderValues = useMemo(() => computeQuickTenderValues(total), [total]);

  // Minimal kasir shortcuts (desktop only): '/' jumps to the product search when
  // focus is NOT in an editable element; F8 jumps to payment from anywhere (its
  // whole point is escaping an input straight to the pay button).
  const canPay = cart.length > 0 && !createSale.isPending;
  useEffect(() => {
    if (!isDesktop) return;

    function isEditableTarget(target: EventTarget | null): boolean {
      return (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable)
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === 'F8') {
        event.preventDefault();
        paymentSectionRef.current?.scrollIntoView({ block: 'nearest' });
        if (canPay) payButtonRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, canPay]);

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
          cost: variant.cost != null ? Number(variant.cost) : null,
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
    // The disabled button is only a UI hint, not a lock: the F8 shortcut focuses
    // the pay button and a fast Enter/double-tap can re-enter before isPending
    // flips, creating two sales that BOTH decrement stock. Guard in the handler.
    if (cart.length === 0 || createSale.isPending) return;
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
        ...(discountValue > 0 ? { discount: { type: discountType, value: discountValue } } : {}),
        ...(taxEnabled && taxRate > 0 ? { taxRate, taxInclusive } : {}),
      });
      toast.success(`Penjualan ${sale.code} tercatat`, {
        description: `${formatCurrency(sale.totalAmount)} · stok diperbarui`,
      });
      setCart([]);
      setCustomerName('');
      setCashReceived(0);
      // Discount is per-sale; the PPN setting stays (a register-level habit).
      setDiscountValue(0);
      setSearchInput('');
    } catch (error) {
      toast.error('Pembayaran gagal', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <div className="grid gap-6 pb-24 sm:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Product picker */}
      <PosProductBrowser
        scannerEnabled={scannerEnabled}
        scannerStatus={scannerStatus}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenScanner={openScanner}
        searchInputRef={searchInputRef}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        hasSearch={Boolean(debouncedSearch)}
        hasBundles={hasBundles}
        variants={variants}
        variantsLoading={isLoading}
        variantsError={variantsError}
        onRetryVariants={() => void refetchVariants()}
        onAddVariant={addVariantToCart}
        favoriteVariantIds={favoriteVariantIds}
        onToggleFavoriteVariant={toggleFavoriteVariant}
        bundles={bundlesData?.items.filter((bundle) => bundle.isActive)}
        bundlesLoading={bundlesLoading}
        bundlesError={bundlesError}
        onRetryBundles={() => void refetchBundles()}
        isAddingBundle={resolveBundleDetail.isPending}
        onAddBundle={handleAddBundleFromList}
        favoriteBundleIds={favoriteBundleIds}
        onToggleFavoriteBundle={toggleFavoriteBundle}
        pageMeta={meta}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Cart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keranjang</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PosCart
            cart={cart}
            isLineOversold={isLineOversold}
            onPatchVariantLine={patchVariantLine}
            onRemoveVariantLine={removeVariantLine}
            onPatchBundleLine={patchBundleLine}
            onRemoveBundleLine={removeBundleLine}
          />

          <PosPaymentPanel
            paymentSectionRef={paymentSectionRef}
            payButtonRef={payButtonRef}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            customerName={customerName}
            setCustomerName={setCustomerName}
            discountType={discountType}
            setDiscountType={setDiscountType}
            discountValue={discountValue}
            setDiscountValue={setDiscountValue}
            taxEnabled={taxEnabled}
            setTaxEnabled={setTaxEnabled}
            taxRate={taxRate}
            setTaxRate={setTaxRate}
            taxInclusive={taxInclusive}
            setTaxInclusive={setTaxInclusive}
            cashReceived={cashReceived}
            setCashReceived={setCashReceived}
            totals={totals}
            total={total}
            quickTenderValues={quickTenderValues}
            cartCount={cart.length}
            isPending={createSale.isPending}
            onCheckout={() => void handleCheckout()}
          />
        </CardContent>
      </Card>

      {/* Sticky mobile checkout — the cart total + pay button stay reachable while
          the cart scrolls; same handler + disabled conditions as the card button. */}
      {cart.length > 0 ? (
        <div className="bg-card fixed inset-x-0 bottom-0 z-30 border-t p-3 sm:hidden">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="num-display truncate">{formatCurrency(total)}</p>
            </div>
            <Button
              size="lg"
              className="shrink-0"
              onClick={() => void handleCheckout()}
              disabled={cart.length === 0 || createSale.isPending}
            >
              <Banknote className="size-4" />
              {createSale.isPending ? 'Memproses...' : 'Bayar'}
            </Button>
          </div>
        </div>
      ) : null}

      <ConnectScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} purpose="POS" />
    </div>
  );
}
