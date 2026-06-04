import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { PosTerminal } from '@/modules/sales/components/pos-terminal';

export const metadata: Metadata = {
  title: 'New sale',
};

export default function NewSalePage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/sales">
          <ArrowLeft className="size-4" />
          Back to sales
        </Link>
      </Button>

      <PageHeader
        eyebrow="Sales channels"
        title="New sale"
        description="Search products, build the cart, and check out — stock updates instantly across channels."
      />
      <PosTerminal />
    </div>
  );
}
