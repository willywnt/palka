'use client';

import Link from 'next/link';
import { APP_NAME } from '@olshop/config/constants';
import { ChevronDown, LogOut, Menu, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { logoutAction } from '@/modules/auth/actions/logout';
import { useCurrentUser } from '@/modules/auth/hooks/use-current-user';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { PaletteSwitcher } from '@/components/layout/palette-switcher';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useUiStore } from '@/store/ui-store';

export function DashboardNavbar() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const { setTheme, theme } = useTheme();
  const { user } = useCurrentUser();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex h-14 items-center gap-4 border-b px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-sidebar text-sidebar-foreground border-sidebar-border w-64 p-0"
          >
            <SheetHeader className="border-sidebar-border border-b px-5 py-4">
              <SheetTitle className="text-sidebar-foreground flex items-center gap-2.5">
                <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                  {APP_NAME.charAt(0)}
                </span>
                {APP_NAME}
              </SheetTitle>
            </SheetHeader>
            <div className="py-4">
              <SidebarNav />
            </div>
          </SheetContent>
        </Sheet>

        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          onClick={toggleSidebar}
        >
          <Menu className="size-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <PaletteSwitcher />
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:pr-2.5">
              <Avatar name={user?.displayName ?? user?.email ?? 'Account'} />
              <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline-block">
                {user?.displayName ?? user?.email ?? 'Account'}
              </span>
              <ChevronDown className="text-muted-foreground hidden size-4 sm:inline-block" />
              <span className="sr-only">User menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2.5">
                <Avatar name={user?.displayName ?? user?.email ?? 'Account'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-none font-medium">
                    {user?.displayName ?? user?.email ?? 'Account'}
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
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void logoutAction();
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
