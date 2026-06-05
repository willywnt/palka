import type { Metadata } from 'next';

import { PurchaseOrderDetail } from '@/modules/purchasing/components/purchase-order-detail';

export const metadata: Metadata = {
  title: 'Purchase order',
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <PurchaseOrderDetail purchaseOrderId={id} />;
}
