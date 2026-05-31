'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { MarketplaceAccountListItemDto } from '../dto/marketplace.dto';
import { useReconnectMarketplaceAccountMutation } from '../hooks/use-marketplace-accounts';
import {
  reconnectMarketplaceAccountFormSchema,
  type ReconnectMarketplaceAccountFormInput,
} from '../validators/reconnect-account';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type ReconnectMarketplaceModalProps = {
  account: MarketplaceAccountListItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReconnectMarketplaceModal({
  account,
  open,
  onOpenChange,
}: ReconnectMarketplaceModalProps) {
  const reconnectMutation = useReconnectMarketplaceAccountMutation();

  const form = useForm<ReconnectMarketplaceAccountFormInput>({
    resolver: zodResolver(reconnectMarketplaceAccountFormSchema),
    defaultValues: {
      accessToken: '',
      refreshToken: '',
      expiresAt: null,
      storeName: '',
    },
  });

  async function onSubmit(values: ReconnectMarketplaceAccountFormInput) {
    if (!account) return;

    try {
      await reconnectMutation.mutateAsync({
        accountId: account.id,
        input: {
          ...values,
          refreshToken: values.refreshToken?.trim() || undefined,
          storeName: values.storeName?.trim() || undefined,
        },
      });
      toast.success('Store reconnected', {
        description: `${account.storeName} is connected again.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Reconnect failed', {
        description: error instanceof Error ? error.message : 'Unable to reconnect store.',
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) form.reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconnect store</DialogTitle>
          <DialogDescription>
            {account
              ? `Update credentials for ${account.storeName}. Tokens are encrypted before storage.`
              : 'Select a store to reconnect.'}
          </DialogDescription>
        </DialogHeader>

        {account ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New access token</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="refreshToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refresh token (optional)</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token expiry (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={
                          field.value instanceof Date && !Number.isNaN(field.value.getTime())
                            ? field.value.toISOString().slice(0, 16)
                            : ''
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value ? new Date(value) : null);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={reconnectMutation.isPending}>
                  {reconnectMutation.isPending ? 'Reconnecting...' : 'Reconnect'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
