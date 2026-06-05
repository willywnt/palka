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
import { Form } from '@/components/ui/form';

import { useAddVariantMutation } from '../hooks/use-products';
import { variantBlocksToLeaves } from '../utils/variants';
import { addVariantFormSchema, type AddVariantFormInput } from '../validators/add-variant';
import { EMPTY_VARIANT_BLOCK, VariantBlocksField } from './variant-blocks-field';

const DEFAULT_VALUES: AddVariantFormInput = { variants: [{ ...EMPTY_VARIANT_BLOCK }] };

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
      const created = await addMutation.mutateAsync(variantBlocksToLeaves(values.variants));
      toast.success('Variant added', {
        description: `${created.length} ${created.length === 1 ? 'item' : 'items'} added.`,
      });
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add variant</DialogTitle>
          <DialogDescription>
            A variant can stand on its own, or hold several subvariants (e.g. colors or sizes).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <VariantBlocksField minBlocks={1} addLabel="Add another variant" />

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
