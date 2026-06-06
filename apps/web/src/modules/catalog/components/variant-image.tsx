'use client';

import { useRef, type ChangeEvent } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import {
  useRemoveVariantImageMutation,
  useUploadVariantImageMutation,
} from '../hooks/use-products';

export function VariantImage({
  productId,
  variantId,
  imageUrl,
  label,
}: {
  productId: string;
  variantId: string;
  imageUrl: string | null;
  /** Variant display name, for the alt text + popover heading. */
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadVariantImageMutation(productId);
  const remove = useRemoveVariantImageMutation(productId);
  const busy = upload.isPending || remove.isPending;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await upload.mutateAsync({ variantId, file });
      toast.success('Photo updated');
    } catch (error) {
      toast.error('Could not upload photo', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync(variantId);
      toast.success('Photo removed');
    } catch (error) {
      toast.error('Could not remove photo', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Variant photo"
          className="bg-muted hover:ring-primary/40 relative size-10 shrink-0 overflow-hidden rounded border transition hover:ring-2"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 image on a dynamic host
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <ImageIcon className="size-4" />
            </span>
          )}
          {busy ? (
            <span className="bg-background/60 absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-3.5 animate-spin" />
            </span>
          ) : null}
          <span className="sr-only">Variant photo</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFile}
        />

        <p className="truncate text-sm font-medium" title={label}>
          {label}
        </p>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 image on a dynamic host
          <img
            src={imageUrl}
            alt={label}
            className="aspect-square w-full rounded-md border object-cover"
          />
        ) : (
          <div className="bg-muted/30 text-muted-foreground flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-xs">
            No photo
          </div>
        )}

        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {imageUrl ? 'Replace' : 'Upload'}
          </Button>
          {imageUrl ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="text-destructive"
              disabled={busy}
              onClick={() => void onRemove()}
              title="Delete photo"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Delete photo</span>
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
