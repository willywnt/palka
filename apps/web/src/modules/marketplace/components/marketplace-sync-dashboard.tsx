'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  useMarketplaceSyncJobsQuery,
  useMarketplaceSyncOverviewQuery,
  useRetrySyncJobMutation,
} from '../hooks/use-marketplace-sync';
import { useMarketplaceAccountsQuery } from '../hooks/use-marketplace-accounts';
import type { MarketplaceSyncJobListItemDto } from '../dto/sync.dto';
import { SyncJobDetailModal } from './sync-job-detail-modal';
import { SyncStatusBadge } from './sync-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function MarketplaceSyncDashboard() {
  const [accountId, setAccountId] = useState('');
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const accountsQuery = useMarketplaceAccountsQuery();
  const selectedAccountId = accountId || accountsQuery.data?.[0]?.id || '';

  const overviewQuery = useMarketplaceSyncOverviewQuery();
  const jobsQuery = useMarketplaceSyncJobsQuery({
    marketplaceAccountId: selectedAccountId || undefined,
  });
  const failedQuery = useMarketplaceSyncJobsQuery({ syncStatus: 'FAILED' });
  const retryingQuery = useMarketplaceSyncJobsQuery({ syncStatus: 'RETRYING' });

  const retryMutation = useRetrySyncJobMutation();

  async function handleRetry(jobId: string) {
    try {
      await retryMutation.mutateAsync(jobId);
      toast.success('Sync retry enqueued');
    } catch (error) {
      toast.error('Retry failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Monitor async stock sync jobs, failures, and provider health.
          </p>
          <Link href="/dashboard/marketplace" className="text-primary mt-1 inline-block text-sm">
            ← Back to store accounts
          </Link>
        </div>
        <select
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          value={selectedAccountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">All stores</option>
          {(accountsQuery.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.storeName} ({account.provider})
            </option>
          ))}
        </select>
      </div>

      {overviewQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Queue waiting" value={overviewQuery.data?.queueWaiting ?? 0} />
          <StatCard title="Failed jobs" value={overviewQuery.data?.failed ?? 0} />
          <StatCard title="Retrying" value={overviewQuery.data?.retrying ?? 0} />
          <StatCard title="Successful" value={overviewQuery.data?.success ?? 0} />
        </div>
      )}

      {overviewQuery.data?.providerHealth.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Provider health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overviewQuery.data.providerHealth.map((health) => (
              <div key={health.accountId} className="flex justify-between gap-4">
                <span>
                  {health.storeName} ({health.provider})
                </span>
                <span className="text-muted-foreground">
                  {health.consecutiveFailures > 0
                    ? `${health.consecutiveFailures} consecutive failures`
                    : health.averageLatencyMs
                      ? `~${health.averageLatencyMs}ms avg`
                      : 'Healthy'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="recent">
        <TabsList>
          <TabsTrigger value="recent">Recent syncs</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="retrying">Retrying</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-4">
          <SyncJobsTable
            items={jobsQuery.data?.items ?? []}
            isLoading={jobsQuery.isLoading}
            onInspect={setDetailJobId}
            onRetry={(id) => void handleRetry(id)}
            isRetrying={retryMutation.isPending}
          />
        </TabsContent>
        <TabsContent value="failed" className="mt-4">
          <SyncJobsTable
            items={failedQuery.data?.items ?? []}
            isLoading={failedQuery.isLoading}
            onInspect={setDetailJobId}
            onRetry={(id) => void handleRetry(id)}
            isRetrying={retryMutation.isPending}
          />
        </TabsContent>
        <TabsContent value="retrying" className="mt-4">
          <SyncJobsTable
            items={retryingQuery.data?.items ?? []}
            isLoading={retryingQuery.isLoading}
            onInspect={setDetailJobId}
            onRetry={(id) => void handleRetry(id)}
            isRetrying={retryMutation.isPending}
          />
        </TabsContent>
      </Tabs>

      <SyncJobDetailModal
        syncJobId={detailJobId}
        open={Boolean(detailJobId)}
        onOpenChange={(open) => {
          if (!open) setDetailJobId(null);
        }}
      />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function SyncJobsTable({
  items,
  isLoading,
  onInspect,
  onRetry,
  isRetrying,
}: {
  items: MarketplaceSyncJobListItemDto[];
  isLoading?: boolean;
  onInspect: (id: string) => void;
  onRetry: (id: string) => void;
  isRetrying?: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Internal SKU</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Error</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                No sync jobs yet. Stock changes on mapped SKUs will enqueue sync automatically.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.internalSku}</TableCell>
                <TableCell>{item.storeName}</TableCell>
                <TableCell>
                  <SyncStatusBadge status={item.syncStatus} />
                </TableCell>
                <TableCell>{item.attempts}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">
                  {item.errorMessage ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onInspect(item.id)}>
                      <Eye className="size-4" />
                      Inspect
                    </Button>
                    {(item.syncStatus === 'FAILED' || item.syncStatus === 'RETRYING') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isRetrying}
                        onClick={() => onRetry(item.id)}
                      >
                        <RefreshCw className="size-4" />
                        Retry
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
