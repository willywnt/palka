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

import { useUpdateVariantMutation } from '../hooks/use-products';
import type { ProductVariantItem } from '../types';
import { editVariantFormSchema, type EditVariantFormInput } from '../validators/update-variant';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function toDefaults(variant: ProductVariantItem): EditVariantFormInput {
  return {
    lowStockThreshold: variant.lowStockThreshold,
    alertEnabled: variant.alertEnabled,
    leadTimeDays: variant.leadTimeDays ?? 0,
    minOrderQty: variant.minOrderQty ?? 0,
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
        },
      });
      toast.success('Variant updated', { description: `${variant.name} planning saved.` });
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not update variant', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit variant</DialogTitle>
          <DialogDescription>
            {variant.name} · {variant.sku}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="leadTimeDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead time (days)</FormLabel>
                    <FormControl>
                      <NumberInput min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>0 = use the global default.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minOrderQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min order qty</FormLabel>
                    <FormControl>
                      <NumberInput min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>MOQ — 0 = no minimum.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low-stock at</FormLabel>
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
                    <FormLabel>Low-stock alert</FormLabel>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="alert-enabled"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked)}
                      />
                      <Label htmlFor="alert-enabled" className="text-sm font-normal">
                        {field.value ? 'Enabled' : 'Disabled'}
                      </Label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
