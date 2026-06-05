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

import type { ProductVariantItem } from '../types';

export function DeleteVariantDialog({
  targets,
  label,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  /** The leaf variants to archive — one row, or every leaf of a group. */
  targets: ProductVariantItem[];
  /** Reads inside "This archives …", e.g. `“Hitam”` or `the “iPhone 16” group`. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}) {
  if (targets.length === 0) return null;

  const reserved = targets.reduce((sum, variant) => sum + variant.reservedStock, 0);
  const available = targets.reduce((sum, variant) => sum + variant.availableStock, 0);
  const incoming = targets.reduce((sum, variant) => sum + variant.incomingStock, 0);
  const blocked = reserved > 0;
  const count = targets.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count === 1 ? 'variant' : `${count} subvariants`}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This archives {label}. Stock history is kept; {count === 1 ? 'it is' : 'they are'}{' '}
            hidden from your catalog and the SKU{count === 1 ? '' : 's'} freed for reuse.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blocked ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
            {reserved} unit{reserved === 1 ? '' : 's'} reserved for unshipped orders. Ship or cancel
            those orders before deleting.
          </div>
        ) : (
          <ul className="text-muted-foreground bg-muted/30 space-y-1 rounded-md border p-3 text-sm">
            {available > 0 ? <li>{available} in stock will be removed from view.</li> : null}
            {incoming > 0 ? <li>{incoming} incoming from open purchase orders.</li> : null}
            <li>
              Marketplace listings mapped here aren&apos;t unmapped automatically — review them.
            </li>
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting || blocked}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
