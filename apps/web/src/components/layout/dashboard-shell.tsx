import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardNavbar } from '@/components/layout/dashboard-navbar';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
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
          <a
            href="#main-content"
            className="bg-primary text-primary-foreground sr-only z-[60] rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
          >
            Langsung ke konten
          </a>
          <div className="flex h-dvh overflow-hidden">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardNavbar />
              <main
                id="main-content"
                tabIndex={-1}
                className="horizon-wash flex-1 overflow-y-auto p-4 outline-none md:p-6"
              >
                {children}
              </main>
              <MobileTabBar />
            </div>
          </div>
          <PanduDock />
        </SidebarProvider>
        <PendingUploadProvider />
      </GlobalRecordingReliability>
    </TooltipProvider>
  );
}
