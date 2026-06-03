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
import { Textarea } from '@/components/ui/textarea';

import { useCreateProductMutation } from '../hooks/use-products';
import { createProductFormSchema, type CreateProductFormInput } from '../validators/create-product';

const DEFAULT_VALUES: CreateProductFormInput = {
  name: '',
  category: '',
  description: '',
  variant: {
    sku: '',
    name: '',
    price: 0,
    cost: 0,
    lowStockThreshold: 0,
    initialStock: 0,
    leadTimeDays: 0,
    minOrderQty: 0,
  },
};

export function ProductFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateProductMutation();

  const form = useForm<CreateProductFormInput>({
    resolver: zodResolver(createProductFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  async function onSubmit(values: CreateProductFormInput) {
    try {
      await createMutation.mutateAsync({
        name: values.name,
        description: values.description.trim() || undefined,
        category: values.category.trim() || undefined,
        variant: {
          sku: values.variant.sku,
          name: values.variant.name,
          price: values.variant.price,
          cost: values.variant.cost || undefined,
          lowStockThreshold: values.variant.lowStockThreshold,
          initialStock: values.variant.initialStock,
          alertEnabled: true,
          leadTimeDays: values.variant.leadTimeDays || undefined,
          minOrderQty: values.variant.minOrderQty || undefined,
        },
      });
      toast.success('Product created', { description: `${values.name} is now in your catalog.` });
      form.reset(DEFAULT_VALUES);
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not create product', {
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Create a product with its first variant. Stock and pricing are tracked per variant.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product name</FormLabel>
                  <FormControl>
                    <Input placeholder="Kaos Polos Cotton" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Apparel" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={1} placeholder="Short description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">First variant</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="variant.sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="KAOS-BLK-M" autoComplete="off" {...field} />
                      </FormControl>
                      <FormDescription>Unique per account.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="variant.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variant name</FormLabel>
                      <FormControl>
                        <Input placeholder="Black / M" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="variant.price"
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
                  name="variant.cost"
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
                  name="variant.initialStock"
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
                  name="variant.lowStockThreshold"
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
                  name="variant.leadTimeDays"
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
                  name="variant.minOrderQty"
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
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create product'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
