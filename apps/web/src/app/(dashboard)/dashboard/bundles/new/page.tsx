import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { BundleForm } from '@/modules/catalog/components/bundle-form';

export const metadata: Metadata = {
  title: 'New bundle',
};

export default function NewBundlePage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/bundles">
          <ArrowLeft className="size-4" />
          Back to bundles
        </Link>
      </Button>

      <PageHeader
        eyebrow="Catalog"
        title="New bundle"
        description="Name the kit, set its price, then add the component variants and how many of each go into one bundle."
      />
      <BundleForm />
    </div>
  );
}
