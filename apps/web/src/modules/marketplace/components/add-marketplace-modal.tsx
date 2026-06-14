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

import { useCreateMarketplaceConnectionMutation } from '../hooks/use-marketplace-connections';
import {
  MARKETPLACE_PROVIDER_DESCRIPTIONS,
  getMarketplaceProviderLabel,
} from '../utils/provider-display';
import { SUPPORTED_MARKETPLACE_PROVIDERS } from '../utils/providers';
import {
  createMarketplaceConnectionFormSchema,
  type CreateMarketplaceConnectionFormInput,
} from '../validators/create-connection';

type AddMarketplaceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * `datetime-local` value from LOCAL date parts — `toISOString()` is UTC and
 * would show the time 7 hours off in WIB.
 */
function toDatetimeLocalValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AddMarketplaceModal({ open, onOpenChange }: AddMarketplaceModalProps) {
  const createMutation = useCreateMarketplaceConnectionMutation();

  const form = useForm<CreateMarketplaceConnectionFormInput>({
    resolver: zodResolver(createMarketplaceConnectionFormSchema),
    defaultValues: {
      provider: MarketplaceProvider.SHOPEE,
      shopId: '',
      shopName: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: null,
    },
  });

  const selectedProvider = form.watch('provider');

  async function onSubmit(values: CreateMarketplaceConnectionFormInput) {
    try {
      await createMutation.mutateAsync({
        ...values,
        refreshToken: values.refreshToken?.trim() || undefined,
      });
      toast.success('Toko marketplace terhubung', {
        description: `${values.shopName} siap dipakai untuk sinkronisasi berikutnya.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal menghubungkan', {
        description:
          error instanceof Error ? error.message : 'Toko marketplace tidak bisa dihubungkan.',
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
          <DialogTitle>Hubungkan toko marketplace</DialogTitle>
          <DialogDescription>
            Lazada pakai login OAuth — token diisi otomatis, tidak perlu paste manual. Provider lain
            sementara isi token manual.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <div
                    role="radiogroup"
                    aria-label="Provider"
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                  >
                    {SUPPORTED_MARKETPLACE_PROVIDERS.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        role="radio"
                        aria-checked={field.value === provider}
                        onClick={() => field.onChange(provider)}
                        className={cn(
                          'focus-visible:ring-ring/50 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
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

            {selectedProvider === MarketplaceProvider.LAZADA && (
              <div className="bg-muted/40 space-y-3 rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  Login & izinkan akses sebagai seller Lazada — kodenya ditukar jadi token dan
                  koneksinya dibuat otomatis. Tidak perlu isi token di bawah.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    window.location.href = '/api/v1/marketplaces/lazada/oauth/authorize';
                  }}
                >
                  Hubungkan dengan Lazada (OAuth)
                </Button>
                <p className="text-muted-foreground text-xs">
                  Atau isi token manual di bawah (untuk dev/fallback).
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="shopId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID toko</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shopName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama toko</FormLabel>
                    <FormControl>
                      <Input placeholder="Toko Shopee Saya" autoComplete="off" {...field} />
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
                      placeholder="Access token (manual / dev)"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Dienkripsi sebelum disimpan. Tidak pernah dikirim balik ke browser.
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
                  <FormLabel>Refresh token (opsional)</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Refresh token (manual / dev)"
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
                  <FormLabel>Masa berlaku token (opsional)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={
                        field.value instanceof Date && !Number.isNaN(field.value.getTime())
                          ? toDatetimeLocalValue(field.value)
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
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Menghubungkan...' : 'Hubungkan toko'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
