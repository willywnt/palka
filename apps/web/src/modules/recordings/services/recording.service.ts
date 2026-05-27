import { RecordingError } from '../errors/recording-errors';
import {
  blobToUploadFile,
  getMediaRecorderOptions,
  getRecordingConstraints,
  getSupportedRecordingMimeType,
  isMediaRecorderSupported,
  normalizeRecordingMimeType,
} from '../utils/media-recorder';

type RecorderStopResult = {
  blob: Blob;
  mimeType: string;
};

type DisconnectHandler = () => void;

export class RecordingService {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private disconnectHandler: DisconnectHandler | null = null;
  private mimeType: string | null = null;
  private disconnectNotified = false;
  private streamInactiveHandler: (() => void) | null = null;
  private trackEndedHandlers = new Map<MediaStreamTrack, () => void>();

  private notifyDisconnect(): void {
    if (this.disconnectNotified || !this.disconnectHandler) return;
    this.disconnectNotified = true;
    this.disconnectHandler();
  }

  assertBrowserSupport(): void {
    if (!isMediaRecorderSupported()) {
      throw RecordingError.unsupportedBrowser();
    }

    if (!getSupportedRecordingMimeType()) {
      throw RecordingError.unsupportedBrowser();
    }
  }

  async requestStream(deviceId?: string): Promise<MediaStream> {
    this.assertBrowserSupport();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(getRecordingConstraints(deviceId));
      this.stream = stream;
      return stream;
    } catch (error) {
      throw RecordingError.fromUnknown(error);
    }
  }

  startRecording(stream: MediaStream, onDisconnect: DisconnectHandler): void {
    const mimeType = getSupportedRecordingMimeType();

    if (!mimeType) {
      throw RecordingError.unsupportedBrowser();
    }

    this.mimeType = mimeType;
    this.chunks = [];
    this.disconnectHandler = onDisconnect;
    this.disconnectNotified = false;

    const recorder = new MediaRecorder(stream, getMediaRecorderOptions(mimeType));
    this.recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.streamInactiveHandler = () => {
      this.notifyDisconnect();
    };
    stream.addEventListener('inactive', this.streamInactiveHandler);

    for (const track of stream.getTracks()) {
      const onTrackEnded = () => {
        this.notifyDisconnect();
      };
      this.trackEndedHandlers.set(track, onTrackEnded);
      track.addEventListener('ended', onTrackEnded);
    }

    recorder.start(1000);
  }

  async stopRecording(): Promise<RecorderStopResult> {
    const recorder = this.recorder;
    const mimeType = this.mimeType ?? 'video/webm';

    if (!recorder || recorder.state === 'inactive') {
      throw RecordingError.recordingInterrupted();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => {
        reject(RecordingError.recordingInterrupted());
      };

      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: mimeType }));
      };

      recorder.stop();
    });

    return { blob, mimeType: normalizeRecordingMimeType(mimeType) };
  }

  createUploadFile(blob: Blob, filename: string): File {
    return blobToUploadFile(blob, filename);
  }

  cleanup(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // Ignore stop errors during cleanup.
      }
    }

    if (this.stream) {
      if (this.streamInactiveHandler) {
        this.stream.removeEventListener('inactive', this.streamInactiveHandler);
      }

      for (const track of this.stream.getTracks()) {
        const handler = this.trackEndedHandlers.get(track);
        if (handler) {
          track.removeEventListener('ended', handler);
        }
        track.stop();
      }
    }

    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.disconnectHandler = null;
    this.mimeType = null;
    this.disconnectNotified = false;
    this.streamInactiveHandler = null;
    this.trackEndedHandlers.clear();
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }
}

export const recordingService = new RecordingService();
