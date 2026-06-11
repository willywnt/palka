import type { Metadata } from 'next';

import { OpnameDetail } from '@/modules/inventory/components/opname-detail';

export const metadata: Metadata = {
  title: 'Detail opname',
};

export default async function OpnameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <OpnameDetail opnameId={id} />;
}
