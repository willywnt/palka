'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useProductQuery } from '../hooks/use-products';
import type { ProductVariantItem } from '../types';
import { formatCurrency } from '../utils/format';
import { AddVariantDialog } from './add-variant-dialog';
import { EditVariantDialog } from './edit-variant-dialog';

export function ProductDetail({
  productId,
  onAdjustVariant,
}: {
  productId: string;
  onAdjustVariant: (variant: ProductVariantItem) => void;
}) {
  const { data, isLoading, error } = useProductQuery(productId);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductVariantItem | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/products">
            <ArrowLeft className="size-4" />
            Back to products
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Product not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/products">
          <ArrowLeft className="size-4" />
          Back to products
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{data.name}</h2>
            <Badge variant={data.isActive ? 'default' : 'secondary'}>
              {data.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {data.category ? <p className="text-muted-foreground text-sm">{data.category}</p> : null}
          {data.description ? <p className="text-sm">{data.description}</p> : null}
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add variant
        </Button>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell>
                  <div className="font-medium">{variant.name}</div>
                  <div className="text-muted-foreground text-xs">{variant.sku}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(variant.price)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-medium tabular-nums">{variant.availableStock}</span>
                  {variant.isLowStock ? (
                    <Badge variant="destructive" className="ml-2">
                      Low
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditTarget(variant)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onAdjustVariant(variant)}>
                      <SlidersHorizontal className="size-4" />
                      Adjust
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AddVariantDialog productId={productId} open={addOpen} onOpenChange={setAddOpen} />

      {editTarget ? (
        <EditVariantDialog
          key={editTarget.id}
          productId={productId}
          variant={editTarget}
          open={Boolean(editTarget)}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
