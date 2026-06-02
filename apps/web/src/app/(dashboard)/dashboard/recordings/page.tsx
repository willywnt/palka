import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { RecordingsDashboard } from '@/modules/recordings/components/recordings-dashboard';
import { PendingUploadTrigger } from '@/modules/recordings/recovery/components/pending-upload-center';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Recordings Library',
};

export default function DashboardRecordingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recordings library"
        description="Browse, play, download, and manage your operational recordings."
      >
        <PendingUploadTrigger />
      </PageHeader>
      <Suspense
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        }
      >
        <RecordingsDashboard />
      </Suspense>
    </div>
  );
}
