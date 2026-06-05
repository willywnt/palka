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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { useCreateProductMutation } from '../hooks/use-products';
import { variantBlocksToLeaves } from '../utils/variants';
import { createProductFormSchema, type CreateProductFormInput } from '../validators/create-product';
import { EMPTY_VARIANT_BLOCK, VariantBlocksField } from './variant-blocks-field';

const DEFAULT_VALUES: CreateProductFormInput = {
  name: '',
  category: '',
  description: '',
  variants: [{ ...EMPTY_VARIANT_BLOCK }],
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
        variants: variantBlocksToLeaves(values.variants),
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Add one or more variants now, or remove them all to create the product on its own.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Product name</FormLabel>
                    <FormControl>
                      <Input placeholder="Kaos Polos Cotton" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Short description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="text-sm font-medium">Variants</p>
              <p className="text-muted-foreground text-xs">
                Each variant is a standalone SKU, or a group of subvariants (e.g. colors).
              </p>
            </div>

            <VariantBlocksField minBlocks={0} addLabel="Add variant" />

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
