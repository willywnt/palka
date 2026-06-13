import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { requireOrgPermission } from '@/modules/auth/services/session';
import { InventoryValuationReport } from '@/modules/reporting/components/inventory-valuation-report';

export const metadata: Metadata = {
  title: 'Nilai stok',
};

export default async function InventoryValuationPage() {
  await requireOrgPermission('reports.view');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laporan"
        title="Nilai stok"
        description="Nilai stok yang ada sekarang, dihitung dari modal — lihat di mana modal kamu tertahan."
      />
      <InventoryValuationReport />
    </div>
  );
}
