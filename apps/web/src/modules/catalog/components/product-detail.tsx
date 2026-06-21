'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Layers,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  QrCode,
  Save,
  ScrollText,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import {
  useDeleteVariantsMutation,
  useMarkLabelsPrintedMutation,
  useProductQuery,
  useUpdateProductMutation,
  useUpdateVariantDetailsMutation,
} from '../hooks/use-products';
import type { ProductDetail as ProductDetailType, ProductVariantItem } from '../types';
import { formatCurrency } from '../utils/format';
import { buildVariantBlocks, formatVariantLabel } from '../utils/variants';
import type { UpdateProductInput } from '../validators/update-product';
import type { UpdateVariantDetailsInput } from '../validators/update-variant-details';
import { AddSubvariantsDialog } from './add-subvariants-dialog';
import { AddVariantDialog } from './add-variant-dialog';
import { ArchivedVariants } from './archived-variants';
import { ConnectionBadges } from './connection-badges';
import { DeleteVariantDialog } from './delete-variant-dialog';
import { EditVariantDialog } from './edit-variant-dialog';
import { VariantImage } from './variant-image';

const MAX_MONEY = 9_999_999_999;

type DraftVariant = { name: string; variantGroup: string; price: number; cost: number };
type Draft = {
  name: string;
  category: string;
  description: string;
  variants: Record<string, DraftVariant>;
};

function buildDraft(product: ProductDetailType): Draft {
  return {
    name: product.name,
    category: product.category ?? '',
    description: product.description ?? '',
    variants: Object.fromEntries(
      product.variants.map((variant) => [
        variant.id,
        {
          name: variant.name,
          variantGroup: variant.variantGroup ?? '',
          price: Number(variant.price),
          cost: variant.cost != null ? Number(variant.cost) : 0,
        },
      ]),
    ),
  };
}

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
  const { allowed: canDelete } = useHasPermission('catalog.delete');

  // Inline edit mode: the same layout, but editable fields become inputs.
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [snapshot, setSnapshot] = useState<string>('');
  const [confirm, setConfirm] = useState<'save' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);
  const updateProduct = useUpdateProductMutation(productId);
  const updateVariantDetails = useUpdateVariantDetailsMutation(productId);

  const dirty = draft !== null && JSON.stringify(draft) !== snapshot;

  function enterEdit(product: ProductDetailType) {
    const next = buildDraft(product);
    setDraft(next);
    setSnapshot(JSON.stringify(next));
    setEditMode(true);
  }

  function exitEdit() {
    setEditMode(false);
    setDraft(null);
    setConfirm(null);
  }

  function setVariantField<K extends keyof DraftVariant>(
    variantId: string,
    field: K,
    value: DraftVariant[K],
  ) {
    setDraft((current) => {
      if (!current) return current;
      const variant = current.variants[variantId];
      if (!variant) return current;
      return {
        ...current,
        variants: { ...current.variants, [variantId]: { ...variant, [field]: value } },
      };
    });
  }

  function setGroupName(variantIds: string[], value: string) {
    setDraft((current) => {
      if (!current) return current;
      const variants = { ...current.variants };
      for (const id of variantIds) {
        const variant = variants[id];
        if (variant) variants[id] = { ...variant, variantGroup: value };
      }
      return { ...current, variants };
    });
  }

  function validateDraft(): string | null {
    if (!draft) return 'Tidak ada data.';
    if (!draft.name.trim()) return 'Nama produk wajib diisi.';
    for (const variant of Object.values(draft.variants)) {
      if (!variant.name.trim()) return 'Nama varian wajib diisi.';
      if (variant.price < 0 || variant.price > MAX_MONEY) return 'Harga tidak valid.';
      if (variant.cost < 0 || variant.cost > MAX_MONEY) return 'Modal tidak valid.';
    }
    return null;
  }

  async function doSave(product: ProductDetailType) {
    if (!draft) return;
    setSaving(true);
    try {
      const productPatch: UpdateProductInput = {};
      if (draft.name.trim() !== product.name) productPatch.name = draft.name.trim();
      const category = draft.category.trim() || null;
      if (category !== (product.category ?? null)) productPatch.category = category;
      const description = draft.description.trim() || null;
      if (description !== (product.description ?? null)) productPatch.description = description;

      const updates: { variantId: string; input: UpdateVariantDetailsInput }[] = [];
      for (const variant of product.variants) {
        const edited = draft.variants[variant.id];
        if (!edited) continue;
        const input: UpdateVariantDetailsInput = {};
        if (edited.name.trim() !== variant.name) input.name = edited.name.trim();
        const group = edited.variantGroup.trim();
        if (group && group !== (variant.variantGroup ?? '')) input.variantGroup = group;
        if (edited.price !== Number(variant.price)) input.price = edited.price;
        const origCost = variant.cost != null ? Number(variant.cost) : 0;
        if (edited.cost !== origCost) input.cost = edited.cost;
        if (Object.keys(input).length > 0) updates.push({ variantId: variant.id, input });
      }

      if (Object.keys(productPatch).length === 0 && updates.length === 0) {
        toast('Tidak ada perubahan');
        exitEdit();
        return;
      }

      if (Object.keys(productPatch).length > 0) await updateProduct.mutateAsync(productPatch);
      for (const update of updates) await updateVariantDetails.mutateAsync(update);

      toast.success('Produk diperbarui', { description: `${updates.length} varian diubah.` });
      exitEdit();
    } catch (saveError) {
      toast.error('Gagal menyimpan', {
        description: saveError instanceof Error ? saveError.message : 'Terjadi kesalahan',
      });
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    const message = validateDraft();
    if (message) {
      toast.error('Periksa lagi', { description: message });
      return;
    }
    setConfirm('save');
  }

  function requestCancel() {
    if (dirty) setConfirm('discard');
    else exitEdit();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteVariants.mutateAsync(deleteTarget.variantIds);
      toast.success('Dihapus', {
        description: `${deleteTarget.variantIds.length} varian diarsipkan.`,
      });
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error('Gagal menghapus', {
        description: deleteError instanceof Error ? deleteError.message : 'Terjadi kesalahan',
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

  const product = data;
  const totalAvailable = product.variants.reduce((sum, variant) => sum + variant.availableStock, 0);
  const variantBlocks = buildVariantBlocks(product.variants);
  // Edit mode shows only editable columns (Varian | Harga | Modal); read-only adds
  // Tersedia | Koneksi | Aksi.
  const columnCount = editMode ? 3 : 6;

  function dedupeConnections(variant: ProductVariantItem) {
    return Array.from(
      new Map(variant.mappings.map((mapping) => [mapping.connectionId, mapping])).values(),
    );
  }

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
            <Settings2 className="size-4" />
            Ubah informasi
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/inventory/activity?search=${encodeURIComponent(variant.sku)}`}>
              <ScrollText className="size-4" />
              Lihat aktivitas
            </Link>
          </DropdownMenuItem>
          {canDelete ? (
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
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

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
          {canDelete ? (
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
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderVariantRow(variant: ProductVariantItem, grouped: boolean) {
    const connections = dedupeConnections(variant);
    const edited = draft?.variants[variant.id];

    return (
      <TableRow key={variant.id}>
        <TableCell className={grouped ? 'max-w-[260px] pl-10' : 'max-w-[260px]'}>
          <div className="flex items-center gap-3">
            <VariantImage
              productId={productId}
              variantId={variant.id}
              imageUrl={variant.imageUrl}
              label={formatVariantLabel(variant)}
            />
            <div className="min-w-0 flex-1">
              {editMode && edited ? (
                <Input
                  value={edited.name}
                  onChange={(event) => setVariantField(variant.id, 'name', event.target.value)}
                  className="h-8"
                  aria-label="Nama varian"
                />
              ) : (
                <EllipsisTooltip text={variant.name} className="font-medium" />
              )}
              <EllipsisTooltip text={variant.sku} className="text-muted-foreground text-xs" />
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {editMode && edited ? (
            <NumberInput
              value={edited.price}
              onChange={(value) => setVariantField(variant.id, 'price', value)}
              className="h-8 w-full text-right"
              aria-label="Harga"
            />
          ) : (
            <span className="num">{formatCurrency(variant.price)}</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {editMode && edited ? (
            <NumberInput
              value={edited.cost}
              onChange={(value) => setVariantField(variant.id, 'cost', value)}
              className="h-8 w-full text-right"
              aria-label="Modal"
            />
          ) : (
            <span className="num text-muted-foreground">
              {variant.cost != null ? formatCurrency(variant.cost) : '—'}
            </span>
          )}
        </TableCell>
        {!editMode ? (
          <>
            <TableCell className="text-right">
              <span className="num font-medium">{variant.availableStock}</span>
              {variant.isLowStock ? (
                <LowStockBadge threshold={variant.lowStockThreshold} className="ml-2" />
              ) : null}
            </TableCell>
            <TableCell className="max-w-[200px]">
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
          </>
        ) : null}
      </TableRow>
    );
  }

  function renderVariantCard(variant: ProductVariantItem, grouped: boolean) {
    const connections = dedupeConnections(variant);
    const edited = draft?.variants[variant.id];

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
            {editMode && edited ? (
              <Input
                value={edited.name}
                onChange={(event) => setVariantField(variant.id, 'name', event.target.value)}
                className="h-8"
                aria-label="Nama varian"
              />
            ) : (
              <EllipsisTooltip text={variant.name} className="font-medium" />
            )}
            <EllipsisTooltip text={variant.sku} className="text-muted-foreground text-xs" />
          </div>
        </div>
        {editMode && edited ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Harga</span>
              <NumberInput
                value={edited.price}
                onChange={(value) => setVariantField(variant.id, 'price', value)}
                className="h-8"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Modal</span>
              <NumberInput
                value={edited.cost}
                onChange={(value) => setVariantField(variant.id, 'cost', value)}
                className="h-8"
              />
            </label>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">
              Harga{' '}
              <span className="num text-foreground font-medium">
                {formatCurrency(variant.price)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Modal{' '}
              <span className="num text-foreground font-medium">
                {variant.cost != null ? formatCurrency(variant.cost) : '—'}
              </span>
            </span>
            <span className="text-muted-foreground">
              Tersedia{' '}
              <span className="num text-foreground font-medium">{variant.availableStock}</span>
            </span>
            {variant.isLowStock ? <LowStockBadge threshold={variant.lowStockThreshold} /> : null}
          </div>
        )}
        {!editMode ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Koneksi</span>
            <ConnectionBadges connections={connections} />
          </div>
        ) : null}
        {!editMode ? (
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onAdjustVariant(variant)}>
              <SlidersHorizontal className="size-4" />
              Sesuaikan
            </Button>
            {renderVariantMenu(variant, grouped)}
          </div>
        ) : null}
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
          {editMode && draft ? (
            <Input
              value={draft.name}
              onChange={(event) => setDraft((d) => (d ? { ...d, name: event.target.value } : d))}
              className="h-10 max-w-md text-lg font-semibold"
              aria-label="Nama produk"
            />
          ) : (
            <h2 className="text-2xl font-semibold tracking-tight text-balance">{product.name}</h2>
          )}
          <Badge variant={product.isActive ? 'default' : 'secondary'}>
            {product.isActive ? 'Aktif' : 'Nonaktif'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Varian <span className="text-muted-foreground">· {product.variants.length}</span>
            </p>
            {editMode ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={requestCancel} disabled={saving}>
                  Batal
                </Button>
                <Button size="sm" onClick={requestSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => enterEdit(product)}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Tambah varian
                </Button>
              </div>
            )}
          </div>
          {product.variants.length === 0 ? (
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
                      <TableHead className="text-right">Modal</TableHead>
                      {!editMode ? <TableHead className="text-right">Tersedia</TableHead> : null}
                      {!editMode ? <TableHead>Koneksi</TableHead> : null}
                      {!editMode ? <TableHead className="text-right">Aksi</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variantBlocks.map((block) =>
                      block.kind === 'single' ? (
                        renderVariantRow(block.variant, false)
                      ) : (
                        <Fragment key={`group-${block.name}`}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={columnCount} className="py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Layers className="text-muted-foreground size-3.5 shrink-0" />
                                  {editMode && block.variants[0] ? (
                                    <Input
                                      value={
                                        draft?.variants[block.variants[0].id]?.variantGroup ?? ''
                                      }
                                      onChange={(event) =>
                                        setGroupName(
                                          block.variants.map((variant) => variant.id),
                                          event.target.value,
                                        )
                                      }
                                      className="h-8 w-[300px] font-medium"
                                      aria-label="Nama grup"
                                    />
                                  ) : (
                                    <EllipsisTooltip text={block.name} className="font-semibold" />
                                  )}
                                </div>
                                {!editMode ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground num text-xs">
                                      {block.variants.length} subvarian ·{' '}
                                      {block.variants.reduce(
                                        (sum, variant) => sum + variant.availableStock,
                                        0,
                                      )}{' '}
                                      tersedia
                                    </span>
                                    {renderGroupMenu(block.name, block.variants, 'size-7')}
                                  </div>
                                ) : null}
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
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Layers className="text-muted-foreground size-3.5 shrink-0" />
                          {editMode && block.variants[0] ? (
                            <Input
                              value={draft?.variants[block.variants[0].id]?.variantGroup ?? ''}
                              onChange={(event) =>
                                setGroupName(
                                  block.variants.map((variant) => variant.id),
                                  event.target.value,
                                )
                              }
                              className="h-8 font-medium"
                              aria-label="Nama grup"
                            />
                          ) : (
                            <EllipsisTooltip text={block.name} className="text-sm font-semibold" />
                          )}
                        </div>
                        {!editMode ? (
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
                        ) : null}
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

          {!editMode ? <ArchivedVariants productId={productId} /> : null}
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
                <span className="num font-medium">{product.variants.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={product.isActive ? 'default' : 'secondary'}>
                  {product.isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              {editMode && draft ? (
                <div className="space-y-3 border-t pt-3">
                  <label className="block space-y-1">
                    <span className="text-muted-foreground text-xs">Kategori</span>
                    <Input
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((d) => (d ? { ...d, category: event.target.value } : d))
                      }
                      placeholder="Apparel"
                      className="h-8"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-muted-foreground text-xs">Deskripsi</span>
                    <Textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((d) => (d ? { ...d, description: event.target.value } : d))
                      }
                      rows={3}
                      placeholder="Deskripsi singkat"
                    />
                  </label>
                </div>
              ) : (
                <>
                  {product.category ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Kategori</span>
                      <span className="truncate text-right font-medium">{product.category}</span>
                    </div>
                  ) : null}
                  {product.description ? (
                    <p className="text-muted-foreground border-t pt-3">{product.description}</p>
                  ) : null}
                </>
              )}
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

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'discard' ? 'Buang perubahan?' : 'Simpan perubahan?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'discard'
                ? 'Perubahan yang belum disimpan akan hilang.'
                : 'Perubahan akan langsung diterapkan ke produk dan variannya.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirm === 'discard' && 'bg-destructive hover:bg-destructive/90 text-white',
              )}
              onClick={() => {
                const mode = confirm;
                setConfirm(null);
                if (mode === 'discard') exitEdit();
                else void doSave(product);
              }}
            >
              {confirm === 'discard' ? 'Ya, buang' : 'Ya, simpan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
