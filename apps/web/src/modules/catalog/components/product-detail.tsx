'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { LowStockBadge } from '@/components/low-stock-badge';
import { QrCodeDialog } from '@/components/qr-code-dialog';
import { QrImage } from '@/components/qr-image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useMarkLabelsPrintedMutation, useProductQuery } from '../hooks/use-products';
import type { ProductVariantItem } from '../types';
import { formatCurrency } from '../utils/format';
import { formatSubOptions, groupVariantsByFirstOption } from '../utils/options';
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
  const [qrTarget, setQrTarget] = useState<ProductVariantItem | null>(null);
  const markPrinted = useMarkLabelsPrintedMutation();

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

  const totalAvailable = data.variants.reduce((sum, variant) => sum + variant.availableStock, 0);
  const variantGroups = groupVariantsByFirstOption(data.variants);
  const firstDimension = data.optionTypes[0] ?? null;

  function renderVariantRow(variant: ProductVariantItem, indented: boolean) {
    const subOptions = formatSubOptions(variant.options);
    return (
      <TableRow key={variant.id}>
        <TableCell className={indented ? 'pl-10' : undefined}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQrTarget(variant)}
              className="hover:ring-primary/40 shrink-0 rounded transition hover:ring-2"
              title="View QR label"
            >
              <QrImage
                value={variant.barcode?.trim() || variant.sku}
                size={40}
                className="rounded"
              />
              <span className="sr-only">View QR label for {variant.sku}</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{variant.name}</span>
                {subOptions ? (
                  <Badge variant="secondary" className="font-normal">
                    {subOptions}
                  </Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground text-xs">{variant.sku}</div>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatCurrency(variant.price)}</TableCell>
        <TableCell className="text-right">
          <span className="font-medium tabular-nums">{variant.availableStock}</span>
          {variant.isLowStock ? (
            <LowStockBadge threshold={variant.lowStockThreshold} className="ml-2" />
          ) : null}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onAdjustVariant(variant)}>
              <SlidersHorizontal className="size-4" />
              Adjust
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditTarget(variant)}>
                  <Pencil className="size-4" />
                  Edit variant
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/inventory/activity?search=${encodeURIComponent(variant.sku)}`}
                  >
                    <ScrollText className="size-4" />
                    View activity
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
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

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{data.name}</h2>
        <Badge variant={data.isActive ? 'default' : 'secondary'}>
          {data.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Variants <span className="text-muted-foreground">· {data.variants.length}</span>
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
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
                {variantGroups
                  ? variantGroups.map((group) => (
                      <Fragment key={group.value || '__ungrouped'}>
                        {group.value ? (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={4} className="py-2">
                              <div className="flex items-center gap-2">
                                <Layers className="text-muted-foreground size-3.5" />
                                {firstDimension ? (
                                  <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                    {firstDimension}
                                  </span>
                                ) : null}
                                <span className="font-semibold">{group.value}</span>
                                <Badge variant="outline" className="font-normal">
                                  {group.variants.length}{' '}
                                  {group.variants.length === 1 ? 'variant' : 'variants'}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {group.variants.map((variant) =>
                          renderVariantRow(variant, Boolean(group.value)),
                        )}
                      </Fragment>
                    ))
                  : data.variants.map((variant) => renderVariantRow(variant, false))}
              </TableBody>
            </Table>
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total in stock</span>
                <span className="font-medium tabular-nums">{totalAvailable}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Variants</span>
                <span className="font-medium tabular-nums">{data.variants.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={data.isActive ? 'default' : 'secondary'}>
                  {data.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {data.category ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Category</span>
                  <span className="truncate text-right font-medium">{data.category}</span>
                </div>
              ) : null}
              {data.description ? (
                <p className="text-muted-foreground border-t pt-3">{data.description}</p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>

      {qrTarget ? (
        <QrCodeDialog
          open={Boolean(qrTarget)}
          onOpenChange={(open) => {
            if (!open) setQrTarget(null);
          }}
          value={qrTarget.barcode?.trim() || qrTarget.sku}
          title={`${data.name} · ${qrTarget.name}`}
          subtitle={`${qrTarget.sku} · ${formatCurrency(qrTarget.price)}`}
          lastPrintedAt={qrTarget.labelPrintedAt}
          onPrint={() => markPrinted.mutate([qrTarget.id])}
        />
      ) : null}

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
