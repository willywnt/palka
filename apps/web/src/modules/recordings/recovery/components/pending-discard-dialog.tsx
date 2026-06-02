'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function PendingDiscardDialog({
  noResi,
  open,
  onOpenChange,
  onConfirm,
  isDiscarding = false,
}: {
  noResi: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDiscarding?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard local recording?</AlertDialogTitle>
          <AlertDialogDescription>
            {noResi
              ? `Tracking number ${noResi} will be removed from this device. This cannot be undone.`
              : 'This local recording will be removed from this device. This cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDiscarding}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDiscarding}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isDiscarding ? 'Discarding…' : 'Discard'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
