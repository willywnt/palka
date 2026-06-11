import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { OpnameList } from '@/modules/inventory/components/opname-list';

export const metadata: Metadata = {
  title: 'Opname stok',
};

export default function OpnamePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Katalog"
        title="Opname stok"
        description="Hitung stok fisik dan samakan dengan sistem. Selisihnya diposting sebagai penyesuaian (RECONCILE) di kartu stok."
      />
      <OpnameList />
    </div>
  );
}
