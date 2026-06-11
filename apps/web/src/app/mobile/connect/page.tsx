'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import type { PairingPurpose } from '@prisma/client';

import { MobileScannerView } from '@/modules/scanner-pairing/components/mobile-scanner-view';
import {
  pairingCodeSchema,
  pairingIdSchema,
  pairingPurposeSchema,
} from '@/modules/scanner-pairing/validators/pairing';
import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';

const PAIRING_STORAGE_KEY = 'falka-mobile-pairing-id';
const PAIRING_CODE_STORAGE_KEY = 'falka-mobile-pairing-code';
const PAIRING_PURPOSE_STORAGE_KEY = 'falka-mobile-pairing-purpose';

function parseCodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export default function MobileConnectPage() {
  const searchParams = useSearchParams();
  const pairingParam = searchParams.get('pairing') ?? '';
  const codeParam = searchParams.get('code') ?? '';
  const purposeParam = searchParams.get('purpose') ?? '';
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<PairingPurpose | null>(null);

  useEffect(() => {
    const fromUrlPurpose = pairingPurposeSchema.safeParse(purposeParam.trim());
    if (fromUrlPurpose.success) {
      sessionStorage.setItem(PAIRING_PURPOSE_STORAGE_KEY, fromUrlPurpose.data);
      setPurpose(fromUrlPurpose.data);
    } else {
      const stored = sessionStorage.getItem(PAIRING_PURPOSE_STORAGE_KEY);
      const parsed = stored ? pairingPurposeSchema.safeParse(stored) : null;
      if (parsed?.success) setPurpose(parsed.data);
    }

    const fromUrlId = pairingIdSchema.safeParse(pairingParam.trim());
    const fromUrlCode = pairingCodeSchema.safeParse(parseCodeParam(codeParam));

    if (fromUrlId.success) {
      sessionStorage.setItem(PAIRING_STORAGE_KEY, fromUrlId.data);
      setPairingId(fromUrlId.data);
    } else if (pairingParam) {
      sessionStorage.removeItem(PAIRING_STORAGE_KEY);
      setPairingId(null);
    }

    if (fromUrlCode.success) {
      sessionStorage.setItem(PAIRING_CODE_STORAGE_KEY, fromUrlCode.data);
      setPairingCode(fromUrlCode.data);
    } else if (codeParam) {
      sessionStorage.removeItem(PAIRING_CODE_STORAGE_KEY);
      setPairingCode(null);
    }

    if (fromUrlId.success && fromUrlCode.success) {
      return;
    }

    if (pairingParam || codeParam) {
      return;
    }

    try {
      const storedId = sessionStorage.getItem(PAIRING_STORAGE_KEY);
      const storedCode = sessionStorage.getItem(PAIRING_CODE_STORAGE_KEY);
      const parsedId = storedId ? pairingIdSchema.safeParse(storedId) : null;
      const parsedCode = storedCode ? pairingCodeSchema.safeParse(storedCode) : null;

      if (parsedId?.success) {
        setPairingId(parsedId.data);
      }
      if (parsedCode?.success) {
        setPairingCode(parsedCode.data);
      }
    } catch {
      setPairingId(null);
      setPairingCode(null);
    }
  }, [codeParam, pairingParam, purposeParam]);

  const loginHref = useMemo(() => {
    const id = pairingId ?? pairingParam;
    const code = pairingCode ?? codeParam;
    const params = new URLSearchParams();
    if (id) params.set('pairing', id);
    if (code) params.set('code', code);
    const returnPath = params.size > 0 ? `/mobile/connect?${params.toString()}` : '/mobile/connect';
    return `/login?callbackUrl=${encodeURIComponent(returnPath)}`;
  }, [codeParam, pairingCode, pairingId, pairingParam]);

  if (!isMobileScannerEnabled()) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-medium">Scanner HP belum tersedia</h1>
        <p className="text-muted-foreground text-sm">
          Fitur ini belum aktif di server ini. Coba lagi nanti, ya.
        </p>
      </main>
    );
  }

  if (pairingParam && !pairingId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-primary size-8 animate-spin" />
      </main>
    );
  }

  return (
    <MobileScannerView
      pairingId={pairingId}
      pairingCode={pairingCode}
      purpose={purpose}
      loginHref={loginHref}
    />
  );
}
