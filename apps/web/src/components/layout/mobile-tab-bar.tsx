'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Library,
  ShoppingCart,
  Store,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type TabItem = { title: string; href: Route; icon: LucideIcon };

/* The five flows a seller actually runs from a phone. */
const TABS: readonly TabItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Pesanan', href: '/dashboard/orders', icon: ShoppingCart },
  { title: 'Kasir', href: '/dashboard/sales', icon: Store },
  { title: 'Stok', href: '/dashboard/inventory', icon: Warehouse },
  { title: 'Rekaman', href: '/dashboard/recordings', icon: Library },
];

/*
 * Routes that own the bottom of the screen (sticky Bayar bar, scan flows) —
 * the tab bar steps aside there, matching the Pandu dock's suppression list.
 */
const SUPPRESSED_ROUTES = ['/recordings', '/dashboard/sales/new', '/dashboard/purchasing/new'];

function resolveActiveTab(pathname: string): string | undefined {
  let best: string | undefined;
  for (const tab of TABS) {
    const href: string = tab.href;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (best === undefined || href.length > best.length) best = href;
    }
  }
  return best;
}

/** Bottom navigation for phones — in normal flow (no overlap hacks), hidden md+. */
export function MobileTabBar() {
  const pathname = usePathname();

  if (SUPPRESSED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null;
  }

  const activeHref = resolveActiveTab(pathname);

  return (
    <nav
      aria-label="Navigasi bawah"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/80 grid shrink-0 grid-cols-5 border-t backdrop-blur md:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.href === activeHref;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-ring/50 flex flex-col items-center gap-0.5 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden />
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
