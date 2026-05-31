import type { Metadata } from 'next';

import { MarketplaceProductDetailView } from '@/modules/marketplace/components/marketplace-product-detail-view';

type PageProps = {
  params: Promise<{ accountId: string; productId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { productId } = await params;
  return { title: `Marketplace product ${productId.slice(0, 8)}…` };
}

export default async function MarketplaceProductDetailPage({ params }: PageProps) {
  const { accountId, productId } = await params;

  return <MarketplaceProductDetailView accountId={accountId} productId={productId} />;
}
