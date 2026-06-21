'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
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
import { NumberInput } from '@/components/ui/number-input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { useUpdateOrgMutation } from '../hooks/use-admin-orgs';
import type { AdminOrgListItem } from '../types';

const BYTES_PER_MB = 1024 * 1024;

/** Storage quota is edited in MB; memberLimit 0 means unlimited (→ null). */
const formSchema = z.object({
  name: z.string().trim().min(1, 'Nama organisasi wajib diisi').max(100),
  plan: z.string().trim().min(1, 'Plan wajib diisi').max(50),
  memberLimit: z.number().int().nonnegative(),
  storageQuotaMb: z.number().int().nonnegative(),
});

type FormValues = z.infer<typeof formSchema>;

export function EditOrgSheet({
  org,
  open,
  onOpenChange,
}: {
  org: AdminOrgListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateOrg = useUpdateOrgMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', plan: 'FREE', memberLimit: 0, storageQuotaMb: 0 },
  });

  // Re-seed the form whenever a different org is opened for editing.
  useEffect(() => {
    if (org) {
      form.reset({
        name: org.name,
        plan: org.plan,
        memberLimit: org.memberLimit ?? 0,
        storageQuotaMb: Math.round(Number(org.storageQuotaBytes) / BYTES_PER_MB),
      });
    }
  }, [org, form]);

  async function onSubmit(values: FormValues) {
    if (!org) return;
    try {
      await updateOrg.mutateAsync({
        organizationId: org.id,
        config: {
          name: values.name,
          plan: values.plan,
          memberLimit: values.memberLimit > 0 ? values.memberLimit : null,
          storageQuotaBytes: values.storageQuotaMb * BYTES_PER_MB,
        },
      });
      toast.success('Konfigurasi organisasi diperbarui');
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal memperbarui organisasi', {
        description: error instanceof Error ? error.message : 'Ada yang error, coba lagi.',
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Atur organisasi</SheetTitle>
          <SheetDescription>{org?.name ?? '—'}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Nama organisasi</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="plan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Plan</FormLabel>
                  <FormControl>
                    <Input maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="memberLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batas anggota</FormLabel>
                  <FormControl>
                    <NumberInput min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>0 = tanpa batas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="storageQuotaMb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kuota penyimpanan (MB)</FormLabel>
                  <FormControl>
                    <NumberInput min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>
                    Total ruang penyimpanan (video packing + foto produk) untuk organisasi ini.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="px-0">
              <Button type="submit" disabled={updateOrg.isPending}>
                {updateOrg.isPending ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
