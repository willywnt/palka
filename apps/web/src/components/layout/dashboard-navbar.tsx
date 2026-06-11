'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_NAME } from '@falka/config/constants';
import { ChevronDown, LogOut, Menu, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { usePathname } from 'next/navigation';

import { logoutAction } from '@/modules/auth/actions/logout';
import { useCurrentUser } from '@/modules/auth/hooks/use-current-user';
import { BrandBadge } from '@/components/brand-mark';
import { SidebarNav, resolveNavTitle } from '@/components/layout/sidebar-nav';
import { useSidebar } from '@/components/layout/sidebar-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function DashboardNavbar() {
  const { toggle } = useSidebar();
  const { setTheme, resolvedTheme } = useTheme();
  const { user } = useCurrentUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const mobileTitle = resolveNavTitle(pathname) ?? APP_NAME;

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex h-14 items-center gap-4 border-b px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-4" />
              <span className="sr-only">Buka/tutup menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-sidebar text-sidebar-foreground border-sidebar-border w-64 p-0"
          >
            <SheetHeader className="border-sidebar-border border-b px-5 py-4">
              <SheetTitle className="text-sidebar-foreground flex items-center gap-2.5">
                <BrandBadge
                  className="bg-sidebar-primary text-sidebar-primary-foreground size-7"
                  markClassName="size-4"
                />
                {APP_NAME}
              </SheetTitle>
              <SheetDescription className="sr-only">Navigasi utama</SheetDescription>
            </SheetHeader>
            <div className="sidebar-scroll flex-1 overflow-y-auto py-4">
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggle}>
          <Menu className="size-4" />
          <span className="sr-only">Buka/tutup sidebar</span>
        </Button>
        {/* Reserved slot: <LocationSelector/> (multi-warehouse switcher) — backlog item E. */}
      </div>

      {/* The phone chrome used to be an empty strip — give it the page context. */}
      <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-tight md:hidden">
        {mobileTitle}
      </p>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Reserved slot: <NotificationBell/> (count badge → tray) — backlog item A. */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Ganti tema</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:pr-2.5">
              <Avatar name={user?.displayName ?? user?.email ?? 'Akun'} />
              <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline-block">
                {user?.displayName ?? user?.email ?? 'Akun'}
              </span>
              <ChevronDown className="text-muted-foreground hidden size-4 sm:inline-block" />
              <span className="sr-only">Menu pengguna</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2.5">
                <Avatar name={user?.displayName ?? user?.email ?? 'Akun'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-none font-medium">
                    {user?.displayName ?? user?.email ?? 'Akun'}
                  </p>
                  {user?.displayName ? (
                    <p className="text-muted-foreground mt-1 truncate text-xs leading-none">
                      {user.email}
                    </p>
                  ) : null}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon className="size-4" />
                Pengaturan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void logoutAction();
              }}
            >
              <LogOut className="size-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
