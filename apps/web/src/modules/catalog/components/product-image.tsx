'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Eye, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  useRemoveProductImageMutation,
  useUploadProductImageMutation,
} from '../hooks/use-products';

export function ProductImage({
  productId,
  imageUrl,
  productName,
}: {
  productId: string;
  imageUrl: string | null;
  productName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImageMutation(productId);
  const remove = useRemoveProductImageMutation(productId);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = upload.isPending || remove.isPending;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success('Photo updated');
    } catch (error) {
      toast.error('Could not upload photo', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function onConfirmDelete() {
    try {
      await remove.mutateAsync();
      setConfirmDelete(false);
      toast.success('Photo removed');
    } catch (error) {
      toast.error('Could not remove photo', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {imageUrl ? (
        <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 image on a dynamic host */}
          <img src={imageUrl} alt={productName} className="size-full object-cover" />
          {busy ? (
            <div className="bg-background/60 absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-7"
              onClick={() => setPreview(true)}
              title="Preview"
            >
              <Eye className="size-4" />
              <span className="sr-only">Preview</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-7"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              title="Replace"
            >
              <Upload className="size-4" />
              <span className="sr-only">Replace</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="text-destructive size-7"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="bg-muted/30 hover:bg-muted text-muted-foreground flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-6 animate-spin" /> : <ImageIcon className="size-6" />}
          {busy ? 'Uploading…' : 'Upload photo'}
        </button>
      )}

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{productName}</DialogTitle>
          </DialogHeader>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 image on a dynamic host
            <img
              src={imageUrl}
              alt={productName}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the product photo. You can upload a new one anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void onConfirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
