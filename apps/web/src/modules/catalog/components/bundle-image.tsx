'use client';

import { ImageUploadPopover } from '@/components/image-upload-popover';

import { useRemoveBundleImageMutation, useUploadBundleImageMutation } from '../hooks/use-bundles';

export function BundleImage({
  bundleId,
  imageUrl,
  label,
}: {
  bundleId: string;
  imageUrl: string | null;
  /** Bundle display name, for the alt text + popover heading. */
  label: string;
}) {
  const upload = useUploadBundleImageMutation(bundleId);
  const remove = useRemoveBundleImageMutation(bundleId);

  return (
    <ImageUploadPopover
      imageUrl={imageUrl}
      label={label}
      title="Bundle photo"
      busy={upload.isPending || remove.isPending}
      onUpload={async (file) => {
        await upload.mutateAsync(file);
      }}
      onRemove={async () => {
        await remove.mutateAsync();
      }}
    />
  );
}
