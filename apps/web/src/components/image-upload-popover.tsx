'use client';

import { useRef, type ChangeEvent } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ImageThumb } from '@/components/image-thumb';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Thumbnail button → popover to upload / replace / remove an image. Pure UI: the
 * caller passes the mutations as `onUpload`/`onRemove` (kept in their module), so
 * this stays a shared component for variant photos, bundle photos, and future
 * image fields without crossing a module boundary. Owns the busy spinner + toasts.
 */
export function ImageUploadPopover({
  imageUrl,
  label,
  title,
  busy,
  onUpload,
  onRemove,
}: {
  imageUrl: string | null;
  /** Display name, for alt text + popover heading. */
  label: string;
  /** What this image is, for the trigger title + sr-only text (e.g. "Variant photo"). */
  title: string;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await onUpload(file);
      toast.success('Photo updated');
    } catch (error) {
      toast.error('Could not upload photo', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleRemove() {
    try {
      await onRemove();
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
          title={title}
          className="hover:ring-primary/40 relative shrink-0 rounded transition hover:ring-2"
        >
          <ImageThumb src={imageUrl} alt={label} />
          {busy ? (
            <span className="bg-background/60 absolute inset-0 flex items-center justify-center rounded">
              <Loader2 className="size-3.5 animate-spin" />
            </span>
          ) : null}
          <span className="sr-only">{title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
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
              onClick={() => void handleRemove()}
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
