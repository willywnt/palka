'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession, signIn, useSession } from 'next-auth/react';

type UseMobilePairingQrAuthOptions = {
  pairingId: string | null;
  pairingCode: string | null;
};

const CLAIM_ERROR_MESSAGE =
  'QR ini tidak bisa diverifikasi. Scan kode baru dari desktop, atau masuk manual.';

async function waitForClientSession(maxAttempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = await getSession();
    if (session?.user?.id) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
  }
  return false;
}

export function useMobilePairingQrAuth({ pairingId, pairingCode }: UseMobilePairingQrAuthOptions) {
  const { data: session, status, update } = useSession();
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const attemptedKeyRef = useRef<string | null>(null);

  const hasSession = Boolean(session?.user?.id);

  const runClaim = useCallback(async () => {
    if (!pairingId || !pairingCode) return;

    const attemptKey = `${pairingId}:${pairingCode}`;
    if (attemptedKeyRef.current === attemptKey) return;

    const existing = await getSession();
    if (existing?.user?.id) {
      setClaimError(null);
      return;
    }

    attemptedKeyRef.current = attemptKey;
    setIsClaiming(true);
    setClaimError(null);

    const result = await signIn('credentials', {
      pairingId,
      pairingCode,
      redirect: false,
    });

    await update();

    const signedIn = (await waitForClientSession()) || Boolean((await getSession())?.user?.id);

    setIsClaiming(false);

    if (signedIn) {
      setClaimError(null);
      return;
    }

    if (!result?.ok || result?.error) {
      setClaimError(CLAIM_ERROR_MESSAGE);
    }
  }, [pairingCode, pairingId, update]);

  useEffect(() => {
    if (!pairingId || !pairingCode) return;
    if (hasSession || status === 'authenticated') {
      setClaimError(null);
      return;
    }
    if (status === 'loading' || isClaiming) return;

    void runClaim();
  }, [hasSession, isClaiming, pairingCode, pairingId, runClaim, status]);

  const retryClaim = useCallback(() => {
    attemptedKeyRef.current = null;
    setClaimError(null);
    void runClaim();
  }, [runClaim]);

  const isAuthenticated = hasSession || status === 'authenticated';

  return {
    isAuthenticated,
    isAuthLoading: status === 'loading' || isClaiming,
    isClaiming,
    claimError: isAuthenticated ? null : claimError,
    retryClaim,
  };
}
