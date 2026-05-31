'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MarketplaceProvider } from '@prisma/client';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { cn } from '@/lib/utils';

import { useConnectMarketplaceAccountMutation } from '../hooks/use-marketplace-accounts';
import { buildMarketplaceOAuthStartUrl } from '../hooks/use-marketplace-oauth';
import type { ProviderOAuthStatusDto } from '../dto/oauth.dto';
import {
  MARKETPLACE_PROVIDER_DESCRIPTIONS,
  getMarketplaceProviderLabel,
} from '../utils/provider-display';
import { SUPPORTED_MARKETPLACE_PROVIDERS } from '../utils/providers';
import {
  connectMarketplaceAccountFormSchema,
  type ConnectMarketplaceAccountFormInput,
} from '../validators/connect-account';

type AddMarketplaceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oauthStatus: ProviderOAuthStatusDto[];
};

export function AddMarketplaceModal({ open, onOpenChange, oauthStatus }: AddMarketplaceModalProps) {
  const connectMutation = useConnectMarketplaceAccountMutation();

  const form = useForm<ConnectMarketplaceAccountFormInput>({
    resolver: zodResolver(connectMarketplaceAccountFormSchema),
    defaultValues: {
      provider: MarketplaceProvider.SHOPEE,
      externalStoreId: '',
      storeName: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: null,
    },
  });

  const selectedProvider = form.watch('provider');
  const selectedOAuth = oauthStatus.find((item) => item.provider === selectedProvider);
  const oauthConfigured = selectedOAuth?.oauthConfigured ?? false;

  async function onSubmit(values: ConnectMarketplaceAccountFormInput) {
    try {
      await connectMutation.mutateAsync({
        ...values,
        refreshToken: values.refreshToken?.trim() || undefined,
      });
      toast.success('Store connected', {
        description: `${values.storeName} is ready for future sync workflows.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Connection failed', {
        description:
          error instanceof Error ? error.message : 'Unable to connect marketplace store.',
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect marketplace store</DialogTitle>
          <DialogDescription>
            Connect via OAuth when provider credentials are configured, or enter tokens manually for
            development and testing.
          </DialogDescription>
        </DialogHeader>

        {oauthConfigured ? (
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Recommended: OAuth authorization</p>
            <p className="text-muted-foreground mb-3 text-xs">
              Redirects to {getMarketplaceProviderLabel(selectedProvider)} to authorize this
              platform. Tokens are encrypted before storage.
            </p>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <a
                href={buildMarketplaceOAuthStartUrl({
                  provider: selectedProvider,
                  returnUrl: `${window.location.origin}/dashboard/marketplace`,
                })}
              >
                Connect with OAuth
              </a>
            </Button>
          </div>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_MARKETPLACE_PROVIDERS.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => field.onChange(provider)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          field.value === provider
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        <span className="font-medium">{getMarketplaceProviderLabel(provider)}</span>
                      </button>
                    ))}
                  </div>
                  <FormDescription>
                    {MARKETPLACE_PROVIDER_DESCRIPTIONS[selectedProvider]}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="externalStoreId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store ID</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="storeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Shopee Store" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access token</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Provider access token"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Encrypted before storage. Never sent back to the browser.
                  </FormDescription>
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
                    <Input
                      type="password"
                      placeholder="Refresh token"
                      autoComplete="off"
                      {...field}
                    />
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
              <Button type="submit" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? 'Connecting...' : 'Connect store'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
