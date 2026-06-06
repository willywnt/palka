'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  QrCode,
  ScrollText,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { EmptyState } from '@/components/empty-state';
import { LowStockBadge } from '@/components/low-stock-badge';
import { QrCodeDialog } from '@/components/qr-code-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  useDeleteVariantsMutation,
  useMarkLabelsPrintedMutation,
  useProductQuery,
} from '../hooks/use-products';
import type { ProductVariantItem } from '../types';
import { formatCurrency } from '../utils/format';
import { buildVariantBlocks, formatVariantLabel } from '../utils/variants';
import { AddSubvariantsDialog } from './add-subvariants-dialog';
import { AddVariantDialog } from './add-variant-dialog';
import { DeleteVariantDialog } from './delete-variant-dialog';
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
  const [deleteTarget, setDeleteTarget] = useState<{
    variantIds: string[];
    kind: 'variant' | 'subvariant';
    label: string;
  } | null>(null);
  const [addSubGroup, setAddSubGroup] = useState<string | null>(null);
  const markPrinted = useMarkLabelsPrintedMutation();
  const deleteVariants = useDeleteVariantsMutation(productId);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteVariants.mutateAsync(deleteTarget.variantIds);
      toast.success('Deleted', {
        description: `${deleteTarget.variantIds.length} ${
          deleteTarget.variantIds.length === 1 ? 'variant' : 'variants'
        } archived.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

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
  // Standalone variants render flat; subvariants sharing a variantGroup collapse
  // under one group header (placed where the group first appears).
  const variantBlocks = buildVariantBlocks(data.variants);

  function renderVariantRow(variant: ProductVariantItem, grouped: boolean) {
    return (
      <TableRow key={variant.id}>
        <TableCell className={grouped ? 'pl-10' : undefined}>
          <div className="flex items-center gap-3">
            {/* Product photo slot (upload lands later); QR moved to the ⋯ menu. */}
            <div
              className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded"
              aria-hidden="true"
              title="Product photo (coming soon)"
            >
              <ImageIcon className="size-4" />
            </div>
            <div>
              <div className="font-medium">{variant.name}</div>
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
                <DropdownMenuItem onClick={() => setQrTarget(variant)}>
                  <QrCode className="size-4" />
                  Show QR code
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditTarget(variant)}>
                  <Pencil className="size-4" />
                  {grouped ? 'Edit subvariant' : 'Edit variant'}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/inventory/activity?search=${encodeURIComponent(variant.sku)}`}
                  >
                    <ScrollText className="size-4" />
                    View activity
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() =>
                    setDeleteTarget({
                      variantIds: [variant.id],
                      kind: grouped ? 'subvariant' : 'variant',
                      label: formatVariantLabel(variant),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                  {grouped ? 'Delete subvariant' : 'Delete variant'}
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
          {data.variants.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No variants yet"
              description="Add a variant to start tracking stock and pricing. A variant can stand alone or hold several subvariants (e.g. colors)."
              action={
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Add variant
                </Button>
              }
            />
          ) : (
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
                  {variantBlocks.map((block) =>
                    block.kind === 'single' ? (
                      renderVariantRow(block.variant, false)
                    ) : (
                      <Fragment key={`group-${block.name}`}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={4} className="py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Layers className="text-muted-foreground size-3.5" />
                                <span className="font-semibold">{block.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-xs tabular-nums">
                                  {block.variants.length}{' '}
                                  {block.variants.length === 1 ? 'subvariant' : 'subvariants'} ·{' '}
                                  {block.variants.reduce(
                                    (sum, variant) => sum + variant.availableStock,
                                    0,
                                  )}{' '}
                                  in stock
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="size-7">
                                      <MoreHorizontal className="size-4" />
                                      <span className="sr-only">Group actions</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setAddSubGroup(block.name)}>
                                      <Plus className="size-4" />
                                      Add subvariant
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() =>
                                        setDeleteTarget({
                                          variantIds: block.variants.map((variant) => variant.id),
                                          kind: 'variant',
                                          label: block.name,
                                        })
                                      }
                                    >
                                      <Trash2 className="size-4" />
                                      Delete variant
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                        {block.variants.map((variant) => renderVariantRow(variant, true))}
                      </Fragment>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
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
          title={formatVariantLabel(qrTarget)}
          lastPrintedAt={qrTarget.labelPrintedAt}
          onPrint={() => markPrinted.mutate([qrTarget.id])}
        />
      ) : null}

      <AddVariantDialog productId={productId} open={addOpen} onOpenChange={setAddOpen} />

      {addSubGroup !== null ? (
        <AddSubvariantsDialog
          productId={productId}
          groupName={addSubGroup}
          open={addSubGroup !== null}
          onOpenChange={(open) => {
            if (!open) setAddSubGroup(null);
          }}
        />
      ) : null}

      <DeleteVariantDialog
        productId={productId}
        variantIds={deleteTarget?.variantIds ?? []}
        kind={deleteTarget?.kind ?? 'variant'}
        label={deleteTarget?.label ?? ''}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        isDeleting={deleteVariants.isPending}
      />

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
