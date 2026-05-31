export const SYNC_ERROR_CODES = {
  SYNC_FAILED: 'SYNC_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MAPPING_INVALID: 'MAPPING_INVALID',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  IDEMPOTENT_SKIP: 'IDEMPOTENT_SKIP',
} as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[keyof typeof SYNC_ERROR_CODES];

export class MarketplaceSyncError extends Error {
  readonly code: SyncErrorCode;
  readonly retryable: boolean;
  readonly operatorMessage: string;

  constructor(
    code: SyncErrorCode,
    message: string,
    options?: { retryable?: boolean; operatorMessage?: string },
  ) {
    super(message);
    this.name = 'MarketplaceSyncError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.operatorMessage = options?.operatorMessage ?? message;
  }

  static syncFailed(message: string, retryable = true) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.SYNC_FAILED, message, { retryable });
  }

  static rateLimited(message = 'Provider rate limit exceeded.') {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.RATE_LIMITED, message, {
      retryable: true,
      operatorMessage: 'Marketplace API rate limit reached. Sync will retry automatically.',
    });
  }

  static invalidToken(message = 'Marketplace access token is invalid or expired.') {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.INVALID_TOKEN, message, {
      retryable: false,
      operatorMessage: 'Store credentials expired. Reconnect the marketplace account.',
    });
  }

  static mappingInvalid(message: string) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.MAPPING_INVALID, message, {
      retryable: false,
      operatorMessage: message,
    });
  }

  static providerUnavailable(message = 'Marketplace provider is temporarily unavailable.') {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.PROVIDER_UNAVAILABLE, message, {
      retryable: true,
      operatorMessage: 'Marketplace API is temporarily unavailable. Sync will retry.',
    });
  }

  static accountDisabled(message = 'Marketplace account sync is disabled.') {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.ACCOUNT_DISABLED, message, {
      retryable: false,
      operatorMessage: message,
    });
  }
}
