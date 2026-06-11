'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ChevronRight,
  Coins,
  Layers,
  LayoutDashboard,
  Library,
  LineChart,
  QrCode,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Undo2,
  Video,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import { useSidebar } from '@/components/layout/sidebar-provider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SidebarNavItem = {
  title: string;
  href: Route;
  icon: LucideIcon;
};

type SidebarNavSection = {
  label?: string;
  items: readonly SidebarNavItem[];
};

export const sidebarNavSections: readonly SidebarNavSection[] = [
  {
    items: [{ title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Katalog',
    items: [
      { title: 'Produk', href: '/dashboard/products', icon: Boxes },
      { title: 'Bundel', href: '/dashboard/bundles', icon: Layers },
      { title: 'Inventaris', href: '/dashboard/inventory', icon: Warehouse },
      { title: 'Pembelian', href: '/dashboard/purchasing', icon: Truck },
      { title: 'Label', href: '/dashboard/labels', icon: QrCode },
    ],
  },
  {
    label: 'Channel penjualan',
    items: [
      { title: 'Marketplace', href: '/dashboard/marketplace', icon: ShoppingBag },
      { title: 'Pesanan (online)', href: '/dashboard/orders', icon: ShoppingCart },
      { title: 'Penjualan (Kasir)', href: '/dashboard/sales', icon: Store },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      // "Rekam packing" vs "Rekaman": one letter apart was an easy mis-tap.
      { title: 'Rekam packing', href: '/recordings', icon: Video },
      { title: 'Rekaman', href: '/dashboard/recordings', icon: Library },
      { title: 'Retur', href: '/dashboard/returns', icon: Undo2 },
    ],
  },
  {
    label: 'Laporan',
    items: [
      { title: 'Laba & channel', href: '/dashboard/reports/profit', icon: LineChart },
      { title: 'Nilai stok', href: '/dashboard/reports/inventory-value', icon: Coins },
    ],
  },
  {
    label: 'Sistem',
    items: [{ title: 'Pengaturan', href: '/settings', icon: Settings }],
  },
];

/** The active nav item's title for the given path — used by the mobile navbar chrome. */
export function resolveNavTitle(pathname: string): string | undefined {
  const activeHref = resolveActiveHref(pathname);
  if (!activeHref) return undefined;

  for (const section of sidebarNavSections) {
    for (const item of section.items) {
      if (item.href === activeHref) return item.title;
    }
  }

  return undefined;
}

/** Highlight the most specific matching item so a parent route never lights up a child's row. */
function resolveActiveHref(pathname: string): string | undefined {
  let best: string | undefined;

  for (const section of sidebarNavSections) {
    for (const item of section.items) {
      const href: string = item.href;
      const matches = pathname === href || pathname.startsWith(`${href}/`);

      if (matches && (best === undefined || href.length > best.length)) {
        best = href;
      }
    }
  }

  return best;
}

export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname);
  const { collapsedSections, toggleSection } = useSidebar();

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn('flex flex-col gap-4', collapsed ? 'px-2' : 'px-3')}
    >
      {sidebarNavSections.map((section, index) => {
        const label = section.label;
        const sectionCollapsed = label ? collapsedSections.has(label) : false;
        // The icon rail always shows items; the expanded sidebar honours the accordion.
        const showItems = collapsed || !sectionCollapsed;

        return (
          <div key={label ?? `section-${index}`} className="flex flex-col gap-1">
            {label && !collapsed ? (
              <button
                type="button"
                onClick={() => toggleSection(label)}
                aria-expanded={!sectionCollapsed}
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground/80 eyebrow focus-visible:ring-sidebar-ring flex w-full items-center justify-between gap-2 rounded-sm px-3 pb-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {label}
                <ChevronRight
                  className={cn(
                    'size-3.5 transition-transform duration-200',
                    !sectionCollapsed && 'rotate-90',
                  )}
                />
              </button>
            ) : null}
            {showItems
              ? section.items.map((item) => {
                  const isActive = item.href === activeHref;
                  const Icon = item.icon;

                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'focus-visible:ring-sidebar-ring relative flex items-center rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      {/* The promised teal active marker on the sidebar edge. */}
                      {isActive && !collapsed ? (
                        <span
                          aria-hidden
                          className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-full"
                        />
                      ) : null}
                      <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                      {collapsed ? null : item.title}
                      {collapsed ? <span className="sr-only">{item.title}</span> : null}
                    </Link>
                  );

                  if (!collapsed) return link;

                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    </Tooltip>
                  );
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}
