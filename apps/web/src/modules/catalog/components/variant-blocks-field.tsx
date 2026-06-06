'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Wand2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';

import { suggestVariantSku } from '../utils/variants';
import type { VariantBlockForm } from '../validators/add-variant';

/** Any form that hosts the variant builder exposes a `variants` array of blocks. */
type VariantBuilderForm = { variants: VariantBlockForm[] };

const EMPTY_SUBVARIANT = {
  name: '',
  sku: '',
  price: 0,
  cost: 0,
  initialStock: 0,
  lowStockThreshold: 0,
};

/** Default values for one fresh variant block — dialogs seed their form with this. */
export const EMPTY_VARIANT_BLOCK: VariantBlockForm = {
  variantName: '',
  hasOptions: false,
  single: { sku: '', price: 0, cost: 0, initialStock: 0, lowStockThreshold: 0 },
  subvariants: [],
};

/**
 * The variant builder: a list of variant blocks, each a standalone SKU or a group
 * of subvariants. Reads the host form via context, so it works in any dialog whose
 * form has a `variants` array. `minBlocks` keeps that many blocks un-removable.
 */
export function VariantBlocksField({
  minBlocks = 0,
  addLabel = 'Add variant',
}: {
  minBlocks?: number;
  addLabel?: string;
}) {
  const form = useFormContext<VariantBuilderForm>();
  const blocks = useFieldArray({ control: form.control, name: 'variants' });

  return (
    <div className="space-y-3">
      {blocks.fields.map((field, index) => (
        <VariantBlockFields
          key={field.id}
          index={index}
          canRemove={blocks.fields.length > minBlocks}
          onRemove={() => blocks.remove(index)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => blocks.append({ ...EMPTY_VARIANT_BLOCK })}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

function VariantBlockFields({
  index,
  canRemove,
  onRemove,
}: {
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContext<VariantBuilderForm>();
  const subvariants = useFieldArray({
    control: form.control,
    name: `variants.${index}.subvariants`,
  });
  const hasOptions = form.watch(`variants.${index}.hasOptions`);

  function onVariantNameChange(name: string) {
    if (!form.getValues(`variants.${index}.hasOptions`)) {
      if (!form.getValues(`variants.${index}.single.sku`).trim()) {
        form.setValue(`variants.${index}.single.sku`, suggestVariantSku(name));
      }
      return;
    }
    form.getValues(`variants.${index}.subvariants`).forEach((row, subIndex) => {
      if (row.name.trim() && !row.sku.trim()) {
        form.setValue(
          `variants.${index}.subvariants.${subIndex}.sku`,
          suggestVariantSku(name, row.name),
        );
      }
    });
  }

  function onToggleOptions(next: boolean) {
    form.setValue(`variants.${index}.hasOptions`, next);
    if (next && form.getValues(`variants.${index}.subvariants`).length === 0) {
      subvariants.append({ ...EMPTY_SUBVARIANT });
    }
  }

  const subError = form.formState.errors.variants?.[index]?.subvariants;
  const subErrorMessage = typeof subError?.message === 'string' ? subError.message : undefined;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <FormField
          control={form.control}
          name={`variants.${index}.variantName`}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel required>Variant name</FormLabel>
              <FormControl>
                <Input
                  placeholder="iPhone 16"
                  autoComplete="off"
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    onVariantNameChange(event.target.value);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6 shrink-0"
            onClick={onRemove}
          >
            <X className="size-4" />
            <span className="sr-only">Remove variant</span>
          </Button>
        ) : null}
      </div>

      <FormField
        control={form.control}
        name={`variants.${index}.hasOptions`}
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <FormLabel>This variant has options</FormLabel>
              <FormDescription>
                Add subvariants like colors or sizes, each with its own SKU & stock.
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={onToggleOptions} />
            </FormControl>
          </FormItem>
        )}
      />

      {hasOptions ? (
        <div className="space-y-3">
          {subvariants.fields.map((row, subIndex) => (
            <div key={row.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <FormField
                  control={form.control}
                  name={`variants.${index}.subvariants.${subIndex}.name`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel required>Option name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Hitam"
                          autoComplete="off"
                          {...field}
                          onChange={(event) => {
                            field.onChange(event);
                            const skuPath =
                              `variants.${index}.subvariants.${subIndex}.sku` as const;
                            if (!form.getValues(skuPath).trim()) {
                              form.setValue(
                                skuPath,
                                suggestVariantSku(
                                  form.getValues(`variants.${index}.variantName`),
                                  event.target.value,
                                ),
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
                  name={`variants.${index}.subvariants.${subIndex}.sku`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel required>SKU</FormLabel>
                      <div className="flex gap-1">
                        <FormControl>
                          <Input placeholder="IPHONE-16-HITAM" autoComplete="off" {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title="Generate SKU"
                          onClick={() =>
                            form.setValue(
                              `variants.${index}.subvariants.${subIndex}.sku`,
                              suggestVariantSku(
                                form.getValues(`variants.${index}.variantName`),
                                form.getValues(`variants.${index}.subvariants.${subIndex}.name`),
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 shrink-0"
                  onClick={() => subvariants.remove(subIndex)}
                >
                  <X className="size-4" />
                  <span className="sr-only">Remove subvariant</span>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name={`variants.${index}.subvariants.${subIndex}.price`}
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
                  name={`variants.${index}.subvariants.${subIndex}.cost`}
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
                  name={`variants.${index}.subvariants.${subIndex}.initialStock`}
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
                  name={`variants.${index}.subvariants.${subIndex}.lowStockThreshold`}
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
            onClick={() => subvariants.append({ ...EMPTY_SUBVARIANT })}
          >
            <Plus className="size-4" />
            Add option
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name={`variants.${index}.single.sku`}
            render={({ field }) => (
              <FormItem>
                <FormLabel required>SKU</FormLabel>
                <div className="flex gap-1">
                  <FormControl>
                    <Input placeholder="IPHONE-16" autoComplete="off" {...field} />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="Generate SKU"
                    onClick={() =>
                      form.setValue(
                        `variants.${index}.single.sku`,
                        suggestVariantSku(form.getValues(`variants.${index}.variantName`)),
                      )
                    }
                  >
                    <Wand2 className="size-4" />
                    <span className="sr-only">Generate SKU</span>
                  </Button>
                </div>
                <FormDescription>Unique per account.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`variants.${index}.single.price`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price (IDR)</FormLabel>
                <FormControl>
                  <NumberInput min={0} step={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`variants.${index}.single.cost`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost (IDR)</FormLabel>
                <FormControl>
                  <NumberInput min={0} step={1} {...field} />
                </FormControl>
                <FormDescription>Modal price — drives stock value.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`variants.${index}.single.initialStock`}
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
            name={`variants.${index}.single.lowStockThreshold`}
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
      )}
    </div>
  );
}
