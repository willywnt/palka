'use client';

import Link from 'next/link';
import { Boxes, Coins, Download, Info, PackageSearch, Warehouse } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
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
import { formatCurrency } from '@/lib/formatters';

import { inventoryValuationExportUrl, useInventoryValuationQuery } from '../hooks/use-reporting';
import type { InventoryValuationReport as InventoryValuationData } from '../types';

export function InventoryValuationReport() {
  const { data, isLoading, error } = useInventoryValuationQuery();

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <a href={inventoryValuationExportUrl()} download>
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load the inventory valuation.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading || !data ? <ValuationSkeleton /> : <ValuationContent data={data} />}
    </div>
  );
}

function ValuationContent({ data }: { data: InventoryValuationData }) {
  const { summary, byProduct } = data;
  const costUnknownHint =
    summary.costUnknownVariants > 0
      ? `${summary.costUnknownVariants} in-stock SKU(s) have no cost — excluded from the value`
      : 'Every in-stock SKU has a known cost';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total stock value"
          value={formatCurrency(summary.totalStockValue)}
          icon={Coins}
          tone="emerald"
          hint="On-hand stock at moving-average cost"
        />
        <StatCard
          label="Units on hand"
          value={summary.availableUnits.toLocaleString()}
          icon={Warehouse}
          tone="sky"
        />
        <StatCard
          label="Valued SKUs"
          value={summary.valuedVariants.toLocaleString()}
          icon={Boxes}
          tone="violet"
          hint={`of ${summary.totalVariants.toLocaleString()} total variants`}
        />
        <StatCard
          label="Missing cost"
          value={summary.costUnknownVariants.toLocaleString()}
          icon={PackageSearch}
          tone="amber"
          accentClassName={summary.costUnknownVariants > 0 ? 'text-amber-600' : undefined}
          hint={
            <span className="inline-flex items-center gap-1">
              <Info className="size-3" />
              {costUnknownHint}
            </span>
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By product</CardTitle>
        </CardHeader>
        <CardContent>
          {byProduct.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No stock on hand"
              description="Once products carry available stock with a cost, their value shows up here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Variants</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Stock value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProduct.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell>
                      <Link
                        href={`/dashboard/products/${row.productId}`}
                        className="font-medium hover:underline"
                      >
                        {row.productName}
                      </Link>
                      {row.costUnknownVariants > 0 ? (
                        <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                          {row.costUnknownVariants} no cost
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.category ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {row.variantCount}
                    </TableCell>
                    <TableCell className="num text-right">{row.availableUnits}</TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatCurrency(row.stockValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ValuationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
