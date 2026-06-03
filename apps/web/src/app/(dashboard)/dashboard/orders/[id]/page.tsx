import type { Metadata } from 'next';

import { OrderDetail } from '@/modules/orders/components/order-detail';

export const metadata: Metadata = {
  title: 'Order',
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <OrderDetail orderId={id} />;
}
