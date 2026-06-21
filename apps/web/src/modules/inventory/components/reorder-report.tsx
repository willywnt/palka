'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { CalendarRange, Info, PackageSearch, PackageX, ShoppingCart, Truck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { ImageThumb } from '@/components/image-thumb';
import { GullArt } from '@/components/maritime-art';
import { StatCard } from '@/components/stat-card';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import { REORDER_DEFAULTS } from '../config';
import { useReorderReportQuery } from '../hooks/use-inventory';
import { reorderStatusDisplay } from '../utils/reorder-display';
import type { ReorderItem } from '../types';

const WINDOW_OPTIONS = [7, 30, 90] as const;

const URL_DEFAULTS = {
  window: String(REORDER_DEFAULTS.windowDays),
  reorderOnly: '',
};

/** Defensive int parse for the URL param — anything off-menu falls back to the default window. */
function parseWindowDays(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return (WINDOW_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : REORDER_DEFAULTS.windowDays;
}

/** A right-aligned column header with an info icon explaining the metric. */
function HeadWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1">
          {label}
          <Info className="text-muted-foreground size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

function formatVelocity(value: number): string {
  return value > 0 ? `${value.toFixed(1)}/hari` : '—';
}

function formatDaysOfCover(value: number | null): string {
  if (value === null) return 'Tidak terjual';
  return `${Math.round(value)} hari`;
}

/** Skeleton fallback matching the report rhythm: 3 stat cards + table rows. */
function ReorderReportFallback() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

/** The URL-filter hook reads `useSearchParams`, so the report brings its own Suspense boundary. */
export function ReorderReport() {
  return (
    <Suspense fallback={<ReorderReportFallback />}>
      <ReorderReportContent />
    </Suspense>
  );
}

function ReorderReportContent() {
  // Window + filter live in the URL so a filtered view is shareable.
  const [filters, setFilters] = useUrlFilters(URL_DEFAULTS);
  const windowDays = parseWindowDays(filters.window);
  const reorderOnly = filters.reorderOnly === '1';
  const { allowed: canPurchase } = useHasPermission('purchasing.view');

  const { data, isLoading, error, refetch } = useReorderReportQuery({
    windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });

  const allItems = data?.items ?? [];
  const items = reorderOnly
    ? allItems.filter((item) => item.status === 'URGENT' || item.status === 'SOON')
    : allItems;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Perlu restok"
            value={data.summary.reorderCount}
            icon={ShoppingCart}
            tone="amber"
            accentClassName={data.summary.reorderCount > 0 ? 'text-status-warn' : undefined}
            hint={`${data.summary.urgentCount} mendesak`}
          />
          <StatCard
            label="Stok mati"
            value={data.summary.deadStockCount}
            icon={PackageX}
            tone="rose"
            hint={`${formatCurrency(data.summary.deadStockValue)} mengendap`}
          />
          <StatCard
            label="Periode penjualan"
            value={`${data.summary.windowDays}h`}
            icon={CalendarRange}
            tone="violet"
            hint={`Lead time ${data.summary.leadTimeDays}h · target ketahanan ${data.summary.targetCoverDays}h`}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-sm">Periode</span>
          {WINDOW_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={windowDays === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ window: String(option) })}
            >
              {option} hari
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="needs-reorder-only"
              checked={reorderOnly}
              onCheckedChange={(checked) => setFilters({ reorderOnly: checked ? '1' : '' })}
            />
            <Label htmlFor="needs-reorder-only" className="text-sm font-normal">
              Hanya yang perlu restok
            </Label>
          </div>
          {canPurchase ? (
            <Button size="sm" asChild>
              <Link href="/dashboard/purchasing/new">
                <Truck className="size-4" />
                Buat pembelian
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat laporan restok" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={reorderOnly ? undefined : PackageSearch}
          art={reorderOnly ? <GullArt /> : undefined}
          title={reorderOnly ? 'Stok aman' : 'Tidak ada yang ditampilkan'}
          description={
            reorderOnly
              ? 'Tidak ada varian yang perlu direstok sekarang.'
              : 'Tambah produk dan catat beberapa penjualan untuk melihat saran restok.'
          }
          action={
            !reorderOnly ? (
              <Button asChild>
                <Link href="/dashboard/products">Tambah produk</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Varian</TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Kecepatan jual"
                    hint="Rata-rata unit terjual per hari selama periode penjualan yang dipilih."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Ketahanan"
                    hint="Berapa hari stok kamu saat ini akan bertahan pada kecepatan jual sekarang."
                  />
                </TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Lead time"
                    hint="Jumlah hari sampai restok datang setelah kamu memesan ulang."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="MOQ"
                    hint="Minimum order quantity: jumlah paling sedikit yang mau diterima supplier per pesanan."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Restok"
                    hint="Saran jumlah yang dibeli: cukup buat nutup lead time plus target hari ketahanan, dan minimal sesuai MOQ supplier."
                  />
                </TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <ReorderRow key={item.variantId} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ReorderRow({ item }: { item: ReorderItem }) {
  const status = reorderStatusDisplay(item.status);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <ImageThumb src={item.imageUrl} alt={item.variantName} />
          <div className="min-w-0">
            <Link
              href={`/dashboard/products/${item.productId}`}
              className="font-medium hover:underline"
            >
              {item.productName}
            </Link>
            <div className="text-muted-foreground text-xs">
              {item.variantName} · {item.sku}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground num text-right text-sm">
        {formatVelocity(item.dailyVelocity)}
      </TableCell>
      <TableCell className="num text-right">{formatDaysOfCover(item.daysOfCover)}</TableCell>
      <TableCell className="num text-right">
        <span className={cn('font-medium', item.availableStock <= 0 && 'text-destructive')}>
          {item.availableStock}
        </span>
        {item.incomingStock > 0 ? (
          <div className="text-muted-foreground text-xs">+{item.incomingStock} akan datang</div>
        ) : null}
      </TableCell>
      <TableCell className="num text-right">{item.leadTimeDays}h</TableCell>
      <TableCell className="num text-right">
        {item.minOrderQty ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="num text-right">
        {item.suggestedReorderQty > 0 ? (
          <span className="text-foreground inline-flex items-center gap-1 font-semibold">
            <ShoppingCart className="size-3.5" />
            {item.suggestedReorderQty}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Badge className={status.className}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
}
