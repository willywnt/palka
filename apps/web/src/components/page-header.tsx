import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Micro-caps label shown above the title (e.g. a section name). */
  eyebrow?: string;
  /** Optional context line above the eyebrow — reserved for location/org scope. */
  breadcrumb?: ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumb,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1">
        {breadcrumb ? <div className="text-muted-foreground text-xs">{breadcrumb}</div> : null}
        {eyebrow ? <p className="eyebrow text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
