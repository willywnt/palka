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
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { title: 'Record', href: '/recordings', icon: Video },
      { title: 'Library', href: '/dashboard/recordings', icon: Library },
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

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname);

  return (
    <nav className="flex flex-col gap-4 px-3">
      {sidebarNavSections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label ? (
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
