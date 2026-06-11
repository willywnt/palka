import { DomainError } from '@/lib/errors';

export const PAIRING_ERROR_CODES = {
  PAIRING_EXPIRED: 'PAIRING_EXPIRED',
  PAIRING_NOT_FOUND: 'PAIRING_NOT_FOUND',
  PAIRING_NOT_PENDING: 'PAIRING_NOT_PENDING',
  PAIRING_NOT_CONNECTED: 'PAIRING_NOT_CONNECTED',
  PAIRING_FORBIDDEN: 'PAIRING_FORBIDDEN',
  PAIRING_ALREADY_ACTIVE: 'PAIRING_ALREADY_ACTIVE',
  SCANNER_DISCONNECTED: 'SCANNER_DISCONNECTED',
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  RECORDING_ALREADY_ACTIVE: 'RECORDING_ALREADY_ACTIVE',
  WEBCAM_UNAVAILABLE: 'WEBCAM_UNAVAILABLE',
  RECOVERY_MODAL_ACTIVE: 'RECOVERY_MODAL_ACTIVE',
  UPLOAD_IN_PROGRESS: 'UPLOAD_IN_PROGRESS',
  TAB_LOCK_CONFLICT: 'TAB_LOCK_CONFLICT',
  DUPLICATE_SCAN: 'DUPLICATE_SCAN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type PairingErrorCode = (typeof PAIRING_ERROR_CODES)[keyof typeof PAIRING_ERROR_CODES];

export const PAIRING_ERROR_MESSAGES: Record<PairingErrorCode, string> = {
  PAIRING_EXPIRED: 'Sesi pairing ini sudah kedaluwarsa. Buat kode QR baru di station desktop.',
  PAIRING_NOT_FOUND: 'Sesi pairing tidak ditemukan. Scan kode QR baru dari station rekaman.',
  PAIRING_NOT_PENDING: 'Sesi pairing ini sudah tidak menunggu scanner ponsel.',
  PAIRING_NOT_CONNECTED: 'Scanner ponsel belum terhubung. Sambungkan ulang dari ponsel kamu.',
  PAIRING_FORBIDDEN: 'Kamu tidak punya akses ke sesi pairing ini.',
  PAIRING_ALREADY_ACTIVE:
    'Sudah ada scanner ponsel yang terhubung. Putuskan dulu sebelum pairing lagi.',
  SCANNER_DISCONNECTED: 'Scanner ponsel terputus. Sambungkan ulang dengan scan kode QR lagi.',
  CAMERA_PERMISSION_DENIED:
    'Izin kamera dibutuhkan buat scan barcode. Izinkan akses kamera di pengaturan browser kamu.',
  RECORDING_ALREADY_ACTIVE:
    'Masih ada perekaman yang berjalan. Hentikan dulu sebelum scan barcode baru.',
  WEBCAM_UNAVAILABLE: 'Webcam belum siap. Cek izin kamera di station rekaman.',
  RECOVERY_MODAL_ACTIVE:
    'Selesaikan atau tutup dulu pemulihan rekaman yang tertunda sebelum perekaman baru dimulai otomatis.',
  UPLOAD_IN_PROGRESS: 'Tunggu upload yang sedang berjalan selesai sebelum mulai perekaman baru.',
  TAB_LOCK_CONFLICT: 'Perekaman lagi aktif di tab browser lain pada station ini.',
  DUPLICATE_SCAN: 'Barcode ini baru saja di-scan. Tunggu sebentar sebelum scan lagi.',
  VALIDATION_ERROR: 'Data barcode atau pairing tidak valid.',
  UNKNOWN: 'Terjadi error tak terduga pada pairing scanner.',
};

export class PairingError extends DomainError {
  declare readonly code: PairingErrorCode;

  constructor(code: PairingErrorCode, message?: string, statusCode = 400) {
    super(code, message ?? PAIRING_ERROR_MESSAGES[code], statusCode);
    this.name = 'PairingError';
  }

  static expired() {
    return new PairingError(PAIRING_ERROR_CODES.PAIRING_EXPIRED);
  }

  static notFound() {
    return new PairingError(PAIRING_ERROR_CODES.PAIRING_NOT_FOUND, undefined, 404);
  }

  static forbidden() {
    return new PairingError(PAIRING_ERROR_CODES.PAIRING_FORBIDDEN, undefined, 403);
  }

  static notConnected() {
    return new PairingError(PAIRING_ERROR_CODES.PAIRING_NOT_CONNECTED);
  }

  static duplicateScan() {
    return new PairingError(PAIRING_ERROR_CODES.DUPLICATE_SCAN);
  }

  static validation(message: string) {
    return new PairingError(PAIRING_ERROR_CODES.VALIDATION_ERROR, message);
  }
}
