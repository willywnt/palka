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
import { Input } from '@/components/ui/input';

import { useAddVariantMutation } from '../hooks/use-products';
import { addVariantFormSchema, type AddVariantFormInput } from '../validators/create-product';

const DEFAULT_VALUES: AddVariantFormInput = {
  sku: '',
  name: '',
  price: 0,
  cost: 0,
  lowStockThreshold: 0,
  initialStock: 0,
  leadTimeDays: 0,
  minOrderQty: 0,
};

export function AddVariantDialog({
  productId,
  open,
  onOpenChange,
}: {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addMutation = useAddVariantMutation(productId);

  const form = useForm<AddVariantFormInput>({
    resolver: zodResolver(addVariantFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  async function onSubmit(values: AddVariantFormInput) {
    try {
      await addMutation.mutateAsync({
        sku: values.sku,
        name: values.name,
        price: values.price,
        cost: values.cost || undefined,
        lowStockThreshold: values.lowStockThreshold,
        initialStock: values.initialStock,
        alertEnabled: true,
        leadTimeDays: values.leadTimeDays || undefined,
        minOrderQty: values.minOrderQty || undefined,
      });
      toast.success('Variant added', { description: `${values.name} is now tracked.` });
      form.reset(DEFAULT_VALUES);
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not add variant', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset(DEFAULT_VALUES);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add variant</DialogTitle>
          <DialogDescription>Add another sellable variant to this product.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="KAOS-BLK-L" autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>Unique per account.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variant name</FormLabel>
                    <FormControl>
                      <Input placeholder="Black / L" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (IDR)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost (IDR)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>Modal price — drives stock value.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="initialStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial stock</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
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
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="leadTimeDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead time (days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>0 = global default.</FormDescription>
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
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>MOQ — 0 = none.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adding...' : 'Add variant'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
