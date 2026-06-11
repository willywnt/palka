import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductsDashboard } from '@/modules/catalog/components/products-dashboard';

export const metadata: Metadata = {
  title: 'Produk',
};

function ProductsFallback() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="ml-auto h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Katalog"
        title="Produk"
        description="Katalog produk kamu — semua item yang kamu jual ada di sini."
      />
      <Suspense fallback={<ProductsFallback />}>
        <ProductsDashboard />
      </Suspense>
    </div>
  );
}
