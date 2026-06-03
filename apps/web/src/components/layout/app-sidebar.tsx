'use client';

import Link from 'next/link';
import { APP_NAME } from '@olshop/config/constants';

import { SidebarNav } from '@/components/layout/sidebar-nav';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

export function AppSidebar({ className }: { className?: string }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border hidden h-full w-64 shrink-0 flex-col border-r transition-all duration-200 md:flex',
        !sidebarOpen && 'md:w-0 md:overflow-hidden md:border-r-0',
        className,
      )}
    >
      <div className="border-sidebar-border flex h-14 items-center border-b px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold shadow-sm">
            {APP_NAME.charAt(0)}
          </span>
          <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav />
      </div>
      <div className="border-sidebar-border text-sidebar-foreground/45 border-t px-5 py-3 text-xs">
        Inventory &amp; fulfillment
      </div>
    </aside>
  );
}
