'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Boxes, Layers, MoreHorizontal, Plus, QrCode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { BuoyArt } from '@/components/maritime-art';
import { QrCodeDialog } from '@/components/qr-code-dialog';
import { StatCard } from '@/components/stat-card';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import {
  useBundlesQuery,
  useDeleteBundleMutation,
  useMarkBundleLabelsPrintedMutation,
  type BundleStatusFilter,
} from '../hooks/use-bundles';
import type { BundleListItem } from '../types';
import { ArchivedBundles } from './archived-bundles';
import { BundleImage } from './bundle-image';

/** Lightweight stand-in matching the page rhythm while the URL-synced filters hydrate. */
function BundlesDashboardFallback() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function BundlesDashboard() {
  return (
    <Suspense fallback={<BundlesDashboardFallback />}>
      <BundlesDashboardContent />
    </Suspense>
  );
}

function BundlesDashboardContent() {
  const [filters, setFilters] = useUrlFilters({ search: '', status: 'all', page: '1' });
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const [pageSize, setPageSize] = useState(10);

  // Push the debounced search into the URL-synced filters (resetting paging).
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch, page: '1' });
  }, [debouncedSearch, filters.search, setFilters]);

  const status: BundleStatusFilter =
    filters.status === 'available' || filters.status === 'unavailable' ? filters.status : 'all';
  const page = Number(filters.page) || 1;

  const { data, isLoading, error, refetch } = useBundlesQuery(
    filters.search,
    status,
    page,
    pageSize,
  );
  const deleteBundle = useDeleteBundleMutation();
  const markPrinted = useMarkBundleLabelsPrintedMutation();
  const [qrTarget, setQrTarget] = useState<BundleListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BundleListItem | null>(null);
  const { allowed: canDelete } = useHasPermission('catalog.delete');

  const bundles = data?.items ?? [];
  const meta = data?.meta;
  const summary = data?.summary;
  const isEmpty = !isLoading && bundles.length === 0;
  const isFiltered = Boolean(filters.search) || status !== 'all';

  async function handleDelete(bundle: BundleListItem) {
    try {
      await deleteBundle.mutateAsync(bundle.id);
      toast.success('Bundel diarsipkan', {
        description: 'Bisa dipulihkan dari "Bundel terarsip".',
      });
    } catch (deleteError) {
      toast.error('Gagal mengarsipkan bundel', {
        description: deleteError instanceof Error ? deleteError.message : 'Coba lagi.',
      });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {summary
          ? (
              [
                {
                  key: 'all',
                  label: 'Semua bundel',
                  value: summary.total,
                  tone: 'muted',
                  icon: Layers,
                },
                {
                  key: 'available',
                  label: 'Tersedia',
                  value: summary.available,
                  tone: 'emerald',
                  icon: Boxes,
                },
                {
                  key: 'unavailable',
                  label: 'Stok habis',
                  value: summary.unavailable,
                  tone: 'amber',
                  icon: AlertTriangle,
                },
              ] as const
            ).map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setFilters({ status: card.key, page: '1' })}
                aria-pressed={status === card.key}
                className="focus-visible:ring-ring rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none"
              >
                <StatCard
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  tone={card.tone}
                  className={cn(
                    'h-full transition-colors',
                    status === card.key ? 'ring-primary ring-2' : 'hover:border-primary/40',
                  )}
                />
              </button>
            ))
          : Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari SKU atau nama bundel…"
          className="sm:max-w-xs"
        />
        <Button asChild>
          <Link href="/dashboard/bundles/new">
            <Plus className="size-4" />
            Bundel baru
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat bundel" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={isFiltered ? Layers : undefined}
          art={isFiltered ? undefined : <BuoyArt />}
          title={isFiltered ? 'Tidak ada bundel yang cocok' : 'Belum ada bundel'}
          description={
            isFiltered
              ? 'Coba pencarian atau filter lain.'
              : 'Paket jualan dari beberapa varian — punya SKU & harga sendiri, stok tetap ikut komponennya.'
          }
          action={
            isFiltered ? undefined : (
              <Button asChild>
                <Link href="/dashboard/bundles/new">
                  <Plus className="size-4" />
                  Bundel baru
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Total varian</TableHead>
                  <TableHead className="text-right">Tersedia</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((bundle) => (
                  <TableRow key={bundle.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <BundleImage
                          bundleId={bundle.id}
                          imageUrl={bundle.imageUrl}
                          label={bundle.name}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/dashboard/bundles/${bundle.id}`}
                              className="font-medium hover:underline"
                            >
                              {bundle.name}
                            </Link>
                            {!bundle.isActive ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 px-1.5 py-0 text-[10px]"
                              >
                                Nonaktif
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground text-xs">{bundle.sku}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {bundle.totalVariant}
                    </TableCell>
                    <TableCell className="num text-right font-medium">{bundle.available}</TableCell>
                    <TableCell className="num text-right">{formatCurrency(bundle.price)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Aksi lainnya</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setQrTarget(bundle)}>
                            <QrCode className="size-4" />
                            Tampilkan QR code
                          </DropdownMenuItem>
                          {canDelete ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(bundle)}
                            >
                              <Trash2 className="size-4" />
                              Arsipkan bundel
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {meta && meta.total > 0 ? (
            <TablePagination
              page={meta.page}
              pageSize={pageSize}
              total={meta.total}
              onPageChange={(nextPage) => setFilters({ page: String(nextPage) })}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setFilters({ page: '1' });
              }}
            />
          ) : null}
        </>
      )}

      <ArchivedBundles />

      {qrTarget ? (
        <QrCodeDialog
          open={Boolean(qrTarget)}
          onOpenChange={(open) => {
            if (!open) setQrTarget(null);
          }}
          value={qrTarget.sku}
          name={qrTarget.name}
          sku={qrTarget.sku}
          lastPrintedAt={qrTarget.labelPrintedAt}
          onPrint={() => markPrinted.mutate([qrTarget.id])}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arsipkan “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Bundel diarsipkan dan disembunyikan dari daftar, POS, dan scan. Varian komponen serta
              stoknya tidak terpengaruh, SKU-nya dibebaskan, dan bundel bisa dipulihkan kapan saja
              dari “Bundel terarsip”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && void handleDelete(deleteTarget)}
              disabled={deleteBundle.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Arsipkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
