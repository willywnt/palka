'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PairingPurpose } from '@prisma/client';

import { apiFetch } from '@/lib/api/fetch-client';
import { apiRoutes } from '@/lib/api/routes';

import type {
  ActivePairingSessionResult,
  CreatePairingSessionResult,
  PairingSessionSummary,
} from '../types';

export const pairingQueryKeys = {
  active: ['scanner-pairing', 'active'] as const,
  session: (id: string) => ['scanner-pairing', id] as const,
};

export function useActivePairingQuery(enabled = true) {
  return useQuery({
    queryKey: pairingQueryKeys.active,
    queryFn: async () => {
      const result = await apiFetch<ActivePairingSessionResult>(apiRoutes.scannerPairing);
      if (!result.success) {
        if (result.error.code === 'UNAUTHORIZED') {
          return { session: null, connectUrl: null };
        }
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.session?.status;
      return status === 'PENDING' || status === 'CONNECTED' ? 3_000 : false;
    },
  });
}

export function useCreatePairingMutation(purpose: PairingPurpose = 'RECORDING') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<CreatePairingSessionResult>(apiRoutes.scannerPairing, {
        method: 'POST',
        body: { purpose },
      });
      if (!result.success) {
        const error = new Error(result.error.message) as Error & { code?: string };
        error.code = result.error.code;
        throw error;
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Populate the cache immediately so the dialog renders without a refetch.
      queryClient.setQueryData<ActivePairingSessionResult>(pairingQueryKeys.active, {
        session: data.session,
        connectUrl: data.connectUrl,
      });
    },
  });
}

export function useDisconnectPairingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pairingId: string) => {
      const result = await apiFetch<{ session: PairingSessionSummary }>(
        `${apiRoutes.scannerPairing}/${pairingId}`,
        { method: 'DELETE' },
      );
      if (!result.success) throw new Error(result.error.message);
      return result.data.session;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pairingQueryKeys.active });
    },
  });
}

export function useConnectPairingMutation() {
  return useMutation({
    mutationFn: async (input: {
      pairingId: string;
      deviceInfo?: {
        userAgent?: string;
        platform?: string;
        language?: string;
        screen?: string;
      };
    }) => {
      const result = await apiFetch<{ session: PairingSessionSummary }>(
        `${apiRoutes.scannerPairing}/connect`,
        {
          method: 'POST',
          body: input,
        },
      );
      if (!result.success) {
        const error = new Error(result.error.message) as Error & { code?: string };
        error.code = result.error.code;
        throw error;
      }
      return result.data.session;
    },
  });
}
