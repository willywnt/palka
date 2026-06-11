'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  connectScannerPairing,
  reconnectScannerPairingSocket,
  setPairingQueryClient,
} from '../services/scanner-socket-manager.service';
import { getScannerSocket } from '../services/socket-client.service';
import { useScannerPairingStore } from '../store/scanner-pairing.store';
import type { PairingSessionSummary } from '../types';
import { pairingQueryKeys, useConnectPairingMutation } from './use-pairing-api';
import { usePairingSessionQuery } from './use-pairing-session-query';

export type MobileConnectPhase = 'auth' | 'invalid' | 'loading' | 'ready' | 'expired' | 'error';

function buildDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
  };
}

type UseMobilePairingConnectOptions = {
  pairingId: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
};

export function useMobilePairingConnect({
  pairingId,
  isAuthenticated,
  isAuthLoading,
}: UseMobilePairingConnectOptions) {
  const [phase, setPhase] = useState<MobileConnectPhase>(pairingId ? 'loading' : 'invalid');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectingRef = useRef(false);
  const linkedPairingIdRef = useRef<string | null>(null);

  const queryClient = useQueryClient();
  const setConnectionState = useScannerPairingStore((s) => s.setConnectionState);
  const connectionState = useScannerPairingStore((s) => s.connectionState);

  useEffect(() => {
    setPairingQueryClient(queryClient);
  }, [queryClient]);

  const connectMutation = useConnectPairingMutation();
  const connectApiRef = useRef(connectMutation.mutateAsync);
  connectApiRef.current = connectMutation.mutateAsync;

  const sessionQuery = usePairingSessionQuery(pairingId, isAuthenticated && Boolean(pairingId));

  const connectToStation = useCallback(
    async (options?: { silent?: boolean; socketOnly?: boolean }) => {
      if (!pairingId || !isAuthenticated || connectingRef.current) return;

      const currentSession = queryClient.getQueryData<PairingSessionSummary>(
        pairingQueryKeys.session(pairingId),
      );
      const alreadyLinked =
        linkedPairingIdRef.current === pairingId &&
        currentSession?.id === pairingId &&
        currentSession.status === 'CONNECTED';

      if (options?.socketOnly || (alreadyLinked && options?.silent)) {
        try {
          await reconnectScannerPairingSocket(pairingId, 'mobile');
          setConnectionState('connected');
          setPhase('ready');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Koneksi socket gagal.';
          if (!options?.silent) {
            setErrorMessage(message);
            setPhase('error');
          }
        }
        return;
      }

      if (linkedPairingIdRef.current === pairingId) {
        try {
          await reconnectScannerPairingSocket(pairingId, 'mobile');
          setConnectionState('connected');
          setPhase('ready');
        } catch {
          linkedPairingIdRef.current = null;
        }
        if (linkedPairingIdRef.current === pairingId) {
          return;
        }
      }

      connectingRef.current = true;
      if (!options?.silent) {
        setPhase('loading');
        setErrorMessage(null);
      }

      try {
        const connectedSession = await connectApiRef.current({
          pairingId,
          deviceInfo: buildDeviceInfo(),
        });

        queryClient.setQueryData(pairingQueryKeys.session(pairingId), connectedSession);
        linkedPairingIdRef.current = pairingId;

        await connectScannerPairing(pairingId, 'mobile');
        setConnectionState('connected');
        setPhase('ready');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';

        if (message.toLowerCase().includes('unauthorized') || code === 'UNAUTHORIZED') {
          setErrorMessage('Sign in with the same account as the desktop station.');
          setPhase('auth');
          return;
        }

        if (
          code === 'PAIRING_EXPIRED' ||
          code === 'PAIRING_NOT_PENDING' ||
          message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('no longer waiting')
        ) {
          setErrorMessage('This QR session expired. Scan a new code on the desktop.');
          setPhase('expired');
          return;
        }

        setErrorMessage(message);
        setPhase('error');
        useScannerPairingStore.getState().setSocketConnected(false);
        setConnectionState('disconnected');
      } finally {
        connectingRef.current = false;
      }
    },
    [isAuthenticated, pairingId, queryClient, setConnectionState],
  );

  useEffect(() => {
    linkedPairingIdRef.current = null;
  }, [pairingId]);

  useEffect(() => {
    if (!pairingId) {
      setPhase('invalid');
      return;
    }

    if (isAuthLoading) {
      setPhase('loading');
      return;
    }

    if (!isAuthenticated) {
      setPhase('auth');
      return;
    }

    void connectToStation();
    // Intentionally omit connectToStation — stable via refs; avoid connect API loop on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pairingId/auth gate only
  }, [pairingId, isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (!pairingId || !isAuthenticated) return;

    let visibilityTimer: ReturnType<typeof setTimeout> | undefined;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(visibilityTimer);
      visibilityTimer = setTimeout(() => {
        const socket = getScannerSocket();
        if (socket.connected) return;
        void connectToStation({ silent: true, socketOnly: true });
      }, 400);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void connectToStation({ silent: true, socketOnly: true });
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.clearTimeout(visibilityTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [connectToStation, isAuthenticated, pairingId]);

  useEffect(() => {
    if (!pairingId || !isAuthenticated || phase !== 'ready') return;

    const socket = getScannerSocket();

    const handleDisconnect = () => {
      void connectToStation({ silent: true, socketOnly: true }).then(() => {
        if (getScannerSocket().connected) {
          setConnectionState('connected');
        }
      });
    };

    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('disconnect', handleDisconnect);
    };
  }, [connectToStation, isAuthenticated, pairingId, phase, setConnectionState]);

  useEffect(() => {
    if (sessionQuery.data?.status === 'EXPIRED') {
      setPhase('expired');
      setErrorMessage('This QR session expired. Scan a new code on the desktop.');
    }
  }, [sessionQuery.data]);

  const retry = useCallback(() => {
    connectingRef.current = false;
    linkedPairingIdRef.current = null;
    void connectToStation();
  }, [connectToStation]);

  return {
    phase,
    errorMessage,
    connectionState,
    retry,
    isReconnecting: connectMutation.isPending,
    session: sessionQuery.data ?? null,
  };
}
