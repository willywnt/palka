import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StockActivity } from '@/modules/inventory/components/stock-activity';

export const metadata: Metadata = {
  title: 'Aktivitas stok',
};

export default function StockActivityPage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/inventory">
          <ArrowLeft className="size-4" />
          Kembali ke inventaris
        </Link>
      </Button>
      <PageHeader
        eyebrow="Inventaris"
        title="Aktivitas stok"
        description="Semua perubahan stok, terbaru di atas — cari dan export seluruh riwayatnya."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-full sm:max-w-xs" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-36" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
        }
      >
        <StockActivity />
      </Suspense>
    </div>
  );
}
