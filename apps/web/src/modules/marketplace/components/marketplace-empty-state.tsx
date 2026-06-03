import { ShoppingBag } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';

export function MarketplaceEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <EmptyState icon={ShoppingBag} title={title} description={description} />;
}
