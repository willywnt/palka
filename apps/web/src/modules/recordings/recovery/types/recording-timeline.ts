export const RECORDING_TIMELINE_EVENT_TYPES = {
  RECORDING_STARTED: 'RECORDING_STARTED',
  UPLOAD_INTERRUPTED: 'UPLOAD_INTERRUPTED',
  UPLOAD_RESUMED: 'UPLOAD_RESUMED',
  UPLOAD_COMPLETED: 'UPLOAD_COMPLETED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  CAMERA_DISCONNECTED: 'CAMERA_DISCONNECTED',
  RECORDING_PRESERVED: 'RECORDING_PRESERVED',
} as const;

export type RecordingTimelineEventType =
  (typeof RECORDING_TIMELINE_EVENT_TYPES)[keyof typeof RECORDING_TIMELINE_EVENT_TYPES];

export type RecordingTimelineEvent = {
  type: RecordingTimelineEventType;
  at: string;
  message: string;
};

export const TIMELINE_EVENT_LABELS: Record<RecordingTimelineEventType, string> = {
  RECORDING_STARTED: 'Recording started',
  UPLOAD_INTERRUPTED: 'Upload interrupted',
  UPLOAD_RESUMED: 'Upload resumed',
  UPLOAD_COMPLETED: 'Upload completed',
  UPLOAD_FAILED: 'Upload failed',
  CAMERA_DISCONNECTED: 'Camera disconnected',
  RECORDING_PRESERVED: 'Recording preserved locally',
};

export function createTimelineEvent(
  type: RecordingTimelineEventType,
  message?: string,
): RecordingTimelineEvent {
  return {
    type,
    at: new Date().toISOString(),
    message: message ?? TIMELINE_EVENT_LABELS[type],
  };
}
