'use client';

import { format } from 'date-fns';
import { History } from 'lucide-react';

export type MobileScanHistoryEntry = {
  /** Unique per scan event so repeats of the same code each render. */
  id: string;
  barcode: string;
  scannedAt: string;
};

type MobileScanHistoryProps = {
  entries: MobileScanHistoryEntry[];
};

export function MobileScanHistory({ entries }: MobileScanHistoryProps) {
  return (
    <section className="bg-background border-t">
      <header className="text-muted-foreground flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium">
        <span className="flex items-center gap-2">
          <History className="size-3.5 shrink-0" />
          Recent scans
        </span>
        {entries.length > 0 ? (
          <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 tabular-nums">
            {entries.length}
          </span>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground px-4 pb-3 text-xs">No scans yet.</p>
      ) : (
        <ul className="max-h-28 divide-y overflow-y-auto px-2 pb-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="truncate font-mono text-sm">{entry.barcode}</span>
              <time className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                {format(new Date(entry.scannedAt), 'HH:mm:ss')}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
