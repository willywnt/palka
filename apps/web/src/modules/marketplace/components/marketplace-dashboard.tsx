'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldAlert, ShieldCheck, ShoppingBag, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatCard } from '@/components/stat-card';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import type { MarketplaceConnectionHealth, MarketplaceConnectionListItem } from '../types';
import {
  useDisconnectMarketplaceMutation,
  useMarketplaceConnectionsQuery,
} from '../hooks/use-marketplace-connections';
import { useMarketplaceHealthQuery } from '../hooks/use-marketplace-health';
import { AddMarketplaceModal } from './add-marketplace-modal';
import { DisconnectMarketplaceDialog } from './disconnect-marketplace-dialog';
import { MarketplaceTable } from './marketplace-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketplaceDashboard() {
  const [addOpen, setAddOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<MarketplaceConnectionListItem | null>(
    null,
  );

  const { data, isLoading, error, refetch } = useMarketplaceConnectionsQuery();
  const healthQuery = useMarketplaceHealthQuery();
  const disconnectMutation = useDisconnectMarketplaceMutation();
  const { allowed: canManage } = useHasPermission('marketplace.manage');

  const healthMap = useMemo(
    () =>
      new Map<string, MarketplaceConnectionHealth>(
        (healthQuery.data ?? []).map((item) => [item.connectionId, item]),
      ),
    [healthQuery.data],
  );
  const healthCounts = useMemo(() => {
    const counts = { ok: 0, warn: 0, danger: 0 };
    for (const item of healthQuery.data ?? []) counts[item.tone] += 1;
    return counts;
  }, [healthQuery.data]);

  // A provider OAuth callback redirects back here with ?lazada|?shopee=connected|error — toast
  // once, then strip the param so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providers: { key: string; label: string }[] = [
      { key: 'lazada', label: 'Lazada' },
      { key: 'shopee', label: 'Shopee' },
      { key: 'tokopedia', label: 'Tokopedia' },
    ];
    const hit = providers.find((provider) => params.get(provider.key));
    if (!hit) return;

    if (params.get(hit.key) === 'connected') {
      toast.success(`${hit.label} terhubung`, {
        description: 'Toko berhasil dihubungkan via OAuth.',
      });
    } else {
      const reason = params.get('reason');
      toast.error(`Gagal menghubungkan ${hit.label}`, {
        description: reason ? reason : `Coba ulangi, atau cek izin & token di ${hit.label}.`,
      });
    }

    params.delete(hit.key);
    params.delete('reason');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  async function handleDisconnectConfirm() {
    if (!disconnectTarget) return;

    try {
      await disconnectMutation.mutateAsync(disconnectTarget.id);
      toast.success('Koneksi marketplace diputus', {
        description: `${disconnectTarget.shopName} sudah dinonaktifkan.`,
      });
      setDisconnectTarget(null);
    } catch (disconnectError) {
      toast.error('Gagal memutuskan koneksi', {
        description:
          disconnectError instanceof Error ? disconnectError.message : 'Terjadi kesalahan',
      });
    }
  }

  const activeCount = data?.filter((item) => item.isActive).length ?? 0;
  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {isLoading ? (
              'Memuat toko terhubung...'
            ) : error ? (
              'Toko marketplace yang terhubung'
            ) : (
              <>
                <span className="num">{activeCount}</span> toko aktif ·{' '}
                <span className="num">{data?.length ?? 0}</span> total
              </>
            )}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Hubungkan toko
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Gagal memuat koneksi marketplace"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={ShoppingBag}
          title="Belum ada toko marketplace terhubung"
          description="Hubungkan toko Lazada kamu biar stok dan pesanannya tersinkron otomatis — Shopee & Tokopedia menyusul."
        />
      ) : (
        <>
          {healthQuery.data && healthQuery.data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Channel sehat"
                value={healthCounts.ok}
                icon={ShieldCheck}
                tone="emerald"
              />
              <StatCard
                label="Perlu perhatian"
                value={healthCounts.warn}
                icon={TriangleAlert}
                tone="amber"
                accentClassName={healthCounts.warn > 0 ? 'text-status-warn' : undefined}
              />
              <StatCard
                label="Bermasalah"
                value={healthCounts.danger}
                icon={ShieldAlert}
                tone="rose"
                accentClassName={healthCounts.danger > 0 ? 'text-destructive' : undefined}
              />
            </div>
          ) : null}
          <MarketplaceTable
            connections={data ?? []}
            health={healthMap}
            onDisconnect={setDisconnectTarget}
            isDisconnecting={disconnectMutation.isPending}
          />
        </>
      )}

      <AddMarketplaceModal open={addOpen} onOpenChange={setAddOpen} />

      <DisconnectMarketplaceDialog
        connection={disconnectTarget}
        open={Boolean(disconnectTarget)}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        onConfirm={() => void handleDisconnectConfirm()}
        isDisconnecting={disconnectMutation.isPending}
      />
    </div>
  );
}
