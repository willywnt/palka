import type { Metadata } from 'next';
import Link from 'next/link';
import { Library } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { RecordingPanel } from '@/modules/recordings/components/recording-panel';
import { PendingUploadTrigger } from '@/modules/recordings/recovery/components/pending-upload-center';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Rekam baru',
};

export default function RecordingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fulfillment"
        title="Rekam baru"
        description="Rekam proses packing dari webcam kamu, langsung terupload ke penyimpanan."
      >
        <PendingUploadTrigger />
        <Button variant="outline" asChild>
          <Link href="/dashboard/recordings">
            <Library className="size-4" />
            Daftar rekaman
          </Link>
        </Button>
      </PageHeader>
      <RecordingPanel />
    </div>
  );
}
