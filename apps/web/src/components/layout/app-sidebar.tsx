'use client';

import Link from 'next/link';
import { APP_NAME } from '@falka/config/constants';
import { Boxes, Plus, Store, Truck, Video } from 'lucide-react';

import { BrandBadge } from '@/components/brand-mark';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { useSidebar } from '@/components/layout/sidebar-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/* Ordered by real creation frequency: counter sale, restock PO, product, packing video. */
function SidebarCreate({ collapsed }: { collapsed: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Button size="icon" className="mx-auto">
            <Plus className="size-4" />
            <span className="sr-only">Buat</span>
          </Button>
        ) : (
          <Button className="w-full justify-start gap-2">
            <Plus className="size-4" />
            Buat
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Buat</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/sales/new">
            <Store className="size-4" />
            Penjualan kasir
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/purchasing/new">
            <Truck className="size-4" />
            Pembelian (PO)
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/products">
            <Boxes className="size-4" />
            Produk baru
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/recordings">
            <Video className="size-4" />
            Rekam packing
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({ className }: { className?: string }) {
  const { collapsed } = useSidebar();

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border hidden h-full shrink-0 flex-col border-r transition-all duration-200 md:flex',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      <div
        className={cn(
          'border-sidebar-border flex h-14 items-center border-b',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <BrandBadge />
          {collapsed ? null : (
            <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
          )}
        </Link>
      </div>

      <div className={cn('py-3', collapsed ? 'px-2' : 'px-3')}>
        <SidebarCreate collapsed={collapsed} />
      </div>

      <div className="sidebar-scroll flex-1 overflow-y-auto pb-4">
        <SidebarNav collapsed={collapsed} />
      </div>

      {collapsed ? null : (
        <div className="border-sidebar-border text-sidebar-foreground/45 border-t px-5 py-3 text-xs">
          Lihat lebih tajam, jualan lebih tenang.
        </div>
      )}
    </aside>
  );
}
