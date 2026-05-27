import { create } from 'zustand';

import type { TemporaryRecording } from '../types';

type RecordingReliabilityState = {
  isOnline: boolean;
  wasOffline: boolean;
  showReconnectPrompt: boolean;
  staleLockCleared: boolean;
  webcamDisconnected: boolean;
  temporaryRecordings: TemporaryRecording[];
  recoveryModalOpen: boolean;
  selectedRecoveryId: string | null;
  retryUploadProgress: number;
  isRetryingUpload: boolean;
  indexedDbAvailable: boolean;
  preferredCameraDeviceId: string | null;
  cameraRecoveryToken: number;
};

type RecordingReliabilityActions = {
  setOnline: (isOnline: boolean) => void;
  setShowReconnectPrompt: (show: boolean) => void;
  setStaleLockCleared: (cleared: boolean) => void;
  setWebcamDisconnected: (disconnected: boolean) => void;
  setTemporaryRecordings: (recordings: TemporaryRecording[]) => void;
  openRecoveryModal: (selectedId?: string | null) => void;
  closeRecoveryModal: () => void;
  setRetryUploadProgress: (progress: number) => void;
  setIsRetryingUpload: (isRetrying: boolean) => void;
  setIndexedDbAvailable: (available: boolean) => void;
  resetReconnectPrompt: () => void;
  setPreferredCameraDeviceId: (deviceId: string | null) => void;
  requestCameraRecovery: () => void;
};

export type RecordingReliabilityStore = RecordingReliabilityState & RecordingReliabilityActions;

export const useRecordingReliabilityStore = create<RecordingReliabilityStore>((set) => ({
  isOnline: true,
  wasOffline: false,
  showReconnectPrompt: false,
  staleLockCleared: false,
  webcamDisconnected: false,
  temporaryRecordings: [],
  recoveryModalOpen: false,
  selectedRecoveryId: null,
  retryUploadProgress: 0,
  isRetryingUpload: false,
  indexedDbAvailable: true,
  preferredCameraDeviceId: null,
  cameraRecoveryToken: 0,

  setOnline: (isOnline) =>
    set((state) => ({
      isOnline,
      wasOffline: !isOnline ? true : state.wasOffline,
      showReconnectPrompt: isOnline && state.wasOffline && state.temporaryRecordings.length > 0,
    })),
  setShowReconnectPrompt: (show) => set({ showReconnectPrompt: show }),
  setStaleLockCleared: (cleared) => set({ staleLockCleared: cleared }),
  setWebcamDisconnected: (disconnected) => set({ webcamDisconnected: disconnected }),
  setTemporaryRecordings: (recordings) => set({ temporaryRecordings: recordings }),
  openRecoveryModal: (selectedId = null) =>
    set({
      recoveryModalOpen: true,
      selectedRecoveryId: selectedId,
    }),
  closeRecoveryModal: () => set({ recoveryModalOpen: false, selectedRecoveryId: null }),
  setRetryUploadProgress: (progress) => set({ retryUploadProgress: progress }),
  setIsRetryingUpload: (isRetrying) => set({ isRetryingUpload: isRetrying }),
  setIndexedDbAvailable: (available) => set({ indexedDbAvailable: available }),
  resetReconnectPrompt: () => set({ showReconnectPrompt: false, wasOffline: false }),
  setPreferredCameraDeviceId: (deviceId) => set({ preferredCameraDeviceId: deviceId }),
  requestCameraRecovery: () =>
    set((state) => ({ cameraRecoveryToken: state.cameraRecoveryToken + 1 })),
}));
