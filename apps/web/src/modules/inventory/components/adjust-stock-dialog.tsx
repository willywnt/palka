'use client';

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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';

import { useAdjustStockMutation, useVariantInventoryQuery } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';
import { MANUAL_STOCK_REASONS } from '../utils/stock-math';
import { adjustStockFormSchema, type AdjustStockFormInput } from '../validators/adjust-stock';

const DEFAULT_VALUES: AdjustStockFormInput = {
  direction: 'add',
  quantity: 1,
  reason: 'RESTOCK',
  note: '',
};

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

  const direction = form.watch('direction');
  const currentStock = data?.snapshot.availableStock ?? availableStock;

  async function onSubmit(values: AdjustStockFormInput) {
    const delta = values.direction === 'add' ? values.quantity : -values.quantity;

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
      form.reset({ ...values, quantity: 1, note: '' });
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

        <div className="bg-muted/40 flex items-center justify-between rounded-lg border px-4 py-3">
          <span className="text-muted-foreground text-sm">Available now</span>
          <span className="text-2xl font-semibold tabular-nums">{currentStock}</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['add', 'remove'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => form.setValue('direction', value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors',
                    direction === value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  {value === 'add' ? 'Add stock' : 'Remove stock'}
                </button>
              ))}
            </div>

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {MANUAL_STOCK_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => field.onChange(reason)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          field.value === reason
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        {stockReasonLabel(reason)}
                      </button>
                    ))}
                  </div>
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
              {adjustMutation.isPending ? 'Saving...' : 'Apply adjustment'}
            </Button>
          </form>
        </Form>

        {data && data.ledger.length > 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Recent movements
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {data.ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        entry.delta >= 0 ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      {entry.delta >= 0 ? '+' : ''}
                      {entry.delta}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {stockReasonLabel(entry.reason)}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-right text-xs">
                    <div className="tabular-nums">= {entry.balanceAfter}</div>
                    <div suppressHydrationWarning>{formatDateTime(entry.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
