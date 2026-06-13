'use client';

import { History } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { TablePagination } from '@/components/table-pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePagination } from '@/hooks/use-pagination';
import { formatDateTime } from '@/lib/formatters';
import { useAuditLogQuery } from '@/modules/users/hooks/use-team';

/** Human labels for the audit action codes the backend writes; raw code is the fallback. */
const ACTION_LABELS: Record<string, string> = {
  'sales.refunded': 'Refund penjualan',
  'sales.voided': 'Batalkan penjualan',
  'purchasing.cancelled': 'Batalkan pesanan beli',
  'catalog.product_deleted': 'Hapus produk',
  'catalog.variant_deleted': 'Hapus varian',
  'catalog.bundle_deleted': 'Hapus bundel',
  'inventory.adjusted': 'Sesuaikan stok',
  'inventory.damage_disposed': 'Buang stok rusak',
  'opname.completed': 'Selesaikan opname',
  'marketplace.connected': 'Sambungkan marketplace',
  'marketplace.disconnected': 'Putuskan marketplace',
  'team.invite.created': 'Buat undangan',
  'team.invite.revoked': 'Cabut undangan',
  'team.member.role_changed': 'Ubah peran anggota',
  'team.member.removed': 'Keluarkan anggota',
  'auth.login': 'Masuk',
};

function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** "Riwayat aktivitas" tab body — paginated audit log of org-level events. */
export function ActivitySettings() {
  const { page, setPage, pageSize, setPageSize } = usePagination(20);
  const { data, isLoading, error, refetch } = useAuditLogQuery(page, pageSize);

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat riwayat aktivitas"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Belum ada aktivitas tercatat"
        description="Tindakan penting di toko kamu — seperti hapus produk atau ubah peran — akan muncul di sini."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aktivitas</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead>Waktu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{labelForAction(item.action)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.actorName ?? 'Sistem'}
                </TableCell>
                <TableCell className="text-muted-foreground num text-sm">
                  {formatDateTime(item.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        page={data.meta.page}
        pageSize={pageSize}
        total={data.meta.total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
