import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { BundlesDashboard } from '@/modules/catalog/components/bundles-dashboard';

export const metadata: Metadata = {
  title: 'Bundles',
};

export default function BundlesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Bundles"
        description="Kits sold as one SKU that decrement their component variants. They keep no stock of their own — sellable quantity is built from components."
      />
      <BundlesDashboard />
    </div>
  );
}
