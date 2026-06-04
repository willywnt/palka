import type { Metadata } from 'next';

import { SaleDetail } from '@/modules/sales/components/sale-detail';

export const metadata: Metadata = {
  title: 'Sale',
};

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SaleDetail saleId={id} />;
}
