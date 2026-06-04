import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { StockActivity } from '@/modules/inventory/components/stock-activity';

export const metadata: Metadata = {
  title: 'Stock activity',
};

export default function StockActivityPage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/inventory">
          <ArrowLeft className="size-4" />
          Back to inventory
        </Link>
      </Button>
      <PageHeader
        eyebrow="Inventory"
        title="Stock activity"
        description="Every stock change, newest first — search and export the full history."
      />
      <Suspense fallback={null}>
        <StockActivity />
      </Suspense>
    </div>
  );
}
