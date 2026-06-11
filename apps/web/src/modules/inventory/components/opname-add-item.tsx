'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, ScanLine } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorState } from '@/components/error-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { formatProductVariantLabel } from '@/lib/variant-label';

import {
  useCountableVariantsQuery,
  useResolveCountableMutation,
  useUpsertOpnameItemMutation,
} from '../hooks/use-stock-opname';
import type { CountableVariant } from '../types';

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
  const resolve = useResolveCountableMutation();
  const upsert = useUpsertOpnameItemMutation(opnameId);

  // A new search resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

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

  async function handleScan(event: React.FormEvent) {
    event.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    try {
      const variant = await resolve.mutateAsync(code);
      if (!variant) {
        toast.error('Kode tidak ditemukan', { description: code });
        return;
      }
      if (countedVariantIds.has(variant.variantId)) {
        toast.info('Sudah ada di hitungan', {
          description: formatProductVariantLabel(variant.productName, variant),
        });
      } else {
        addVariant(variant);
      }
      setScanCode('');
    } catch (err) {
      toast.error('Gagal mencari kode', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  const variants = data?.items ?? [];
  const meta = data?.meta;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tambah item ke hitungan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={(event) => void handleScan(event)} className="flex gap-2">
          <Input
            value={scanCode}
            onChange={(event) => setScanCode(event.target.value)}
            placeholder="Scan / ketik barcode atau SKU lalu Enter"
            aria-label="Scan barcode atau SKU"
          />
          <Button type="submit" variant="outline" disabled={resolve.isPending || !scanCode.trim()}>
            <ScanLine className="size-4" />
            Tambah
          </Button>
        </form>

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
    </Card>
  );
}
