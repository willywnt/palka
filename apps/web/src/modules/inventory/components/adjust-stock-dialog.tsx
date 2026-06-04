'use client';

import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useAdjustStockMutation, useVariantInventoryQuery } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';
import { type ManualStockReason } from '../utils/stock-math';
import { adjustStockFormSchema, type AdjustStockFormInput } from '../validators/adjust-stock';

const DEFAULT_VALUES: AdjustStockFormInput = {
  mode: 'adjust',
  direction: 'add',
  quantity: 1,
  reason: 'RESTOCK',
  note: '',
};

const directionOptions = [
  { label: 'Add', value: 'add' },
  { label: 'Remove', value: 'remove' },
];

/** Reasons that make sense for the chosen action — keeps the options relevant. */
function allowedReasons(mode: 'adjust' | 'set', direction: 'add' | 'remove'): ManualStockReason[] {
  if (mode === 'set') return ['RECONCILE', 'MANUAL_ADJUST'];
  return direction === 'add'
    ? ['RESTOCK', 'MANUAL_ADJUST', 'RECONCILE']
    : ['DAMAGE', 'MANUAL_ADJUST', 'RECONCILE'];
}

export function AdjustStockDialog({
  variantId,
  variantLabel,
  availableStock,
  open,
  onOpenChange,
  onAdjusted,
}: {
  variantId: string;
  variantLabel: string;
  availableStock: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted?: () => void;
}) {
  const adjustMutation = useAdjustStockMutation(variantId);
  const { data } = useVariantInventoryQuery(open ? variantId : null);

  const form = useForm<AdjustStockFormInput>({
    resolver: zodResolver(adjustStockFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const mode = form.watch('mode');
  const direction = form.watch('direction');
  const quantity = Number(form.watch('quantity')) || 0;
  const currentStock = data?.snapshot.availableStock ?? availableStock;

  const reasons = useMemo(() => allowedReasons(mode, direction), [mode, direction]);

  // Keep the selected reason valid for the current action.
  useEffect(() => {
    const current = form.getValues('reason');
    if (!reasons.some((reason) => reason === current)) {
      form.setValue('reason', reasons[0] ?? 'MANUAL_ADJUST');
    }
  }, [reasons, form]);

  const resultStock =
    mode === 'set'
      ? quantity
      : direction === 'add'
        ? currentStock + quantity
        : currentStock - quantity;

  async function onSubmit(values: AdjustStockFormInput) {
    const delta =
      values.mode === 'set'
        ? values.quantity - currentStock
        : values.direction === 'add'
          ? values.quantity
          : -values.quantity;

    if (delta === 0) {
      toast.info(values.mode === 'set' ? `Stock is already ${currentStock}.` : 'Enter a quantity.');
      return;
    }

    try {
      const result = await adjustMutation.mutateAsync({
        delta,
        reason: values.reason,
        note: values.note.trim() || undefined,
      });
      toast.success('Stock updated', {
        description: `Available is now ${result.inventory.availableStock}.`,
      });
      onAdjusted?.();
      form.reset({ ...values, quantity: values.mode === 'set' ? values.quantity : 1, note: '' });
    } catch (error) {
      toast.error('Adjustment failed', {
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
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>{variantLabel}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['adjust', 'set'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => form.setValue('mode', value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    mode === value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  {value === 'adjust' ? 'Adjust by' : 'Set to'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {mode === 'adjust' ? (
                <FormField
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Direction</FormLabel>
                      <Select
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value as 'add' | 'remove')}
                        aria-label="Direction"
                      >
                        {directionOptions.map((direction) => (
                          <option key={direction.value} value={direction.value}>
                            {direction.label}
                          </option>
                        ))}
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{mode === 'set' ? 'New stock count' : 'Quantity'}</FormLabel>
                    <FormControl>
                      <NumberInput min={mode === 'set' ? 0 : 1} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="bg-muted/40 flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Available after</span>
              <span className="flex items-center gap-2 font-semibold tabular-nums">
                <span className="text-muted-foreground">{currentStock}</span>→
                <span className={cn('text-base', resultStock < 0 && 'text-destructive')}>
                  {resultStock}
                </span>
              </span>
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <Select
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    aria-label="Reason"
                  >
                    {reasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {stockReasonLabel(reason)}
                      </option>
                    ))}
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={1} placeholder="e.g. supplier delivery #123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending
                ? 'Saving...'
                : mode === 'set'
                  ? 'Set stock'
                  : 'Apply adjustment'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
