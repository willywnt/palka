import type { Metadata } from 'next';
import { Users } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StorageSettingsCard } from '@/modules/storage/components/storage-settings-card';

import { GeneralSettings } from './general-settings';

export const metadata: Metadata = {
  title: 'Pengaturan',
};

type SettingsTab = 'general' | 'storage' | 'team';

function resolveTab(value: string | string[] | undefined): SettingsTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === 'storage' || tab === 'team' ? tab : 'general';
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = resolveTab(tab);

  return (
    <div>
      <PageHeader
        eyebrow="Sistem"
        title="Pengaturan"
        description="Kelola akun dan preferensi organisasi kamu."
      />

      <Tabs defaultValue={defaultTab} className="max-w-2xl">
        <TabsList>
          <TabsTrigger value="general">Umum</TabsTrigger>
          <TabsTrigger value="storage">Penyimpanan</TabsTrigger>
          <TabsTrigger value="team">Tim</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="storage">
          <StorageSettingsCard />
        </TabsContent>
        <TabsContent value="team">
          <EmptyState
            icon={Users}
            title="Fitur tim lagi disiapkan — kapalnya masih di galangan"
            description="Nanti kamu bisa mengundang pengguna lain dan mengatur perannya dari sini."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
