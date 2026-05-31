export const MARKETPLACE_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_CONNECTION: 'DUPLICATE_CONNECTION',
  DUPLICATE_ACCOUNT: 'DUPLICATE_ACCOUNT',
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  OAUTH_NOT_CONFIGURED: 'OAUTH_NOT_CONFIGURED',
  OAUTH_STATE_EXPIRED: 'OAUTH_STATE_EXPIRED',
  OAUTH_STATE_INVALID: 'OAUTH_STATE_INVALID',
  OAUTH_CALLBACK_ERROR: 'OAUTH_CALLBACK_ERROR',
  PROVIDER_EXCHANGE_FAILED: 'PROVIDER_EXCHANGE_FAILED',
  RECONNECT_REQUIRED: 'RECONNECT_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MAPPING_CONFLICT: 'MAPPING_CONFLICT',
  SYNC_FAILED: 'SYNC_FAILED',
  SYNC_RATE_LIMITED: 'SYNC_RATE_LIMITED',
  SYNC_MAPPING_INVALID: 'SYNC_MAPPING_INVALID',
  SYNC_PROVIDER_UNAVAILABLE: 'SYNC_PROVIDER_UNAVAILABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type MarketplaceErrorCode =
  (typeof MARKETPLACE_ERROR_CODES)[keyof typeof MARKETPLACE_ERROR_CODES];

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly statusCode: number;
  readonly operatorMessage: string;

  constructor(
    code: MarketplaceErrorCode,
    message: string,
    statusCode = 400,
    operatorMessage?: string,
  ) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    this.statusCode = statusCode;
    this.operatorMessage = operatorMessage ?? message;
  }

  static validation(message: string) {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.VALIDATION_ERROR, message, 400);
  }

  static duplicateConnection() {
    return MarketplaceError.duplicateAccount();
  }

  static duplicateAccount() {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.DUPLICATE_ACCOUNT,
      'This marketplace store is already connected.',
      409,
    );
  }

  static invalidProvider() {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.INVALID_PROVIDER,
      'Unsupported marketplace provider.',
      400,
    );
  }

  static notFound(message = 'Marketplace account not found.') {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.NOT_FOUND, message, 404);
  }

  static oauthNotConfigured(provider: string) {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.OAUTH_NOT_CONFIGURED,
      `${provider} OAuth is not configured yet.`,
      501,
      `${provider} OAuth is not set up on this server. Use manual connect or ask an admin to configure provider credentials.`,
    );
  }

  static expiredOAuthState() {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.OAUTH_STATE_EXPIRED,
      'OAuth state has expired.',
      400,
      'Your authorization session expired. Start the connect flow again from the marketplace dashboard.',
    );
  }

  static invalidOAuthState() {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.OAUTH_STATE_INVALID,
      'Invalid OAuth state.',
      400,
      'Authorization could not be verified. Start the connect flow again.',
    );
  }

  static oauthCallbackError(message: string) {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.OAUTH_CALLBACK_ERROR,
      message,
      400,
      message,
    );
  }

  static providerExchangeFailed(message: string) {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.PROVIDER_EXCHANGE_FAILED,
      message,
      502,
      'The marketplace provider rejected the authorization. Try reconnecting the store.',
    );
  }

  static reconnectRequired(message = 'Marketplace account requires reconnection.') {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.RECONNECT_REQUIRED,
      message,
      400,
      'This store needs to be reconnected before sync can continue.',
    );
  }

  static invalidToken(message = 'Marketplace token is invalid.') {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.INVALID_TOKEN,
      message,
      400,
      'Stored credentials are invalid. Reconnect the store with fresh authorization.',
    );
  }

  static mappingConflict(message: string) {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.MAPPING_CONFLICT, message, 409, message);
  }

  static syncFailed(message: string) {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.SYNC_FAILED, message, 502, message);
  }

  static syncNotFound(message = 'Sync job not found.') {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.NOT_FOUND, message, 404);
  }

  static tokenExpired() {
    return new MarketplaceError(
      MARKETPLACE_ERROR_CODES.TOKEN_EXPIRED,
      'Marketplace access token has expired.',
      400,
    );
  }

  static encryption(message = 'Failed to process marketplace credentials.') {
    return new MarketplaceError(MARKETPLACE_ERROR_CODES.ENCRYPTION_ERROR, message, 500);
  }
}
