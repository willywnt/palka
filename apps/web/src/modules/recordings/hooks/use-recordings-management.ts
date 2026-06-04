'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { storageQueryKeys } from '@/modules/storage/hooks/use-storage-quota';

import type {
  PaginatedRecordingsResponse,
  RecordingDetail,
  RecordingDownloadResponse,
  RecordingListItem,
  RecordingPlaybackResponse,
} from '../types';
import type { ListRecordingsQuery } from '../validators/list-recordings';
import { recordingKeys } from './recording-keys';

function buildListQueryString(query: ListRecordingsQuery): string {
  const params = new URLSearchParams();

  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  params.set('status', query.status);
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);

  if (query.search) {
    params.set('search', query.search);
  }

  return params.toString();
}

/** Completed packing videos for an exact tracking number — order/return evidence. */
export function useRecordingsByResiQuery(noResi: string | null, enabled = true) {
  const trimmed = noResi?.trim() ?? '';
  return useQuery({
    queryKey: recordingKeys.byResi(trimmed),
    queryFn: async () => {
      const result = await apiFetch<RecordingListItem[]>(
        `${apiRoutes.recordings}/by-resi?noResi=${encodeURIComponent(trimmed)}`,
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: trimmed.length > 0 && enabled,
  });
}

export function useRecordingsListQuery(query: ListRecordingsQuery) {
  return useQuery({
    queryKey: recordingKeys.list(query),
    queryFn: async () => {
      const result = await apiFetch<RecordingListItem[]>(
        `${apiRoutes.recordings}?${buildListQueryString(query)}`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return {
        items: result.data,
        meta: result.meta as PaginatedRecordingsResponse['meta'],
      } satisfies PaginatedRecordingsResponse;
    },
    placeholderData: (previous) => previous,
  });
}

export function useRecordingDetailQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: recordingKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<RecordingDetail>(`${apiRoutes.recordings}/${id}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useRecordingPlaybackQuery(recordingId: string | null, enabled = true) {
  return useQuery({
    queryKey: recordingKeys.playback(recordingId ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<RecordingPlaybackResponse>(
        `${apiRoutes.recordings}/${recordingId}/playback`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(recordingId) && enabled,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useDeleteRecordingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordingId: string) => {
      const result = await apiFetch<{ success: true }>(`${apiRoutes.recordings}/${recordingId}`, {
        method: 'DELETE',
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingKeys.library });
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.quota });
    },
  });
}

export function useDownloadRecordingMutation() {
  return useMutation({
    mutationFn: async (recordingId: string) => {
      const result = await apiFetch<RecordingDownloadResponse>(
        `${apiRoutes.recordings}/${recordingId}/download`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: (data) => {
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = data.filename;
      link.rel = 'noopener';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  });
}
