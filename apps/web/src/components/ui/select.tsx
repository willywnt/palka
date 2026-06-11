import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Styled native `<select>` — keeps the platform dropdown (and its mobile UX)
 * while matching the Input look: same height, border, focus ring, plus a chevron.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative inline-flex">
      <select
        data-slot="select"
        className={cn(
          // text-base on touch viewports prevents the iOS focus-zoom (matches Input).
          'border-input bg-background h-9 w-full appearance-none rounded-md border px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
    </div>
  );
}

export { Select };
