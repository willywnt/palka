export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Email atau password salah.',
  UNAUTHORIZED: 'Kamu harus masuk dulu untuk melanjutkan.',
  FORBIDDEN: 'Kamu tidak punya akses untuk tindakan ini.',
  EMAIL_TAKEN: 'Email ini sudah terdaftar.',
  ACCOUNT_DISABLED: 'Akun ini sudah tidak aktif.',
  VALIDATION_ERROR: 'Periksa lagi isianmu, ya.',
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? AUTH_ERROR_MESSAGES[code]);
    this.name = 'AuthError';
    this.code = code;
  }

  static invalidCredentials() {
    return new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }

  static unauthorized(message?: string) {
    return new AuthError(AUTH_ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message?: string) {
    return new AuthError(AUTH_ERROR_CODES.FORBIDDEN, message);
  }

  static emailTaken() {
    return new AuthError(AUTH_ERROR_CODES.EMAIL_TAKEN);
  }

  static accountDisabled() {
    return new AuthError(AUTH_ERROR_CODES.ACCOUNT_DISABLED);
  }
}
