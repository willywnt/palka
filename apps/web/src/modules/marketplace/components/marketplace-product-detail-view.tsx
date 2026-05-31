'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type { MarketplaceProductDetailDto } from '../dto/product.dto';
import { MappingStatusBadge } from './mapping-status-badge';
import { marketplaceMappingKeys } from '../hooks/use-marketplace-mappings';

type Props = {
  accountId: string;
  productId: string;
};

export function MarketplaceProductDetailView({ accountId, productId }: Props) {
  const query = useQuery({
    queryKey: marketplaceMappingKeys.productDetail(accountId, productId),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceProductDetailDto>(
        `${apiRoutes.marketplace}/${accountId}/products/${productId}`,
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });

  if (query.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">
          {query.error instanceof Error ? query.error.message : 'Failed to load product'}
        </p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/marketplace/mappings">← Back to mapping</Link>
        </Button>
      </div>
    );
  }

  const product = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard/marketplace/mappings"
            className="text-primary mb-2 inline-block text-sm"
          >
            ← Back to SKU mapping
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{product.externalProductName}</h1>
          {product.externalVariantName ? (
            <p className="text-muted-foreground text-sm">{product.externalVariantName}</p>
          ) : null}
        </div>
        <MappingStatusBadge status={product.mappingStatus} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marketplace identifiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Store" value={product.storeName} />
            <DetailRow label="Provider" value={product.provider} />
            <DetailRow label="External product ID" value={product.externalProductId} mono />
            <DetailRow label="External variant ID" value={product.externalVariantId} mono />
            <DetailRow label="Marketplace SKU" value={product.externalSku ?? '—'} mono />
            <DetailRow label="Stock" value={String(product.stock)} />
            <DetailRow label="Status" value={product.status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Internal SKU" value={product.internalSku ?? 'Not mapped'} mono />
            <DetailRow
              label="Last imported"
              value={new Date(product.lastImportedAt).toLocaleString()}
            />
            <DetailRow
              label="Last synced"
              value={
                product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString() : 'Never'
              }
            />
            {product.mappings.length > 0 ? (
              <div className="pt-2">
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Active mappings
                </p>
                <ul className="space-y-1">
                  {product.mappings.map((mapping) => (
                    <li key={mapping.id} className="font-mono text-xs">
                      {mapping.internalSku} · {mapping.mappingStatus}
                      {!mapping.syncEnabled ? ' (sync disabled)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raw provider payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 text-xs">
            {product.rawPayload
              ? JSON.stringify(product.rawPayload, null, 2)
              : 'No raw payload stored'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'text-right font-mono text-xs' : 'text-right'}>{value}</span>
    </div>
  );
}
