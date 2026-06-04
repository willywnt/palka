'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  LayoutDashboard,
  Library,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Undo2,
  Video,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

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
    label: 'Catalog',
    items: [
      { title: 'Products', href: '/dashboard/products', icon: Boxes },
      { title: 'Inventory', href: '/dashboard/inventory', icon: Warehouse },
    ],
  },
  {
    label: 'Sales channels',
    items: [
      { title: 'Marketplaces', href: '/dashboard/marketplace', icon: ShoppingBag },
      { title: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
      { title: 'Sales (POS)', href: '/dashboard/sales', icon: Store },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { title: 'Record', href: '/recordings', icon: Video },
      { title: 'Library', href: '/dashboard/recordings', icon: Library },
      { title: 'Returns', href: '/dashboard/returns', icon: Undo2 },
    ],
  },
  {
    label: 'System',
    items: [{ title: 'Settings', href: '/settings', icon: Settings }],
  },
];

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

  return (
    <nav className={cn('flex flex-col gap-4', collapsed ? 'px-2' : 'px-3')}>
      {sidebarNavSections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && !collapsed ? (
            <p className="text-sidebar-foreground/50 px-3 pb-1 text-xs font-medium tracking-wider uppercase">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => {
            const isActive = item.href === activeHref;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.title : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                {collapsed ? null : item.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
