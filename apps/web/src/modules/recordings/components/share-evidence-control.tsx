'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters';

import { ShareEvidenceDialog } from './share-evidence-dialog';
import type { RecordingListItem } from '../types';

/**
 * "Share evidence" trigger(s) for an order/return dispute panel — owns the share
 * dialog so the seller can mint a link without leaving the page. One button for a
 * single packing video; one labelled button per video when a resi has several
 * (so the user picks exactly which to share). Renders nothing with no recordings.
 */
export function ShareEvidenceControl({ recordings }: { recordings: RecordingListItem[] }) {
  const [target, setTarget] = useState<RecordingListItem | null>(null);

  if (recordings.length === 0) return null;

  return (
    <>
      {recordings.length === 1 ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setTarget(recordings[0] ?? null)}
        >
          <Share2 className="size-4" />
          Share evidence
        </Button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Share a specific video:</p>
          {recordings.map((recording) => (
            <Button
              key={recording.id}
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => setTarget(recording)}
            >
              <Share2 className="size-4" />
              <span suppressHydrationWarning>{formatDateTime(recording.createdAt)}</span>
            </Button>
          ))}
        </div>
      )}

      <ShareEvidenceDialog
        recording={target}
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </>
  );
}
