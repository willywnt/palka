'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  ClipboardCheck,
  Minus,
  Plus,
  Scale,
  Trash2,
  XCircle,
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
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { formatProductVariantLabel } from '@/lib/variant-label';

import { OpnameAddItem } from './opname-add-item';
import {
  useCancelOpnameMutation,
  useCompleteOpnameMutation,
  useRemoveOpnameItemMutation,
  useStockOpnameQuery,
  useUpsertOpnameItemMutation,
} from '../hooks/use-stock-opname';
import { OPNAME_STATUS_META } from '../utils/opname-display';
import type { StockOpnameDetail as StockOpnameData, StockOpnameItemDetail } from '../types';

function formatVariance(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function varianceClass(value: number): string {
  if (value < 0) return 'text-signed-down';
  if (value > 0) return 'text-status-ok';
  return 'text-muted-foreground';
}

export function OpnameDetail({ opnameId }: { opnameId: string }) {
  const { data, isLoading, error, refetch } = useStockOpnameQuery(opnameId);

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat opname"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) return <OpnameDetailSkeleton />;

  return <OpnameContent data={data} />;
}

function OpnameContent({ data }: { data: StockOpnameData }) {
  const router = useRouter();
  const completeMutation = useCompleteOpnameMutation(data.id);
  const cancelMutation = useCancelOpnameMutation(data.id);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const meta = OPNAME_STATUS_META[data.status];
  const isDraft = data.status === 'DRAFT';
  const countedVariantIds = new Set(data.items.map((item) => item.variantId));
  const busy = completeMutation.isPending || cancelMutation.isPending;

  async function handlePost() {
    try {
      const result = await completeMutation.mutateAsync();
      toast.success(`Opname ${result.code} diposting`, {
        description: `${result.summary.varianceItemCount} item disesuaikan`,
      });
      setConfirmPost(false);
    } catch (err) {
      toast.error('Gagal posting opname', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync();
      toast.success('Opname dibatalkan');
      setConfirmCancel(false);
      router.push('/dashboard/inventory/opname');
    } catch (err) {
      toast.error('Gagal membatalkan opname', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/dashboard/inventory/opname"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" />
            Semua opname
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="num text-2xl font-semibold">{data.code}</h1>
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          </div>
          <p className="text-muted-foreground text-sm">
            Mulai {formatDateTime(data.startedAt)}
            {data.completedAt ? ` · Selesai ${formatDateTime(data.completedAt)}` : ''}
          </p>
          {data.note ? <p className="text-sm">{data.note}</p> : null}
        </div>

        {isDraft ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={busy}>
              <XCircle className="size-4" />
              Batalkan
            </Button>
            <Button onClick={() => setConfirmPost(true)} disabled={busy || data.items.length === 0}>
              <ClipboardCheck className="size-4" />
              Posting
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Item dihitung"
          value={data.summary.itemCount.toLocaleString()}
          icon={Boxes}
          tone="sky"
        />
        <StatCard
          label="Ada selisih"
          value={data.summary.varianceItemCount.toLocaleString()}
          icon={Scale}
          tone="amber"
          accentClassName={data.summary.varianceItemCount > 0 ? 'text-status-warn' : undefined}
        />
        <StatCard
          label="Kurang (shrinkage)"
          value={data.summary.shortageUnits.toLocaleString()}
          icon={Minus}
          tone="rose"
          accentClassName={data.summary.shortageUnits > 0 ? 'text-signed-down' : undefined}
          hint="Total unit yang hilang dari sistem"
        />
        <StatCard
          label="Lebih (surplus)"
          value={data.summary.surplusUnits.toLocaleString()}
          icon={Plus}
          tone="emerald"
          hint="Total unit yang lebih dari sistem"
        />
      </div>

      {isDraft ? <OpnameAddItem opnameId={data.id} countedVariantIds={countedVariantIds} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isDraft ? 'Hitungan' : 'Hasil opname'}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Belum ada item"
              description="Tambahkan produk lewat scan atau pencarian di atas buat mulai menghitung."
            />
          ) : (
            <OpnameItemsTable opnameId={data.id} items={data.items} editable={isDraft} />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmPost} onOpenChange={setConfirmPost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Posting opname {data.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.summary.varianceItemCount > 0
                ? `${data.summary.varianceItemCount} item bakal disesuaikan stoknya (kurang ${data.summary.shortageUnits}, lebih ${data.summary.surplusUnits}). Tindakan ini langsung mengubah stok dan nggak bisa dibatalkan.`
                : 'Nggak ada selisih — stok nggak berubah. Opname tetap akan ditutup sebagai selesai.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handlePost()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? 'Memposting...' : 'Posting sekarang'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan opname {data.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sesi hitungan ini akan dibatalkan dan nggak bisa dilanjutkan lagi. Stok nggak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleCancel()}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? 'Membatalkan...' : 'Batalkan opname'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OpnameItemsTable({
  opnameId,
  items,
  editable,
}: {
  opnameId: string;
  items: StockOpnameItemDetail[];
  editable: boolean;
}) {
  return (
    <>
      {/* Cards on phones, table on sm+. */}
      <ul className="space-y-3 sm:hidden">
        {items.map((item) => (
          <OpnameItemCard key={item.id} opnameId={opnameId} item={item} editable={editable} />
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Sistem</TableHead>
              <TableHead className="text-right">Dihitung</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
              {editable ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <OpnameItemRow key={item.id} opnameId={opnameId} item={item} editable={editable} />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function useCountedField(opnameId: string, item: StockOpnameItemDetail) {
  const [counted, setCounted] = useState(item.countedQuantity);
  const upsert = useUpsertOpnameItemMutation(opnameId);

  function commit() {
    if (counted === item.countedQuantity) return;
    upsert.mutate(
      { variantId: item.variantId, countedQuantity: counted },
      {
        onError: (err) => {
          setCounted(item.countedQuantity);
          toast.error('Gagal menyimpan hitungan', {
            description: err instanceof Error ? err.message : 'Terjadi kesalahan',
          });
        },
      },
    );
  }

  return { counted, setCounted, commit };
}

function OpnameItemRow({
  opnameId,
  item,
  editable,
}: {
  opnameId: string;
  item: StockOpnameItemDetail;
  editable: boolean;
}) {
  const { counted, setCounted, commit } = useCountedField(opnameId, item);
  const remove = useRemoveOpnameItemMutation(opnameId);
  // While editing, show the live variance from the field; the row's stored value once posted.
  const variance = editable ? counted - item.systemQuantity : item.variance;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{formatProductVariantLabel(item.productName, item)}</div>
        <div className="text-muted-foreground text-xs">{item.sku}</div>
      </TableCell>
      <TableCell className="num text-right">{item.systemQuantity}</TableCell>
      <TableCell className="text-right">
        {editable ? (
          <div className="ml-auto w-20">
            <NumberInput
              value={counted}
              onChange={setCounted}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="text-right"
              aria-label={`Jumlah dihitung untuk ${item.sku}`}
            />
          </div>
        ) : (
          <span className="num">{item.countedQuantity}</span>
        )}
      </TableCell>
      <TableCell className={cn('num text-right font-medium', varianceClass(variance))}>
        {formatVariance(variance)}
      </TableCell>
      {editable ? (
        <TableCell className="text-right">
          <Button
            size="icon"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id)}
            aria-label={`Hapus ${item.sku}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function OpnameItemCard({
  opnameId,
  item,
  editable,
}: {
  opnameId: string;
  item: StockOpnameItemDetail;
  editable: boolean;
}) {
  const { counted, setCounted, commit } = useCountedField(opnameId, item);
  const remove = useRemoveOpnameItemMutation(opnameId);
  const variance = editable ? counted - item.systemQuantity : item.variance;

  return (
    <li className="border-border/70 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{formatProductVariantLabel(item.productName, item)}</div>
          <div className="text-muted-foreground text-xs">{item.sku}</div>
        </div>
        {editable ? (
          <Button
            size="icon"
            variant="ghost"
            className="-mt-1 -mr-1"
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id)}
            aria-label={`Hapus ${item.sku}`}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-muted-foreground text-xs">Sistem</div>
          <div className="num">{item.systemQuantity}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Dihitung</div>
          {editable ? (
            <div className="w-20">
              <NumberInput
                value={counted}
                onChange={setCounted}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className="text-right"
                aria-label={`Jumlah dihitung untuk ${item.sku}`}
              />
            </div>
          ) : (
            <div className="num">{item.countedQuantity}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">Selisih</div>
          <div className={cn('num font-medium', varianceClass(variance))}>
            {formatVariance(variance)}
          </div>
        </div>
      </div>
    </li>
  );
}

function OpnameDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
