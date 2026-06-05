'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ChevronRight,
  LayoutDashboard,
  Library,
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
      { title: 'Purchasing', href: '/dashboard/purchasing', icon: Truck },
      { title: 'Labels', href: '/dashboard/labels', icon: QrCode },
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
  const { collapsedSections, toggleSection } = useSidebar();

  return (
    <nav className={cn('flex flex-col gap-4', collapsed ? 'px-2' : 'px-3')}>
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
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground/80 flex w-full items-center justify-between gap-2 px-3 pb-1 text-xs font-medium tracking-wider uppercase transition-colors"
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
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}
