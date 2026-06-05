'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Render a set of short strings (SKU / barcode) to QR-code PNG data URLs for
 * printing. Generation is async, so a value only appears in the returned map
 * once its code is ready — callers gate the print action on full coverage.
 * Pass a referentially-stable `values` array (memoize it) to avoid re-runs.
 */
export function useQrCodes(values: readonly string[]): Map<string, string> {
  const [codes, setCodes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const unique = [...new Set(values)];

    void Promise.all(
      unique.map(async (value) => {
        // A short SKU/barcode never fails to encode; fall back to an empty data
        // URL so one odd value can't block the rest of the sheet.
        const dataUrl = await QRCode.toDataURL(value, { width: 240, margin: 0 }).catch(() => '');
        return [value, dataUrl] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setCodes(new Map(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [values]);

  return codes;
}
