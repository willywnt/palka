import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { PosTerminal } from '@/modules/sales/components/pos-terminal';

export const metadata: Metadata = {
  title: 'New sale',
};

export default function NewSalePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales channels"
        title="New sale"
        description="Search products, build the cart, and check out — stock updates instantly across channels."
      />
      <PosTerminal />
    </div>
  );
}
