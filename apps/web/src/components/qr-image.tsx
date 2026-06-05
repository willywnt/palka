'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { cn } from '@/lib/utils';

type QrImageProps = {
  /** The value to encode (e.g. a product barcode or SKU). */
  value: string;
  /** Rendered pixel size (square). */
  size?: number;
  className?: string;
};

/** Renders a QR code for `value` as a PNG, generated on the client on demand. */
export function QrImage({ value, size = 160, className }: QrImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Render at 2× for crisp display/print; margin 2 keeps a scannable quiet zone.
    void QRCode.toDataURL(value, { width: size * 2, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={cn('bg-muted animate-pulse rounded', className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic QR data URL
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      className={className}
    />
  );
}
