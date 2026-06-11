import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LineChart, ScrollText } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryOverview } from '@/modules/inventory/components/inventory-overview';

export const metadata: Metadata = {
  title: 'Inventaris',
};

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Katalog"
        title="Inventaris"
        description="Sisa stok tiap item kamu, selalu sinkronisasi di semua channel penjualan."
      >
        <Button asChild variant="outline">
          <Link href="/dashboard/inventory/activity">
            <ScrollText className="size-4" />
            Aktivitas
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/inventory/reorder">
            <LineChart className="size-4" />
            Saran restok
          </Link>
        </Button>
      </PageHeader>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-9 w-full sm:max-w-xs" />
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
        }
      >
        <InventoryOverview />
      </Suspense>
    </div>
  );
}
