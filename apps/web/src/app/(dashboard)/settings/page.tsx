import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { orgRoleAtLeast } from '@/lib/org-role';
import { getCurrentUser } from '@/modules/auth/services/session';
import { resolveOrgContext } from '@/modules/auth/services/org-context';
import { StorageSettingsCard } from '@/modules/storage/components/storage-settings-card';

import { ActivitySettings } from './activity-settings';
import { GeneralSettings } from './general-settings';
import { TeamSettings } from './team-settings';

export const metadata: Metadata = {
  title: 'Pengaturan',
};

type SettingsTab = 'general' | 'storage' | 'team' | 'activity';

const ADMIN_TABS: ReadonlySet<SettingsTab> = new Set(['storage', 'team', 'activity']);

function resolveTab(value: string | string[] | undefined, isAdmin: boolean): SettingsTab {
  const tab = Array.isArray(value) ? value[0] : value;
  const candidate: SettingsTab =
    tab === 'storage' || tab === 'team' || tab === 'activity' ? tab : 'general';
  // A non-admin requesting an admin-only tab lands on "Umum" instead.
  if (!isAdmin && ADMIN_TABS.has(candidate)) return 'general';
  return candidate;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;

  // Resolve the viewer's org role server-side (no redirect — STAFF still see "Umum").
  const user = await getCurrentUser();
  const org = user ? await resolveOrgContext(user.id) : null;
  const isAdmin = org !== null && orgRoleAtLeast(org.role, 'ADMIN');

  const defaultTab = resolveTab(tab, isAdmin);

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
          {isAdmin ? (
            <>
              <TabsTrigger value="storage">Penyimpanan</TabsTrigger>
              <TabsTrigger value="team">Tim</TabsTrigger>
              <TabsTrigger value="activity">Riwayat aktivitas</TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        {isAdmin ? (
          <>
            <TabsContent value="storage">
              <StorageSettingsCard />
            </TabsContent>
            <TabsContent value="team">
              <TeamSettings />
            </TabsContent>
            <TabsContent value="activity">
              <ActivitySettings />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
