import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ReorderReport } from '@/modules/inventory/components/reorder-report';

export const metadata: Metadata = {
  title: 'Reorder suggestions',
};

export default function ReorderPage() {
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
        title="Reorder suggestions"
        description="How fast items sell, how long your stock will last, and how much to buy again."
      />
      <ReorderReport />
    </div>
  );
}
