/** Maximum recording duration in seconds (30 minutes). */
export const MAX_RECORDING_DURATION_SECONDS = 30 * 60;

/** Target webcam recording width in pixels. */
export const RECORDING_WIDTH = 1280;

/** Target webcam recording height in pixels. */
export const RECORDING_HEIGHT = 720;

/** Target webcam recording frame rate. */
export const RECORDING_FPS = 24;

/** Target video bitrate minimum in bits per second (800 kbps). */
export const RECORDING_BITRATE_MIN_BPS = 800_000;

/** Target video bitrate maximum in bits per second (1200 kbps). */
export const RECORDING_BITRATE_MAX_BPS = 1_200_000;

/** Target video bitrate in bits per second (1 Mbps). */
export const RECORDING_BITRATE_BPS = 1_000_000;

/** Supported recording MIME type. */
export const RECORDING_MIME_TYPE = 'video/webm' as const;

/** Maximum upload file size in bytes (500 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

/** Presigned upload URL expiry in seconds (5 minutes). */
export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 5 * 60;

/** Presigned read URL expiry in seconds (1 hour — playback & download). */
export const PRESIGNED_ACCESS_EXPIRY_SECONDS = 60 * 60;

/** Allowed direct-upload MIME types. */
export const ALLOWED_UPLOAD_MIME_TYPES = ['video/webm'] as const;

/** Allowed direct-upload file extensions. */
export const ALLOWED_UPLOAD_EXTENSIONS = ['.webm'] as const;

/** Default storage quota per user in bytes (500 MB). */
export const DEFAULT_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

/** Usage percent at which to show a storage warning. */
export const STORAGE_QUOTA_WARNING_PERCENT = 80;

/** Usage percent at which to show a critical storage warning. */
export const STORAGE_QUOTA_CRITICAL_PERCENT = 95;

/** Maximum concurrent uploads per user. */
export const MAX_CONCURRENT_UPLOADS = 3;

/** API rate limit: requests per minute per user. */
export const API_RATE_LIMIT_PER_MINUTE = 120;

/** Login attempts per IP per 15 minutes. */
export const LOGIN_RATE_LIMIT_PER_WINDOW = 10;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** Upload presign requests per user per minute. */
export const UPLOAD_RATE_LIMIT_PER_MINUTE = 30;

/** Recording start/create requests per user per minute. */
export const RECORDING_RATE_LIMIT_PER_MINUTE = 20;

/** Auth API requests per IP per minute. */
export const AUTH_RATE_LIMIT_PER_MINUTE = 60;

/** Own-password-change confirm attempts per user per window (caps current-password guessing on a
 *  hijacked session before a takeover). */
export const PASSWORD_CHANGE_RATE_LIMIT_PER_WINDOW = 5;
export const PASSWORD_CHANGE_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** Inventory sync batch size. */
export const INVENTORY_SYNC_BATCH_SIZE = 100;

/** Audit log retention in days. */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/** In-app notification retention in days (one row per business event). */
export const NOTIFICATION_RETENTION_DAYS = 90;

/** Completed recording retention before automated cleanup (days). */
export const RECORDING_RETENTION_DAYS = 30;

/** Stale RECORDING/UPLOADING session threshold (hours). */
export const STALE_RECORDING_SESSION_HOURS = 24;

/** Failed upload metadata cleanup threshold (days). */
export const FAILED_UPLOAD_RETENTION_DAYS = 7;

/** Default BullMQ job retry attempts. */
export const JOB_DEFAULT_ATTEMPTS = 5;

/** Default BullMQ job backoff delay in milliseconds. */
export const JOB_DEFAULT_BACKOFF_MS = 5_000;

/** Pagination defaults. */
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
