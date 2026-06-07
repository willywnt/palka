import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { LabelsTabs } from '@/modules/catalog/components/labels-tabs';

export const metadata: Metadata = {
  title: 'Labels',
};

export default function LabelsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Labels"
        description="Print QR labels for your variants and bundles — each encodes the barcode (or SKU) for counter scanning."
      />
      <LabelsTabs />
    </div>
  );
}
