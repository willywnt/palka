import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { PoForm } from '@/modules/purchasing/components/po-form';

export const metadata: Metadata = {
  title: 'New purchase order',
};

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/purchasing">
          <ArrowLeft className="size-4" />
          Back to purchasing
        </Link>
      </Button>

      <PageHeader
        eyebrow="Catalog"
        title="New purchase order"
        description="Search products or load reorder suggestions, set quantities + costs, and place the order."
      />
      <PoForm />
    </div>
  );
}
