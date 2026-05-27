import { RECORDING_MODULE_CONFIG } from '@/modules/recordings/types';
import { RECORDING_RECOVERY_CONFIG } from '../types';

type DevSimulator = {
  simulateOffline: () => void;
  simulateOnline: () => void;
  simulateStaleLock: () => void;
  simulateFailedUpload: (temporaryId: string) => Promise<void>;
};

function assertDevEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Recovery dev simulator is only available in development.');
  }
}

export function createRecoveryDevSimulator(): DevSimulator {
  return {
    simulateOffline() {
      assertDevEnvironment();
      window.dispatchEvent(new Event('offline'));
    },

    simulateOnline() {
      assertDevEnvironment();
      window.dispatchEvent(new Event('online'));
    },

    simulateStaleLock() {
      assertDevEnvironment();
      const staleTimestamp = Date.now() - RECORDING_RECOVERY_CONFIG.sessionLockStaleMs - 1_000;
      localStorage.setItem(
        RECORDING_MODULE_CONFIG.tabLockKey,
        JSON.stringify({ tabId: 'dev-stale-tab', updatedAt: staleTimestamp }),
      );
    },

    async simulateFailedUpload(temporaryId: string) {
      assertDevEnvironment();
      const { recordingRecoveryService } = await import('../services/recording-recovery.service');
      await recordingRecoveryService.updateUploadStatus(
        temporaryId,
        'FAILED',
        'Simulated upload failure (dev)',
      );
    },
  };
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as Window & { __olshopRecoveryDev?: DevSimulator }).__olshopRecoveryDev =
    createRecoveryDevSimulator();
}
