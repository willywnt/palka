'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import {
  useCreateMappingMutation,
  useImportMarketplaceProductsMutation,
  useMarketplaceMappingsQuery,
  useMarketplaceProductsQuery,
  useRemoveMappingMutation,
} from '../hooks/use-marketplace-mappings';
import { useMarketplaceAccountsQuery } from '../hooks/use-marketplace-accounts';
import type { MarketplaceProductListItemDto } from '../dto/product.dto';
import { MappingStatusBadge } from './mapping-status-badge';
import { CreateMappingModal } from './create-mapping-modal';
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

export function MarketplaceMappingDashboard() {
  const [accountId, setAccountId] = useState<string>('');
  const [mapTarget, setMapTarget] = useState<MarketplaceProductListItemDto | null>(null);
  const [search, setSearch] = useState('');

  const accountsQuery = useMarketplaceAccountsQuery();
  const selectedAccountId = accountId || accountsQuery.data?.[0]?.id || '';

  const productsQuery = useMarketplaceProductsQuery(selectedAccountId || null, {
    search,
    page: 1,
    pageSize: 50,
  });
  const unmappedQuery = useMarketplaceProductsQuery(selectedAccountId || null, {
    unmappedOnly: true,
    page: 1,
    pageSize: 50,
  });
  const mappingsQuery = useMarketplaceMappingsQuery({
    marketplaceAccountId: selectedAccountId || undefined,
  });

  const importMutation = useImportMarketplaceProductsMutation();
  const removeMutation = useRemoveMappingMutation();

  async function handleImport() {
    if (!selectedAccountId) return;

    try {
      const result = await importMutation.mutateAsync({ accountId: selectedAccountId });
      toast.success('Import complete', {
        description: `${result.imported} products · ${result.autoMapped} auto-mapped · ${result.unmapped} unmapped`,
      });
    } catch (error) {
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Link internal SKUs to marketplace listings. Mapping is required before stock sync.
          </p>
          <Link href="/dashboard/marketplace" className="text-primary mt-1 inline-block text-sm">
            ← Back to store accounts
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            value={selectedAccountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {(accountsQuery.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.storeName} ({account.provider})
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void handleImport()}
            disabled={!selectedAccountId || importMutation.isPending}
          >
            <Download className="size-4" />
            {importMutation.isPending ? 'Importing...' : 'Import products'}
          </Button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Search marketplace SKU or product name…"
        className="border-input bg-background w-full max-w-md rounded-md border px-3 py-2 text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mapped</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {mappingsQuery.data?.items.filter((m) => m.mappingStatus === 'MAPPED').length ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unmapped</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {unmappedQuery.data?.meta?.total ?? unmappedQuery.data?.items.length ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {mappingsQuery.data?.items.filter((m) => !m.health.syncReady).length ?? '—'}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Marketplace products</TabsTrigger>
          <TabsTrigger value="mappings">Active mappings</TabsTrigger>
          <TabsTrigger value="unmapped">Unmapped</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          {productsQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ProductsTable
              accountId={selectedAccountId}
              items={productsQuery.data?.items ?? []}
              onMap={setMapTarget}
            />
          )}
        </TabsContent>

        <TabsContent value="mappings" className="mt-4">
          {mappingsQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <MappingsTable
              items={mappingsQuery.data?.items ?? []}
              onRemove={(id) => void removeMutation.mutateAsync(id)}
              isRemoving={removeMutation.isPending}
            />
          )}
        </TabsContent>

        <TabsContent value="unmapped" className="mt-4">
          {unmappedQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ProductsTable
              accountId={selectedAccountId}
              items={unmappedQuery.data?.items ?? []}
              onMap={setMapTarget}
            />
          )}
        </TabsContent>
      </Tabs>

      <CreateMappingModal
        product={mapTarget}
        open={Boolean(mapTarget)}
        onOpenChange={(open) => {
          if (!open) setMapTarget(null);
        }}
      />
    </div>
  );
}

function ProductsTable({
  accountId,
  items,
  onMap,
}: {
  accountId: string;
  items: MarketplaceProductListItemDto[];
  onMap: (item: MarketplaceProductListItemDto) => void;
}) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Marketplace SKU</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Mapping</TableHead>
            <TableHead>Internal SKU</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                No marketplace products. Run import for the selected store.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.externalSku ?? '—'}</TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/marketplace/mappings/${accountId}/products/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.externalProductName}
                  </Link>
                  {item.externalVariantName ? (
                    <div className="text-muted-foreground text-xs">{item.externalVariantName}</div>
                  ) : null}
                </TableCell>
                <TableCell>{item.stock}</TableCell>
                <TableCell>
                  <MappingStatusBadge status={item.mappingStatus} />
                </TableCell>
                <TableCell className="font-mono text-sm">{item.internalSku ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={item.mappingStatus === 'MAPPED'}
                    onClick={() => onMap(item)}
                  >
                    <Link2 className="size-4" />
                    Map
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MappingsTable({
  items,
  onRemove,
  isRemoving,
}: {
  items: import('../dto/mapping.dto').MarketplaceMappingListItemDto[];
  onRemove: (id: string) => void;
  isRemoving?: boolean;
}) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Internal SKU</TableHead>
            <TableHead>Marketplace SKU</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sync ready</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-sm">{item.internalSku}</TableCell>
              <TableCell className="font-mono text-sm">{item.externalSku ?? '—'}</TableCell>
              <TableCell>
                <MappingStatusBadge status={item.mappingStatus} />
              </TableCell>
              <TableCell>{item.health.syncReady ? 'Yes' : 'No'}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isRemoving}
                  onClick={() => onRemove(item.id)}
                >
                  <Unlink className="size-4" />
                  Unmap
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
