'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Package, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { StatusBadge } from '@/components/status-badge';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { cn } from '@/lib/utils';

import { useDeleteProductMutation, useProductsQuery } from '../hooks/use-products';
import type { ProductListItem } from '../types';
import { DeleteProductDialog } from './delete-product-dialog';
import { ProductFormDialog } from './product-form-dialog';

export function ProductsDashboard() {
  const [filters, setFilters] = useUrlFilters({ search: '', page: '1' });
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const { pageSize, setPageSize } = usePagination();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);

  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch, page: '1' });
  }, [debouncedSearch, filters.search, setFilters]);

  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const { data, isLoading, isFetching, error, refetch } = useProductsQuery(
    filters.search.trim() || undefined,
    page,
    pageSize,
  );
  const deleteMutation = useDeleteProductMutation();

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Produk dihapus', { description: `${deleteTarget.name} telah diarsipkan.` });
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error('Gagal menghapus', {
        description: deleteError instanceof Error ? deleteError.message : 'Terjadi kesalahan',
      });
    }
  }

  const products = data?.items ?? [];
  const total = data?.meta?.total ?? products.length;
  const isEmpty = !isLoading && total === 0;

  // Row actions (the ⋯ menu) — shared by the sm+ table and the <sm card list.
  function renderRowActions(product: ProductListItem) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Buka aksi</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={deleteMutation.isPending}
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(product)}
          >
            <Trash2 className="size-4" />
            Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari produk..."
          className="sm:max-w-xs"
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Produk baru
        </Button>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="ml-auto h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat produk" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={filters.search ? Package : undefined}
          art={filters.search ? undefined : <BuoyArt />}
          title="Belum ada produk"
          description={
            filters.search
              ? 'Tidak ada produk yang cocok dengan pencarian kamu.'
              : 'Buat produk pertama kamu untuk mulai melacak stok.'
          }
          action={
            filters.search ? null : (
              <Button onClick={() => setCreateOpen(true)} variant="outline">
                <Plus className="size-4" />
                Produk baru
              </Button>
            )
          }
        />
      ) : (
        <div className={cn('space-y-3', isFetching && 'opacity-60 transition-opacity')}>
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Varian</TableHead>
                  <TableHead className="text-right">Tersedia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.category ? (
                        <div className="text-muted-foreground text-xs">{product.category}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.variantCount === 0 ? (
                        <StatusBadge tone="warn" className="font-normal">
                          Tanpa varian
                        </StatusBadge>
                      ) : (
                        <span className="num">{product.variantCount}</span>
                      )}
                    </TableCell>
                    <TableCell className="num text-right">{product.totalAvailableStock}</TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'default' : 'secondary'}>
                        {product.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{renderRowActions(product)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 sm:hidden">
            {products.map((product) => (
              <div key={product.id} className="bg-card rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium break-words hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.category ? (
                      <p className="text-muted-foreground text-xs">{product.category}</p>
                    ) : null}
                  </div>
                  <div className="-mt-1.5 -mr-1.5 shrink-0">{renderRowActions(product)}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  {product.variantCount === 0 ? (
                    <StatusBadge tone="warn" className="font-normal">
                      Tanpa varian
                    </StatusBadge>
                  ) : (
                    <span className="text-muted-foreground">
                      Varian{' '}
                      <span className="num text-foreground font-medium">
                        {product.variantCount}
                      </span>
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Tersedia{' '}
                    <span className="num text-foreground font-medium">
                      {product.totalAvailableStock}
                    </span>
                  </span>
                  <Badge variant={product.isActive ? 'default' : 'secondary'}>
                    {product.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(nextPage) => setFilters({ page: String(nextPage) })}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setFilters({ page: '1' });
            }}
          />
        </div>
      )}

      <ProductFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <DeleteProductDialog
        product={deleteTarget}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
