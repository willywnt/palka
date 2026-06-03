'use client';

import { useState } from 'react';
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

import { useDeleteProductMutation, useProductsQuery } from '../hooks/use-products';
import type { ProductListItem } from '../types';
import { DeleteProductDialog } from './delete-product-dialog';
import { ProductFormDialog } from './product-form-dialog';

export function ProductsDashboard() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);

  const { data, isLoading, error } = useProductsQuery(search.trim() || undefined);
  const deleteMutation = useDeleteProductMutation();

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Product deleted', { description: `${deleteTarget.name} was archived.` });
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error('Delete failed', {
        description: deleteError instanceof Error ? deleteError.message : 'Unknown error',
      });
    }
  }

  const products = data ?? [];
  const isEmpty = !isLoading && products.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products..."
          className="sm:max-w-xs"
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New product
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load products. {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description={
            search
              ? 'No products match your search.'
              : 'Create your first product to start tracking stock.'
          }
          action={
            search ? null : (
              <Button onClick={() => setCreateOpen(true)} variant="outline">
                <Plus className="size-4" />
                New product
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell className="text-right tabular-nums">{product.variantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.totalAvailableStock}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? 'default' : 'secondary'}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={deleteMutation.isPending}
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(product)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
