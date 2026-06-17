'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { useSupplierOptionsQuery } from '@/modules/purchasing/hooks/use-suppliers';

import { useUpdateVariantMutation } from '../hooks/use-products';
import type { ProductVariantItem } from '../types';
import { formatVariantLabel } from '../utils/variants';
import { editVariantFormSchema, type EditVariantFormInput } from '../validators/update-variant';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function toDefaults(variant: ProductVariantItem): EditVariantFormInput {
  return {
    lowStockThreshold: variant.lowStockThreshold,
    alertEnabled: variant.alertEnabled,
    leadTimeDays: variant.leadTimeDays ?? 0,
    minOrderQty: variant.minOrderQty ?? 0,
    supplierId: variant.supplierId,
  };
}

export function EditVariantDialog({
  productId,
  variant,
  open,
  onOpenChange,
}: {
  productId: string;
  variant: ProductVariantItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMutation = useUpdateVariantMutation(productId);
  const supplierOptions = useSupplierOptionsQuery(open);

  const form = useForm<EditVariantFormInput>({
    resolver: zodResolver(editVariantFormSchema),
    defaultValues: toDefaults(variant),
  });

  async function onSubmit(values: EditVariantFormInput) {
    try {
      await updateMutation.mutateAsync({
        variantId: variant.id,
        input: {
          lowStockThreshold: values.lowStockThreshold,
          alertEnabled: values.alertEnabled,
          leadTimeDays: values.leadTimeDays,
          minOrderQty: values.minOrderQty,
          supplierId: values.supplierId,
        },
      });
      toast.success('Varian diperbarui', { description: `Pengaturan ${variant.name} disimpan.` });
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal memperbarui varian', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah {variant.variantGroup ? 'subvarian' : 'varian'}</DialogTitle>
          <DialogDescription>{formatVariantLabel(variant)}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="leadTimeDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead time (hari)</FormLabel>
                    <FormControl>
                      <NumberInput min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>0 = pakai default global.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minOrderQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. qty pesan</FormLabel>
                    <FormControl>
                      <NumberInput min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>MOQ — 0 = tanpa minimum.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stok menipis di</FormLabel>
                    <FormControl>
                      <NumberInput min={0} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alertEnabled"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peringatan stok menipis</FormLabel>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="alert-enabled"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked)}
                      />
                      <Label htmlFor="alert-enabled" className="text-sm font-normal">
                        {field.value ? 'Aktif' : 'Nonaktif'}
                      </Label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pemasok utama</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? ''}
                      onChange={(event) =>
                        field.onChange(event.target.value === '' ? null : event.target.value)
                      }
                    >
                      <option value="">Tanpa pemasok</option>
                      {(supplierOptions.data ?? []).map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormDescription>
                    Lead time/MOQ pemasok dipakai saat field varian di atas kosong.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan perubahan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
