import type { Metadata } from 'next';

import { BundleDetailEditor } from '@/modules/catalog/components/bundle-detail';

export const metadata: Metadata = {
  title: 'Bundle',
};

export default async function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <BundleDetailEditor variantId={id} />;
}
