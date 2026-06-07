'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useDisposeDamagedMutation } from '../hooks/use-inventory';

/**
 * Dispose (write off) units from a variant's damaged bucket — e.g. binned after a
 * return. Available is untouched; the quantity is capped at what's damaged.
 */
export function WriteOffDamagedDialog({
  variantId,
  variantLabel,
  damagedStock,
  open,
  onOpenChange,
}: {
  variantId: string;
  variantLabel: string;
  damagedStock: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispose = useDisposeDamagedMutation(variantId);
  const [quantity, setQuantity] = useState(String(damagedStock));
  const [note, setNote] = useState('');

  const parsed = Number(quantity);
  const isValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= damagedStock;

  async function handleSubmit() {
    if (!isValid) return;
    try {
      await dispose.mutateAsync({ quantity: parsed, note: note.trim() || undefined });
      toast.success('Damaged stock written off', {
        description: `Wrote off ${parsed} unit(s).`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('Write-off failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Write off damaged stock</DialogTitle>
          <DialogDescription>{variantLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/40 flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">In the damaged bucket</span>
            <span className="font-semibold tabular-nums">{damagedStock}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-qty">Quantity to dispose</Label>
            <Input
              id="writeoff-qty"
              type="number"
              min={1}
              max={damagedStock}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Removes from the damaged bucket only — available stock is unchanged.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-note">Note (optional)</Label>
            <Textarea
              id="writeoff-note"
              rows={2}
              placeholder="e.g. binned, beyond repair"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={dispose.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!isValid || dispose.isPending}
          >
            <Trash2 className="size-4" />
            {dispose.isPending ? 'Writing off...' : 'Write off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
