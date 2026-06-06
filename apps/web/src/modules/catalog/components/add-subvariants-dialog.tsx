'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Wand2, X } from 'lucide-react';
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
import { NumberInput } from '@/components/ui/number-input';

import { useAddVariantMutation } from '../hooks/use-products';
import { suggestVariantSku, variantBlockToLeaves } from '../utils/variants';
import { addSubvariantsFormSchema, type AddSubvariantsFormInput } from '../validators/add-variant';

const EMPTY_ROW = { name: '', sku: '', price: 0, cost: 0, initialStock: 0, lowStockThreshold: 0 };
const DEFAULT_VALUES: AddSubvariantsFormInput = { subvariants: [{ ...EMPTY_ROW }] };

export function AddSubvariantsDialog({
  productId,
  groupName,
  open,
  onOpenChange,
}: {
  productId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addMutation = useAddVariantMutation(productId);

  const form = useForm<AddSubvariantsFormInput>({
    resolver: zodResolver(addSubvariantsFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const rows = useFieldArray({ control: form.control, name: 'subvariants' });

  async function onSubmit(values: AddSubvariantsFormInput) {
    const leaves = variantBlockToLeaves({
      variantName: groupName,
      hasOptions: true,
      single: { sku: '', price: 0, cost: 0, initialStock: 0, lowStockThreshold: 0 },
      subvariants: values.subvariants,
    });

    try {
      const created = await addMutation.mutateAsync(leaves);
      toast.success('Subvariants added', {
        description: `${created.length} added to ${groupName}.`,
      });
      form.reset(DEFAULT_VALUES);
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not add subvariants', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const subError = form.formState.errors.subvariants?.message;
  const subErrorMessage = typeof subError === 'string' ? subError : undefined;

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
          <DialogTitle>Add subvariants</DialogTitle>
          <DialogDescription>
            New options under <span className="font-medium">{groupName}</span>, each with its own
            SKU & stock.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {rows.fields.map((row, index) => (
              <div key={row.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel required>Option name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Merah"
                            autoComplete="off"
                            {...field}
                            onChange={(event) => {
                              field.onChange(event);
                              if (!form.getValues(`subvariants.${index}.sku`).trim()) {
                                form.setValue(
                                  `subvariants.${index}.sku`,
                                  suggestVariantSku(groupName, event.target.value),
                                );
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.sku`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel required>SKU</FormLabel>
                        <div className="flex gap-1">
                          <FormControl>
                            <Input placeholder="IPHONE-16-MERAH" autoComplete="off" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            title="Generate SKU"
                            onClick={() =>
                              form.setValue(
                                `subvariants.${index}.sku`,
                                suggestVariantSku(
                                  groupName,
                                  form.getValues(`subvariants.${index}.name`),
                                ),
                              )
                            }
                          >
                            <Wand2 className="size-4" />
                            <span className="sr-only">Generate SKU</span>
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {rows.fields.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6 shrink-0"
                      onClick={() => rows.remove(index)}
                    >
                      <X className="size-4" />
                      <span className="sr-only">Remove subvariant</span>
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.price`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price</FormLabel>
                        <FormControl>
                          <NumberInput min={0} step={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.cost`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost</FormLabel>
                        <FormControl>
                          <NumberInput min={0} step={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.initialStock`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial stock</FormLabel>
                        <FormControl>
                          <NumberInput min={0} step={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`subvariants.${index}.lowStockThreshold`}
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
                </div>
              </div>
            ))}

            {subErrorMessage ? <p className="text-destructive text-sm">{subErrorMessage}</p> : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rows.append({ ...EMPTY_ROW })}
            >
              <Plus className="size-4" />
              Add option
            </Button>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adding...' : 'Add subvariants'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
