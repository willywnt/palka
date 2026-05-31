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

import type { MarketplaceAccountListItemDto } from '../dto/marketplace.dto';
import { getMarketplaceProviderLabel } from '../utils/provider-display';

export function DisconnectMarketplaceDialog({
  account,
  open,
  onOpenChange,
  onConfirm,
  isDisconnecting,
}: {
  account: MarketplaceAccountListItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDisconnecting?: boolean;
}) {
  if (!account) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect marketplace store?</AlertDialogTitle>
          <AlertDialogDescription>
            This will deactivate <span className="font-medium">{account.storeName}</span> (
            {getMarketplaceProviderLabel(account.provider)}). Credentials stay encrypted and can be
            reconnected later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDisconnecting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect store'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
