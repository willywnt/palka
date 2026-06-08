'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { VariantMappingRef } from '../types';

/** Show at most this many connection chips before collapsing behind "+N more". */
const COLLAPSED = 2;

/**
 * Marketplace connections a variant is mapped to, each linking to its connection
 * page for unmapping. Keeps the cell to ~2 lines: 4+ connections collapse behind
 * a show-more/less toggle.
 */
export function ConnectionBadges({ connections }: { connections: VariantMappingRef[] }) {
  const [expanded, setExpanded] = useState(false);

  if (connections.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const collapsible = connections.length > 3;
  const visible = expanded || !collapsible ? connections : connections.slice(0, COLLAPSED);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((connection) => (
        <Link
          key={connection.connectionId}
          href={`/dashboard/marketplace/${connection.connectionId}`}
        >
          <Badge
            variant="outline"
            className="hover:bg-muted max-w-[150px] gap-1 font-normal"
            title={`${connection.shopName} — buka untuk lepas kaitan`}
          >
            <span className="truncate">{connection.shopName}</span>
            <ExternalLink className="size-3 shrink-0" />
          </Badge>
        </Link>
      ))}
      {collapsible ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Tampilkan lebih sedikit' : `+${connections.length - COLLAPSED} lainnya`}
        </Button>
      ) : null}
    </div>
  );
}
