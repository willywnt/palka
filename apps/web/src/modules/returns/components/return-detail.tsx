'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PackageCheck, Video, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReturnDisposition } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImageThumb } from '@/components/image-thumb';
import { formatDateTime } from '@/lib/formatters';

import { ShareEvidenceControl } from '@/modules/recordings/components/share-evidence-control';
import { useRecordingsByResiQuery } from '@/modules/recordings/hooks/use-recordings-management';

import {
  useProcessReturnMutation,
  useRejectReturnMutation,
  useReturnQuery,
} from '../hooks/use-returns';
import { ReturnStatusBadge } from './return-status-badge';

function dispositionLabel(disposition: ReturnDisposition | null): string {
  if (disposition === 'RESTOCK') return 'Direstok';
  if (disposition === 'DAMAGED') return 'Rusak';
  return '—';
}

export function ReturnDetail({ returnId }: { returnId: string }) {
  const { data, isLoading, error } = useReturnQuery(returnId);
  const processMutation = useProcessReturnMutation(returnId);
  const rejectMutation = useRejectReturnMutation(returnId);
  const { data: packingVideos } = useRecordingsByResiQuery(data?.noResi ?? null);
  // returnItemId → resellable? (true = RESTOCK, false = DAMAGED). Defaults to restock.
  const [resellable, setResellable] = useState<Record<string, boolean>>({});

  const isPending = data?.status === 'PENDING';
  const busy = processMutation.isPending || rejectMutation.isPending;

  async function handleProcess() {
    if (!data) return;
    const lines = data.items.map((item) => {
      const disposition: ReturnDisposition = (resellable[item.id] ?? true) ? 'RESTOCK' : 'DAMAGED';
      return { returnItemId: item.id, disposition };
    });
    try {
      await processMutation.mutateAsync({ lines });
      toast.success('Retur diproses', { description: 'Stok sudah diperbarui.' });
    } catch (err) {
      toast.error('Gagal memproses retur', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
      });
    }
  }

  async function handleReject() {
    try {
      await rejectMutation.mutateAsync();
      toast.success('Retur ditolak', { description: 'Ditutup tanpa restok.' });
    } catch (err) {
      toast.error('Gagal menolak retur', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
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
          <Link href="/dashboard/returns">
            <ArrowLeft className="size-4" />
            Kembali ke retur
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Retur tidak ditemukan.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/returns">
          <ArrowLeft className="size-4" />
          Kembali ke retur
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Retur · {data.externalOrderId}</h2>
        <ReturnStatusBadge status={data.status} />
        {data.autoDetected ? <Badge variant="outline">Terdeteksi otomatis</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm font-medium">
            Item <span className="text-muted-foreground">· {data.items.length}</span>
          </p>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">
                    {isPending ? 'Bisa dijual lagi?' : 'Penanganan'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ImageThumb src={item.imageUrl} alt={item.externalName} />
                        <div className="min-w-0">
                          <div className="font-medium">{item.externalName}</div>
                          <div className="text-muted-foreground text-xs">
                            {item.sku ? `${item.sku}` : 'belum dikaitkan'}
                            {item.productName ? ` · ${item.productName}` : ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {isPending ? (
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={resellable[item.id] ?? true}
                            onCheckedChange={(on) =>
                              setResellable((prev) => ({ ...prev, [item.id]: on }))
                            }
                            aria-label={`Restok ${item.externalName}`}
                          />
                          <span className="text-muted-foreground text-xs">
                            {(resellable[item.id] ?? true) ? 'Restok' : 'Rusak'}
                          </span>
                        </div>
                      ) : (
                        <Badge variant={item.disposition === 'RESTOCK' ? 'secondary' : 'outline'}>
                          {dispositionLabel(item.disposition)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {isPending ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleProcess()} disabled={busy}>
                <PackageCheck className="size-4" />
                {processMutation.isPending ? 'Memproses...' : 'Terima & update stok'}
              </Button>
              <Button variant="outline" onClick={() => void handleReject()} disabled={busy}>
                <XCircle className="size-4" />
                Tolak
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bukti video packing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">No. resi</span>
                <span className="truncate text-right font-medium">{data.noResi ?? '—'}</span>
              </div>
              {data.noResi ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    {packingVideos && packingVideos.length > 0
                      ? `${packingVideos.length} video packing untuk resi ini.`
                      : 'Tidak ada video packing untuk resi ini.'}
                  </p>
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href={`/dashboard/recordings?search=${encodeURIComponent(data.noResi)}`}>
                      <Video className="size-4" />
                      Lihat video packing
                    </Link>
                  </Button>
                  <ShareEvidenceControl recordings={packingVideos ?? []} />
                </>
              ) : (
                <p className="text-muted-foreground text-xs">Pesanan ini tidak punya no. resi.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pesanan</span>
                <Link
                  href={`/dashboard/orders/${data.orderId}`}
                  className="truncate text-right font-medium hover:underline"
                >
                  {data.externalOrderId}
                </Link>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Toko</span>
                <span className="truncate text-right font-medium">{data.shopName}</span>
              </div>
              {data.reason ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Alasan</span>
                  <span className="truncate text-right font-medium">{data.reason}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Dibuka</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.createdAt)}
                </span>
              </div>
              {data.processedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Diproses</span>
                  <span className="text-right font-medium" suppressHydrationWarning>
                    {formatDateTime(data.processedAt)}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
