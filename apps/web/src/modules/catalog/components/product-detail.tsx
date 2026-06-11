'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
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
import { EllipsisTooltip } from '@/components/ui/action-tooltip';
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
import { ConnectionBadges } from './connection-badges';
import { DeleteVariantDialog } from './delete-variant-dialog';
import { EditVariantDialog } from './edit-variant-dialog';
import { VariantImage } from './variant-image';

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
      toast.success('Dihapus', {
        description: `${deleteTarget.variantIds.length} ${
          deleteTarget.variantIds.length === 1 ? 'varian' : 'varian'
        } diarsipkan.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Gagal menghapus', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-44" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-36" />
            </div>
            <div className="overflow-hidden rounded-xl border">
              <Skeleton className="h-10 w-full rounded-none" />
              <div className="divide-y">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4 px-4 py-3.5">
                    <Skeleton className="size-9 shrink-0 rounded-md" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="ml-auto h-4 w-14" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <aside>
            <Skeleton className="h-56 w-full rounded-xl" />
          </aside>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/products">
            <ArrowLeft className="size-4" />
            Kembali ke produk
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Produk tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const totalAvailable = data.variants.reduce((sum, variant) => sum + variant.availableStock, 0);
  // Standalone variants render flat; subvariants sharing a variantGroup collapse
  // under one group header (placed where the group first appears).
  const variantBlocks = buildVariantBlocks(data.variants);

  // A variant can map to several listings in the same shop — show each connection once.
  function dedupeConnections(variant: ProductVariantItem) {
    return Array.from(
      new Map(variant.mappings.map((mapping) => [mapping.connectionId, mapping])).values(),
    );
  }

  // The per-variant ⋯ menu — shared by the sm+ table rows and the <sm cards.
  function renderVariantMenu(variant: ProductVariantItem, grouped: boolean) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Aksi lainnya</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setQrTarget(variant)}>
            <QrCode className="size-4" />
            Tampilkan QR code
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditTarget(variant)}>
            <Pencil className="size-4" />
            {grouped ? 'Ubah subvarian' : 'Ubah varian'}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/inventory/activity?search=${encodeURIComponent(variant.sku)}`}>
              <ScrollText className="size-4" />
              Lihat aktivitas
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
            {grouped ? 'Hapus subvarian' : 'Hapus varian'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // The group ⋯ menu — shared by the table band row and the mobile group header.
  function renderGroupMenu(
    name: string,
    variants: ProductVariantItem[],
    triggerClassName?: string,
  ) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={triggerClassName}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Aksi grup</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setAddSubGroup(name)}>
            <Plus className="size-4" />
            Tambah subvarian
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() =>
              setDeleteTarget({
                variantIds: variants.map((variant) => variant.id),
                kind: 'variant',
                label: name,
              })
            }
          >
            <Trash2 className="size-4" />
            Hapus varian
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderVariantRow(variant: ProductVariantItem, grouped: boolean) {
    const connections = dedupeConnections(variant);
    return (
      <TableRow key={variant.id}>
        <TableCell className={grouped ? 'max-w-[220px] pl-10' : 'max-w-[220px]'}>
          <div className="flex items-center gap-3">
            <VariantImage
              productId={productId}
              variantId={variant.id}
              imageUrl={variant.imageUrl}
              label={formatVariantLabel(variant)}
            />
            <div className="min-w-0">
              <EllipsisTooltip text={variant.name} className="font-medium" />
              <EllipsisTooltip text={variant.sku} className="text-muted-foreground text-xs" />
            </div>
          </div>
        </TableCell>
        <TableCell className="num text-right">{formatCurrency(variant.price)}</TableCell>
        <TableCell className="text-right">
          <span className="num font-medium">{variant.availableStock}</span>
          {variant.isLowStock ? (
            <LowStockBadge threshold={variant.lowStockThreshold} className="ml-2" />
          ) : null}
        </TableCell>
        <TableCell className="max-w-[220px]">
          <ConnectionBadges connections={connections} />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onAdjustVariant(variant)}>
              <SlidersHorizontal className="size-4" />
              Sesuaikan
            </Button>
            {renderVariantMenu(variant, grouped)}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // Mobile (<sm) stand-in for a table row — the same data and actions, stacked.
  function renderVariantCard(variant: ProductVariantItem, grouped: boolean) {
    const connections = dedupeConnections(variant);
    return (
      <div key={variant.id} className="bg-card rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <VariantImage
            productId={productId}
            variantId={variant.id}
            imageUrl={variant.imageUrl}
            label={formatVariantLabel(variant)}
          />
          <div className="min-w-0 flex-1">
            <EllipsisTooltip text={variant.name} className="font-medium" />
            <EllipsisTooltip text={variant.sku} className="text-muted-foreground text-xs" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">
            Harga{' '}
            <span className="num text-foreground font-medium">{formatCurrency(variant.price)}</span>
          </span>
          <span className="text-muted-foreground">
            Tersedia{' '}
            <span className="num text-foreground font-medium">{variant.availableStock}</span>
          </span>
          {variant.isLowStock ? <LowStockBadge threshold={variant.lowStockThreshold} /> : null}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Koneksi</span>
          <ConnectionBadges connections={connections} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onAdjustVariant(variant)}>
            <SlidersHorizontal className="size-4" />
            Sesuaikan
          </Button>
          {renderVariantMenu(variant, grouped)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/products">
          <ArrowLeft className="size-4" />
          Kembali ke produk
        </Link>
      </Button>

      <div className="space-y-1">
        <p className="eyebrow text-primary">Katalog</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">{data.name}</h2>
          <Badge variant={data.isActive ? 'default' : 'secondary'}>
            {data.isActive ? 'Aktif' : 'Nonaktif'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Varian <span className="text-muted-foreground">· {data.variants.length}</span>
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Tambah varian
            </Button>
          </div>
          {data.variants.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Belum ada varian"
              description="Tambahkan varian untuk mulai melacak stok dan harga. Varian bisa berdiri sendiri atau menampung beberapa subvarian (mis. warna)."
              action={
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Tambah varian
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden rounded-xl border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Varian</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Tersedia</TableHead>
                      <TableHead>Koneksi</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variantBlocks.map((block) =>
                      block.kind === 'single' ? (
                        renderVariantRow(block.variant, false)
                      ) : (
                        <Fragment key={`group-${block.name}`}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={5} className="py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Layers className="text-muted-foreground size-3.5 shrink-0" />
                                  <EllipsisTooltip text={block.name} className="font-semibold" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground num text-xs">
                                    {block.variants.length}{' '}
                                    {block.variants.length === 1 ? 'subvarian' : 'subvarian'} ·{' '}
                                    {block.variants.reduce(
                                      (sum, variant) => sum + variant.availableStock,
                                      0,
                                    )}{' '}
                                    tersedia
                                  </span>
                                  {renderGroupMenu(block.name, block.variants, 'size-7')}
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

              <div className="space-y-4 sm:hidden">
                {variantBlocks.map((block) =>
                  block.kind === 'single' ? (
                    renderVariantCard(block.variant, false)
                  ) : (
                    <div key={`group-${block.name}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Layers className="text-muted-foreground size-3.5 shrink-0" />
                          <EllipsisTooltip text={block.name} className="text-sm font-semibold" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground num text-xs">
                            {block.variants.length} subvarian ·{' '}
                            {block.variants.reduce(
                              (sum, variant) => sum + variant.availableStock,
                              0,
                            )}{' '}
                            tersedia
                          </span>
                          {renderGroupMenu(block.name, block.variants)}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {block.variants.map((variant) => renderVariantCard(variant, true))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produk</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total tersedia</span>
                <span className="num font-medium">{totalAvailable}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Varian</span>
                <span className="num font-medium">{data.variants.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={data.isActive ? 'default' : 'secondary'}>
                  {data.isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              {data.category ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Kategori</span>
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
          name={formatVariantLabel(qrTarget)}
          sku={qrTarget.sku}
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
