'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type {
  ActiveRecordingSession,
  SaveRecordingMetadataPayload,
  SaveRecordingMetadataResponse,
  StartRecordingResponse,
} from '../types';
import { recordingsManagementKeys } from './use-recordings-management';

export const recordingQueryKeys = {
  all: ['recordings'] as const,
  active: ['recordings', 'active'] as const,
};

export function useActiveRecordingQuery() {
  return useQuery({
    queryKey: recordingQueryKeys.active,
    queryFn: async () => {
      const result = await apiFetch<ActiveRecordingSession | null>(
        `${apiRoutes.recordings}/active`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    staleTime: 15_000,
  });
}

export function useStartRecordingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noResi: string) => {
      const result = await apiFetch<StartRecordingResponse>(`${apiRoutes.recordings}/start`, {
        method: 'POST',
        body: { noResi },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingQueryKeys.active });
    },
  });
}

export function useSaveRecordingMetadataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveRecordingMetadataPayload) => {
      const result = await apiFetch<SaveRecordingMetadataResponse>(apiRoutes.recordings, {
        method: 'POST',
        body: payload,
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: recordingQueryKeys.active });
      void queryClient.invalidateQueries({ queryKey: recordingsManagementKeys.all });
    },
  });
}

export function useCancelRecordingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordingId: string) => {
      const result = await apiFetch<{ success: true }>(`${apiRoutes.recordings}/cancel`, {
        method: 'POST',
        body: { recordingId },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: recordingQueryKeys.active });
      void queryClient.invalidateQueries({ queryKey: recordingsManagementKeys.all });
    },
  });
}

export function useMarkUploadingMutation() {
  return useMutation({
    mutationFn: async (recordingId: string) => {
      const result = await apiFetch<{ success: true }>(`${apiRoutes.recordings}/uploading`, {
        method: 'POST',
        body: { recordingId },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}
