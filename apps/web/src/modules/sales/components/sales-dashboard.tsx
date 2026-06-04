'use client';

import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { useSalesQuery } from '../hooks/use-sales';

export function SalesDashboard() {
  const { data, isLoading, error } = useSalesQuery();
  const sales = data ?? [];
  const isEmpty = !isLoading && sales.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard/sales/new">
            <Plus className="size-4" />
            New sale
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load sales. {error instanceof Error ? error.message : 'Please try again.'}
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
          icon={Receipt}
          title="No sales yet"
          description="Ring up an in-store sale — it decrements the same stock your marketplaces sync from."
          action={
            <Button asChild>
              <Link href="/dashboard/sales/new">
                <Plus className="size-4" />
                New sale
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/sales/${sale.id}`}
                      className="font-medium hover:underline"
                    >
                      {sale.code}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {sale.customerName ?? 'Walk-in'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{sale.itemCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(sale.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{sale.paymentMethod}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    <span suppressHydrationWarning>{formatDateTime(sale.createdAt)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
