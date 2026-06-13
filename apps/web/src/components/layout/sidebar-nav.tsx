'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import {
  allNavItems,
  resolveActiveHref,
  visibleNavSections,
  type NavItem,
} from '@/components/layout/nav-config';
import { useOpsPulse } from '@/components/layout/use-ops-pulse';
import { useSidebar } from '@/components/layout/sidebar-provider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOrg } from '@/modules/users/hooks/use-org';

/** Live count chip on a nav row — restock urgency lights the suar amber. */
function NavPulseBadge({ item, count }: { item: NavItem; count: number | undefined }) {
  if (!count) return null;

  return (
    <span
      aria-label={`${count} perlu tindakan`}
      className={cn(
        'num ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold',
        item.pulse === 'restockUrgent'
          ? 'bg-highlight text-highlight-foreground'
          : 'bg-sidebar-accent text-sidebar-foreground/90',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, allNavItems());
  const { collapsedSections, toggleSection } = useSidebar();
  const pulse = useOpsPulse();
  const { org } = useOrg();
  // While the org is loading the role/permissions read as none — gated items never flash.
  const sections = visibleNavSections(org?.role ?? null, org?.permissions ?? null);

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn('flex flex-col gap-4', collapsed ? 'px-2' : 'px-3')}
    >
      {sections.map((section, index) => {
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
                  const count = item.pulse ? pulse[item.pulse] : undefined;

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
                      <span className="relative flex shrink-0">
                        <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                        {collapsed && count ? (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute -top-1 -right-1 size-2 rounded-full',
                              item.pulse === 'restockUrgent'
                                ? 'bg-highlight'
                                : 'bg-sidebar-foreground/60',
                            )}
                          />
                        ) : null}
                      </span>
                      {collapsed ? null : item.title}
                      {collapsed ? <span className="sr-only">{item.title}</span> : null}
                      {!collapsed ? <NavPulseBadge item={item} count={count} /> : null}
                    </Link>
                  );

                  if (!collapsed) return link;

                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">
                        {item.title}
                        {count ? ` · ${count}` : ''}
                      </TooltipContent>
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
