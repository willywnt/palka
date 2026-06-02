import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardNavbar } from '@/components/layout/dashboard-navbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalRecordingReliability } from '@/modules/recordings/recovery/components/global-recording-reliability';
import { PendingUploadProvider } from '@/modules/recordings/recovery/components/pending-upload-center';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <GlobalRecordingReliability>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <DashboardNavbar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
        <PendingUploadProvider />
      </GlobalRecordingReliability>
    </TooltipProvider>
  );
}
