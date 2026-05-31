'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { MarketplaceAccountListItemDto } from '../dto/marketplace.dto';
import {
  useDisconnectMarketplaceAccountMutation,
  useMarketplaceAccountsQuery,
} from '../hooks/use-marketplace-accounts';
import { fetchMarketplaceOAuthStatus } from '../hooks/use-marketplace-oauth';
import { AddMarketplaceModal } from './add-marketplace-modal';
import { DisconnectMarketplaceDialog } from './disconnect-marketplace-dialog';
import { MarketplaceEmptyState } from './marketplace-empty-state';
import { MarketplaceTable } from './marketplace-table';
import { ReconnectMarketplaceModal } from './reconnect-marketplace-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketplaceDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [addOpen, setAddOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<MarketplaceAccountListItemDto | null>(
    null,
  );
  const [reconnectTarget, setReconnectTarget] = useState<MarketplaceAccountListItemDto | null>(
    null,
  );

  const { data, isLoading, error } = useMarketplaceAccountsQuery();
  const oauthStatusQuery = useQuery({
    queryKey: ['marketplace-oauth-status'],
    queryFn: fetchMarketplaceOAuthStatus,
  });
  const disconnectMutation = useDisconnectMarketplaceAccountMutation();

  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (!oauthResult) return;

    const store = searchParams.get('store');
    const message = searchParams.get('message');

    if (oauthResult === 'connected' || oauthResult === 'reconnected') {
      toast.success(oauthResult === 'reconnected' ? 'Store reconnected' : 'Store connected', {
        description: store ? `${store} is ready for future sync workflows.` : undefined,
      });
    } else if (oauthResult === 'error') {
      toast.error('OAuth connection failed', {
        description: message ?? 'Authorization was not completed.',
      });
    }

    router.replace('/dashboard/marketplace');
  }, [router, searchParams]);

  async function handleDisconnectConfirm() {
    if (!disconnectTarget) return;

    try {
      await disconnectMutation.mutateAsync(disconnectTarget.id);
      toast.success('Store disconnected', {
        description: `${disconnectTarget.storeName} is no longer connected.`,
      });
      setDisconnectTarget(null);
    } catch (disconnectError) {
      toast.error('Disconnect failed', {
        description: disconnectError instanceof Error ? disconnectError.message : 'Unknown error',
      });
    }
  }

  const connectedCount = data?.filter((item) => item.status === 'CONNECTED').length ?? 0;
  const needsAttentionCount = data?.filter((item) => item.health.requiresReconnect).length ?? 0;
  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? 'Loading connected stores...'
              : `${connectedCount} connected · ${needsAttentionCount} need attention · ${data?.length ?? 0} total`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Connect store
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/marketplace/mappings">SKU mapping</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/marketplace/sync">Stock sync</Link>
        </Button>
      </div>

      {!isLoading && needsAttentionCount > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stores need attention</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {needsAttentionCount} store{needsAttentionCount === 1 ? '' : 's'} have expired tokens or
            require reconnection. Use OAuth reconnect when available, or enter new credentials
            manually.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load marketplace accounts.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <MarketplaceEmptyState
          title="No marketplace stores connected"
          description="Connect Shopee or Tokopedia stores via OAuth or manual credentials to prepare for inventory sync."
        />
      ) : (
        <MarketplaceTable
          accounts={data ?? []}
          oauthStatus={oauthStatusQuery.data ?? []}
          onDisconnect={setDisconnectTarget}
          onReconnect={setReconnectTarget}
          isDisconnecting={disconnectMutation.isPending}
        />
      )}

      <AddMarketplaceModal
        open={addOpen}
        onOpenChange={setAddOpen}
        oauthStatus={oauthStatusQuery.data ?? []}
      />

      <ReconnectMarketplaceModal
        account={reconnectTarget}
        open={Boolean(reconnectTarget)}
        onOpenChange={(open) => {
          if (!open) setReconnectTarget(null);
        }}
      />

      <DisconnectMarketplaceDialog
        account={disconnectTarget}
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
