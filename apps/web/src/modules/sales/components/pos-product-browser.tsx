import type { RefObject } from 'react';
import { Plus, ScanLine, Star, Volume2, VolumeX } from 'lucide-react';

import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/error-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { formatProductVariantLabel } from '@/lib/variant-label';
import type { BundleListItem } from '@/modules/catalog/types';

import type { PosScannerStatus } from '../hooks/use-pos-scanner';
import type { SellableVariant } from '../types';
import { KbdHint } from './pos-kbd-hint';

/** Per-state copy + accent for the POS phone-scanner indicator. */
const SCAN_STATUS_META: Record<
  PosScannerStatus,
  { dot: string; cta: string; hint: string | null }
> = {
  off: { dot: '', cta: '', hint: null },
  idle: { dot: 'bg-muted-foreground/40', cta: 'Scan dengan ponsel', hint: null },
  waiting: {
    dot: 'bg-highlight',
    cta: 'Tampilkan QR',
    hint: 'Menunggu ponsel kamu terhubung…',
  },
  connected: {
    dot: 'bg-status-ok',
    cta: 'Ponsel terhubung',
    hint: 'Ponsel terhubung — scan label produk buat masukin ke keranjang.',
  },
  disconnected: {
    dot: 'bg-destructive',
    cta: 'Hubungkan ulang',
    hint: 'Ponsel terputus. Ketuk Hubungkan ulang buat tampilin QR baru.',
  },
};

/** Star toggle for pinning a row to the POS favorites strip. */
function FavoriteToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const label = active ? 'Lepas dari favorit' : 'Sematkan ke favorit';
  return (
    <ActionTooltip label={label}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-pressed={active}
        onClick={onToggle}
      >
        <Star
          className={cn(
            'size-4',
            active ? 'text-highlight-strong fill-current' : 'text-muted-foreground',
          )}
        />
        <span className="sr-only">{label}</span>
      </Button>
    </ActionTooltip>
  );
}

/**
 * The "Favorit" quick-add strip above the results (search empty only). Favorites
 * resolve against the currently fetched page; the ones it can't find render as a
 * muted note instead of vanishing silently.
 */
function FavoritesStrip<T>({
  items,
  skippedCount,
  getKey,
  getLabel,
  onAdd,
}: {
  items: T[];
  skippedCount: number;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onAdd: (item: T) => void;
}) {
  if (items.length === 0 && skippedCount === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium">Favorit</p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Button
              key={getKey(item)}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAdd(item)}
            >
              <Star className="text-highlight-strong size-3.5 fill-current" aria-hidden />
              <span className="max-w-40 truncate">{getLabel(item)}</span>
            </Button>
          ))}
        </div>
      ) : null}
      {skippedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Sebagian favorit tidak tampil di halaman ini.
        </p>
      ) : null}
    </div>
  );
}

/** The variant search list (shared between the no-tabs and Products-tab layouts). */
function ProductResults({
  variants,
  isLoading,
  error,
  onRetry,
  hasSearch,
  onAdd,
  favoriteIds,
  onToggleFavorite,
}: {
  variants: SellableVariant[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasSearch: boolean;
  onAdd: (variant: SellableVariant) => void;
  favoriteIds: string[];
  onToggleFavorite: (variantId: string) => void;
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

  const favoriteVariants = favoriteIds
    .map((id) => variants?.find((variant) => variant.variantId === id))
    .filter((variant): variant is SellableVariant => variant !== undefined);
  const favoritesStrip =
    !hasSearch && favoriteIds.length > 0 ? (
      <FavoritesStrip
        items={favoriteVariants}
        skippedCount={favoriteIds.length - favoriteVariants.length}
        getKey={(variant) => variant.variantId}
        getLabel={(variant) => formatProductVariantLabel(variant.productName, variant)}
        onAdd={onAdd}
      />
    ) : null;

  if ((variants?.length ?? 0) === 0) {
    return (
      <div className="space-y-3">
        {favoritesStrip}
        <p className="text-muted-foreground py-6 text-center text-sm">
          {hasSearch ? 'Tidak ada produk yang cocok.' : 'Ketik untuk mencari produk.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {favoritesStrip}
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
            <div className="flex shrink-0 items-center gap-1">
              <FavoriteToggle
                active={favoriteIds.includes(variant.variantId)}
                onToggle={() => onToggleFavorite(variant.variantId)}
              />
              <Button size="sm" variant="outline" onClick={() => onAdd(variant)}>
                <Plus className="size-4" />
                Tambah
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
  favoriteIds,
  onToggleFavorite,
}: {
  bundles: BundleListItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasSearch: boolean;
  isAdding: boolean;
  onAdd: (bundle: BundleListItem) => void;
  favoriteIds: string[];
  onToggleFavorite: (bundleId: string) => void;
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

  const favoriteBundles = favoriteIds
    .map((id) => bundles?.find((bundle) => bundle.id === id))
    .filter((bundle): bundle is BundleListItem => bundle !== undefined);
  const favoritesStrip =
    !hasSearch && favoriteIds.length > 0 ? (
      <FavoritesStrip
        items={favoriteBundles}
        skippedCount={favoriteIds.length - favoriteBundles.length}
        getKey={(bundle) => bundle.id}
        getLabel={(bundle) => bundle.name}
        onAdd={onAdd}
      />
    ) : null;

  if ((bundles?.length ?? 0) === 0) {
    return (
      <div className="space-y-3">
        {favoritesStrip}
        <p className="text-muted-foreground py-6 text-center text-sm">
          {hasSearch ? 'Tidak ada bundel yang cocok.' : 'Belum ada bundel.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {favoritesStrip}
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
            <div className="flex shrink-0 items-center gap-1">
              <FavoriteToggle
                active={favoriteIds.includes(bundle.id)}
                onToggle={() => onToggleFavorite(bundle.id)}
              />
              <Button size="sm" variant="outline" disabled={isAdding} onClick={() => onAdd(bundle)}>
                <Plus className="size-4" />
                Tambah
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Presentational "Cari produk" card: scanner toolbar, search box, results, pagination. */
export function PosProductBrowser({
  scannerEnabled,
  scannerStatus,
  soundOn,
  onToggleSound,
  onOpenScanner,
  searchInputRef,
  searchInput,
  onSearchInputChange,
  hasSearch,
  hasBundles,
  variants,
  variantsLoading,
  variantsError,
  onRetryVariants,
  onAddVariant,
  favoriteVariantIds,
  onToggleFavoriteVariant,
  bundles,
  bundlesLoading,
  bundlesError,
  onRetryBundles,
  isAddingBundle,
  onAddBundle,
  favoriteBundleIds,
  onToggleFavoriteBundle,
  pageMeta,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  scannerEnabled: boolean;
  scannerStatus: PosScannerStatus;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenScanner: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  hasSearch: boolean;
  hasBundles: boolean;
  variants: SellableVariant[];
  variantsLoading: boolean;
  variantsError: Error | null;
  onRetryVariants: () => void;
  onAddVariant: (variant: SellableVariant) => void;
  favoriteVariantIds: string[];
  onToggleFavoriteVariant: (variantId: string) => void;
  bundles: BundleListItem[] | undefined;
  bundlesLoading: boolean;
  bundlesError: Error | null;
  onRetryBundles: () => void;
  isAddingBundle: boolean;
  onAddBundle: (bundle: BundleListItem) => void;
  favoriteBundleIds: string[];
  onToggleFavoriteBundle: (bundleId: string) => void;
  pageMeta: { page: number; total: number } | undefined;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const scanMeta = SCAN_STATUS_META[scannerStatus];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Cari produk</CardTitle>
          {scannerEnabled ? (
            <div className="flex items-center gap-1.5">
              <ActionTooltip label={soundOn ? 'Bisukan suara scan' : 'Aktifkan suara scan'}>
                <Button variant="ghost" size="icon" className="size-8" onClick={onToggleSound}>
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
              <Button variant="outline" size="sm" onClick={onOpenScanner}>
                <span className={cn('size-2 rounded-full', scanMeta.dot)} aria-hidden />
                <ScanLine className="size-4" />
                {scanMeta.cta}
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Input
            ref={searchInputRef}
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Cari SKU atau nama produk..."
            className="md:pr-8"
          />
          <KbdHint label="/" className="absolute top-1/2 right-2 -translate-y-1/2" />
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
              <ProductResults
                variants={variants}
                isLoading={variantsLoading}
                error={variantsError}
                onRetry={onRetryVariants}
                hasSearch={hasSearch}
                onAdd={onAddVariant}
                favoriteIds={favoriteVariantIds}
                onToggleFavorite={onToggleFavoriteVariant}
              />
            </TabsContent>
            <TabsContent value="bundling" className="mt-3">
              <BundleResults
                bundles={bundles}
                isLoading={bundlesLoading}
                error={bundlesError}
                onRetry={onRetryBundles}
                hasSearch={hasSearch}
                isAdding={isAddingBundle}
                onAdd={onAddBundle}
                favoriteIds={favoriteBundleIds}
                onToggleFavorite={onToggleFavoriteBundle}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <ProductResults
            variants={variants}
            isLoading={variantsLoading}
            error={variantsError}
            onRetry={onRetryVariants}
            hasSearch={hasSearch}
            onAdd={onAddVariant}
            favoriteIds={favoriteVariantIds}
            onToggleFavorite={onToggleFavoriteVariant}
          />
        )}

        {pageMeta && pageMeta.total > 0 ? (
          <TablePagination
            page={pageMeta.page}
            pageSize={pageSize}
            total={pageMeta.total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
