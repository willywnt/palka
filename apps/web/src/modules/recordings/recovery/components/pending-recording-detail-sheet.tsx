'use client';

import { ArrowLeft } from 'lucide-react';

import type { TemporaryRecording } from '../types';
import { PendingRecordingDetailPanel } from './pending-recording-detail-panel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type PendingRecordingDetailSheetProps = {
  recording: TemporaryRecording | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showBack?: boolean;
  onBack?: () => void;
};

/** Standalone detail sheet (e.g. from recordings library table). */
export function PendingRecordingDetailSheet({
  recording,
  open,
  onOpenChange,
  showBack = false,
  onBack,
}: PendingRecordingDetailSheetProps) {
  if (!recording) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {showBack ? (
          <div className="border-b px-4 py-3">
            <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={onBack}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>
        ) : null}
        <SheetHeader className="space-y-1 border-b px-6 py-5 text-left">
          <SheetTitle className="text-lg">Upload timeline</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <PendingRecordingDetailPanel recording={recording} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
