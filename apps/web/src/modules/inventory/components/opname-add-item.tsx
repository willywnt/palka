'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, ScanLine, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

import { ActionTooltip } from '@/components/ui/action-tooltip';
import { ErrorState } from '@/components/error-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useScanSoundPref } from '@/hooks/use-scan-sound-pref';
import { useSoundUnlock } from '@/hooks/use-sound-unlock';
import { unlockScanSound } from '@/lib/scan-sound';
import { cn } from '@/lib/utils';
import { formatProductVariantLabel } from '@/lib/variant-label';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';

import { useOpnameScanner, type OpnameScannerStatus } from '../hooks/use-opname-scanner';
import { useCountableVariantsQuery, useUpsertOpnameItemMutation } from '../hooks/use-stock-opname';
import type { CountableVariant } from '../types';

/** Per-state copy + accent for the opname phone-scanner indicator. */
const SCAN_STATUS_META: Record<
  OpnameScannerStatus,
  { dot: string; cta: string; hint: string | null }
> = {
  off: { dot: '', cta: '', hint: null },
  idle: { dot: 'bg-muted-foreground/40', cta: 'Scan pakai ponsel', hint: null },
  waiting: { dot: 'bg-highlight', cta: 'Tampilkan QR', hint: 'Menunggu ponsel kamu terhubung…' },
  connected: {
    dot: 'bg-status-ok',
    cta: 'Ponsel terhubung',
    hint: 'Ponsel terhubung — scan label produk buat nambah hitungan (+1 tiap scan).',
  },
  disconnected: {
    dot: 'bg-destructive',
    cta: 'Hubungkan ulang',
    hint: 'Ponsel terputus. Ketuk Hubungkan ulang buat tampilin QR baru.',
  },
};

export function OpnameAddItem({
  opnameId,
  countedVariantIds,
}: {
  opnameId: string;
  countedVariantIds: Set<string>;
}) {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const { data, isLoading, error, refetch } = useCountableVariantsQuery(
    debouncedSearch,
    page,
    pageSize,
  );

  const [scanCode, setScanCode] = useState('');
  const upsert = useUpsertOpnameItemMutation(opnameId);

  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref('falka-opname-scan-sound');
  useSoundUnlock();
  // Phone scan-to-count: a paired phone scans a product label → tally +1.
  const { scannerEnabled, status, scan, isScanning } = useOpnameScanner({
    opnameId,
    soundEnabled: soundOn,
  });
  const scanMeta = SCAN_STATUS_META[status];

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  function openScanner() {
    unlockScanSound();
    setScannerOpen(true);
  }

  /** Add a variant with its count defaulting to the system qty (variance 0 — edit it in the table). */
  function addVariant(variant: CountableVariant) {
    upsert.mutate(
      { variantId: variant.variantId, countedQuantity: variant.systemQuantity },
      {
        onError: (err) =>
          toast.error('Gagal menambahkan item', {
            description: err instanceof Error ? err.message : 'Terjadi kesalahan',
          }),
      },
    );
  }

  function handleScanSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    void scan(code);
    setScanCode('');
  }

  const variants = data?.items ?? [];
  const meta = data?.meta;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Tambah item ke hitungan</CardTitle>
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
        <form onSubmit={handleScanSubmit} className="flex gap-2">
          <Input
            value={scanCode}
            onChange={(event) => setScanCode(event.target.value)}
            placeholder="Scan / ketik barcode atau SKU lalu Enter (+1)"
            aria-label="Scan barcode atau SKU"
            autoFocus
          />
          <Button type="submit" variant="outline" disabled={isScanning || !scanCode.trim()}>
            <ScanLine className="size-4" />
            +1
          </Button>
        </form>
        {scannerEnabled && scanMeta.hint ? (
          <p
            className={cn(
              'text-xs',
              status === 'disconnected' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {scanMeta.hint}
          </p>
        ) : null}

        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Atau cari SKU / nama produk..."
        />

        {error ? (
          <ErrorState className="p-6" title="Gagal memuat produk" onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : variants.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {debouncedSearch ? 'Tidak ada produk yang cocok.' : 'Ketik untuk mencari produk.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {variants.map((variant) => {
              const added = countedVariantIds.has(variant.variantId);
              return (
                <li
                  key={variant.variantId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ImageThumb src={variant.imageUrl} alt={variant.name} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {formatProductVariantLabel(variant.productName, variant)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {variant.sku} · <span className="num">{variant.systemQuantity}</span> sistem
                      </div>
                    </div>
                  </div>
                  {added ? (
                    <span className="text-status-ok inline-flex items-center gap-1 text-xs font-medium">
                      <Check className="size-4" />
                      Ditambahkan
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={upsert.isPending}
                      onClick={() => addVariant(variant)}
                    >
                      <Plus className="size-4" />
                      Tambah
                    </Button>
                  )}
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

      <ConnectScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} purpose="OPNAME" />
    </Card>
  );
}
