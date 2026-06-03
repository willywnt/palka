'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Search } from 'lucide-react';

import { useProductsQuery } from '@/modules/catalog/hooks/use-products';
import { cn } from '@/lib/utils';

const MIN_QUERY = 2;
const MAX_RESULTS = 6;

/** Topbar quick-find: type a product name or SKU, jump straight to its page. */
export function GlobalSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY;
  const { data, isFetching } = useProductsQuery(trimmed, active);
  const results = active ? (data ?? []).slice(0, MAX_RESULTS) : [];
  const showPanel = open && active;

  return (
    <div className={cn('relative', className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Search products or SKU..."
        aria-label="Search products or SKU"
        className="border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
      />

      {showPanel ? (
        <div className="bg-popover text-popover-foreground absolute top-11 left-0 z-50 w-full overflow-hidden rounded-lg border shadow-md">
          {results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {isFetching ? 'Searching…' : `No products match "${trimmed}".`}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/dashboard/products/${product.id}`}
                    onClick={() => setOpen(false)}
                    className="hover:bg-accent flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <Package className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{product.name}</span>
                      {product.category ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {product.category}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {product.totalAvailableStock} in stock
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
