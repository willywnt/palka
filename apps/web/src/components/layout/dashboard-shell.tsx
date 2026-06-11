import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardNavbar } from '@/components/layout/dashboard-navbar';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { PanduDock } from '@/components/pandu/pandu-dock';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalRecordingReliability } from '@/modules/recordings/recovery/components/global-recording-reliability';
import { PendingUploadProvider } from '@/modules/recordings/recovery/components/pending-upload-center';

export function DashboardShell({
  children,
  defaultCollapsed,
  defaultCollapsedSections,
}: {
  children: React.ReactNode;
  defaultCollapsed: boolean;
  defaultCollapsedSections: string[];
}) {
  return (
    <TooltipProvider>
      <GlobalRecordingReliability>
        <SidebarProvider
          defaultCollapsed={defaultCollapsed}
          defaultCollapsedSections={defaultCollapsedSections}
        >
          <div className="flex h-screen overflow-hidden">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardNavbar />
              <main className="horizon-wash flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
            </div>
          </div>
          <PanduDock />
        </SidebarProvider>
        <PendingUploadProvider />
      </GlobalRecordingReliability>
    </TooltipProvider>
  );
}
