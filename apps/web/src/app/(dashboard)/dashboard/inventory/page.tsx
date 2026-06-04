import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LineChart, ScrollText } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { InventoryOverview } from '@/modules/inventory/components/inventory-overview';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Inventory"
        description="How much you have of every item, kept in sync across all your sales channels."
      >
        <Button asChild variant="outline">
          <Link href="/dashboard/inventory/activity">
            <ScrollText className="size-4" />
            Activity
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/inventory/reorder">
            <LineChart className="size-4" />
            Reorder suggestions
          </Link>
        </Button>
      </PageHeader>
      <Suspense fallback={null}>
        <InventoryOverview />
      </Suspense>
    </div>
  );
}
