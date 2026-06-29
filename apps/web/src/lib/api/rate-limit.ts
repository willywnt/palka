import 'server-only';

import {
  API_RATE_LIMIT_PER_MINUTE,
  AUTH_RATE_LIMIT_PER_MINUTE,
  LOGIN_RATE_LIMIT_PER_WINDOW,
  LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  PASSWORD_CHANGE_RATE_LIMIT_PER_WINDOW,
  PASSWORD_CHANGE_RATE_LIMIT_WINDOW_SECONDS,
  RECORDING_RATE_LIMIT_PER_MINUTE,
  UPLOAD_RATE_LIMIT_PER_MINUTE,
} from '@palka/config/limits';
import {
  buildIpRateLimitKey,
  buildUserRateLimitKey,
  checkRateLimit,
  type RateLimitResult,
} from '@palka/rate-limit';

import { AppError } from '@/lib/errors';

export type RateLimitScope =
  | 'login'
  | 'auth'
  | 'upload'
  | 'recording'
  | 'write'
  | 'password-change';

export async function enforceRateLimit(
  scope: RateLimitScope,
  identifiers: { ip: string; userId?: string },
): Promise<RateLimitResult> {
  switch (scope) {
    case 'login':
      // Fail CLOSED: during a Redis outage, refuse logins rather than let credential-stuffing
      // through uncapped (the secure direction for an auth control; Redis is a required prod dep).
      return checkRateLimit({
        key: buildIpRateLimitKey('login', identifiers.ip),
        limit: LOGIN_RATE_LIMIT_PER_WINDOW,
        windowSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        failClosed: true,
      });
    case 'auth':
      // Fail CLOSED: the unauthenticated register/auth action throttle (invite-code + email
      // enumeration) must not evaporate when Redis is down.
      return checkRateLimit({
        key: buildIpRateLimitKey('auth', identifiers.ip),
        limit: AUTH_RATE_LIMIT_PER_MINUTE,
        windowSeconds: 60,
        failClosed: true,
      });
    case 'upload':
      if (!identifiers.userId) {
        return {
          allowed: true,
          limit: UPLOAD_RATE_LIMIT_PER_MINUTE,
          remaining: UPLOAD_RATE_LIMIT_PER_MINUTE,
          retryAfterSeconds: 0,
        };
      }
      return checkRateLimit({
        key: buildUserRateLimitKey('upload', identifiers.userId),
        limit: UPLOAD_RATE_LIMIT_PER_MINUTE,
        windowSeconds: 60,
      });
    case 'recording':
      if (!identifiers.userId) {
        return {
          allowed: true,
          limit: RECORDING_RATE_LIMIT_PER_MINUTE,
          remaining: RECORDING_RATE_LIMIT_PER_MINUTE,
          retryAfterSeconds: 0,
        };
      }
      return checkRateLimit({
        key: buildUserRateLimitKey('recording', identifiers.userId),
        limit: RECORDING_RATE_LIMIT_PER_MINUTE,
        windowSeconds: 60,
      });
    case 'write':
      // Generic abuse/runaway ceiling for authenticated write mutations
      // (POS sale/refund, PO receive/cancel, opname post, marketplace sync).
      // Per-user; correctness (double-submit) is owned by the per-entity
      // advisory locks, this is only a safety net.
      if (!identifiers.userId) {
        return {
          allowed: true,
          limit: API_RATE_LIMIT_PER_MINUTE,
          remaining: API_RATE_LIMIT_PER_MINUTE,
          retryAfterSeconds: 0,
        };
      }
      return checkRateLimit({
        key: buildUserRateLimitKey('write', identifiers.userId),
        limit: API_RATE_LIMIT_PER_MINUTE,
        windowSeconds: 60,
      });
    case 'password-change':
      // Per-user cap on own-password-change confirms — bounds current-password guessing on a
      // hijacked session (the route is authenticated, so userId is present here).
      if (!identifiers.userId) {
        return {
          allowed: true,
          limit: PASSWORD_CHANGE_RATE_LIMIT_PER_WINDOW,
          remaining: PASSWORD_CHANGE_RATE_LIMIT_PER_WINDOW,
          retryAfterSeconds: 0,
        };
      }
      return checkRateLimit({
        key: buildUserRateLimitKey('password-change', identifiers.userId),
        limit: PASSWORD_CHANGE_RATE_LIMIT_PER_WINDOW,
        windowSeconds: PASSWORD_CHANGE_RATE_LIMIT_WINDOW_SECONDS,
      });
    default:
      return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
  }
}

export function assertRateLimitAllowed(result: RateLimitResult): void {
  if (result.allowed) return;

  throw new AppError('Too many requests. Please try again later.', 'RATE_LIMITED', 429, {
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    ...(result.retryAfterSeconds > 0 ? { 'Retry-After': String(result.retryAfterSeconds) } : {}),
  };
}
