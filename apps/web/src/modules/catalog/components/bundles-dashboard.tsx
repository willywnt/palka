'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { ImageThumb } from '@/components/image-thumb';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { useBundlesQuery } from '../hooks/use-products';
import { bundleBuildableDisplay } from '../utils/bundle-buildable-display';

export function BundlesDashboard() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { page, setPage, pageSize, setPageSize } = usePagination(10);
  const { data, isLoading, error } = useBundlesQuery(debouncedSearch, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  const bundles = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && bundles.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search bundle SKU, name, or product…"
          className="sm:max-w-xs"
        />
        <Button asChild>
          <Link href="/dashboard/bundles/new">
            <Plus className="size-4" />
            New bundle
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load bundles. {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Layers}
          title={debouncedSearch ? 'No bundles match' : 'No bundles yet'}
          description={
            debouncedSearch
              ? 'Try a different search.'
              : 'A bundle sells as a kit and decrements its component stock — it keeps no stock of its own. Create one to get started.'
          }
          action={
            debouncedSearch ? undefined : (
              <Button asChild>
                <Link href="/dashboard/bundles/new">
                  <Plus className="size-4" />
                  New bundle
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle</TableHead>
                  <TableHead className="text-right">Components</TableHead>
                  <TableHead className="text-right">Buildable</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((bundle) => {
                  const badge = bundleBuildableDisplay(bundle.buildable);
                  return (
                    <TableRow key={bundle.bundleVariantId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ImageThumb src={bundle.imageUrl} alt={bundle.name} />
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/bundles/${bundle.bundleVariantId}`}
                              className="font-medium hover:underline"
                            >
                              {bundle.name}
                            </Link>
                            <div className="text-muted-foreground text-xs">
                              {bundle.productName} · {bundle.sku}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {bundle.componentCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="mr-2 font-medium tabular-nums">{bundle.buildable}</span>
                        <Badge className={cn('border-transparent', badge.className)}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(bundle.price)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {meta && meta.total > 0 ? (
            <TablePagination
              page={meta.page}
              pageSize={pageSize}
              total={meta.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
