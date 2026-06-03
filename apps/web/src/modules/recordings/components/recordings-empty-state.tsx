import { Video } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';

export function RecordingsEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <EmptyState icon={Video} title={title} description={description} />;
}
