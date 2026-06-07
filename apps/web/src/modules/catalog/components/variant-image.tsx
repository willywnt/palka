'use client';

import { ImageUploadPopover } from '@/components/image-upload-popover';

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
  const upload = useUploadVariantImageMutation(productId);
  const remove = useRemoveVariantImageMutation(productId);

  return (
    <ImageUploadPopover
      imageUrl={imageUrl}
      label={label}
      title="Variant photo"
      busy={upload.isPending || remove.isPending}
      onUpload={async (file) => {
        await upload.mutateAsync({ variantId, file });
      }}
      onRemove={async () => {
        await remove.mutateAsync(variantId);
      }}
    />
  );
}
