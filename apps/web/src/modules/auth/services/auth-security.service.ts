import 'server-only';

import { prisma } from '@palka/db';
import { logEvents, logger } from '@palka/logger/server';
import {
  buildIpRateLimitKey,
  buildUserRateLimitKey,
  getRateLimitStatus,
  incrementRateLimitCounter,
} from '@palka/rate-limit';

const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;
const FAILED_LOGIN_ALERT_THRESHOLD = 5;
const ACCOUNT_LOCK_THRESHOLD = 10;

export async function recordFailedLoginAttempt(email: string, ip: string): Promise<void> {
  await incrementRateLimitCounter({
    key: buildIpRateLimitKey('auth:failed-login', ip),
    limit: ACCOUNT_LOCK_THRESHOLD,
    windowSeconds: FAILED_LOGIN_WINDOW_SECONDS,
  });

  await incrementRateLimitCounter({
    key: buildUserRateLimitKey('auth:failed-login', email.toLowerCase()),
    limit: ACCOUNT_LOCK_THRESHOLD,
    windowSeconds: FAILED_LOGIN_WINDOW_SECONDS,
  });

  logEvents.authFailure('invalid_credentials', { email, ip });
}

export async function isLoginBlocked(email: string, ip: string): Promise<boolean> {
  // Fail CLOSED on both buckets: if Redis is down we can't read the counters, so treat the login as
  // blocked rather than silently lifting the brute-force lockout.
  const [ipResult, accountResult] = await Promise.all([
    getRateLimitStatus({
      key: buildIpRateLimitKey('auth:failed-login', ip),
      limit: ACCOUNT_LOCK_THRESHOLD,
      windowSeconds: FAILED_LOGIN_WINDOW_SECONDS,
      failClosed: true,
    }),
    getRateLimitStatus({
      key: buildUserRateLimitKey('auth:failed-login', email.toLowerCase()),
      limit: ACCOUNT_LOCK_THRESHOLD,
      windowSeconds: FAILED_LOGIN_WINDOW_SECONDS,
      failClosed: true,
    }),
  ]);

  return !ipResult.allowed || !accountResult.allowed;
}

export async function isSuspiciousLogin(email: string, ip: string): Promise<boolean> {
  const ipResult = await getRateLimitStatus({
    key: buildIpRateLimitKey('auth:failed-login', ip),
    limit: FAILED_LOGIN_ALERT_THRESHOLD,
    windowSeconds: FAILED_LOGIN_WINDOW_SECONDS,
  });

  return !ipResult.allowed;
}

export function recordSuccessfulLogin(userId: string, ip: string): void {
  logEvents.authSuccess(userId, 'credentials', { ip });

  // Best-effort last-login stamp for the Settings security view — fire-and-forget,
  // like audit logging: a failure here must never block or fail the login.
  void prisma.user
    .update({ where: { id: userId }, data: { lastLoginAt: new Date(), lastLoginIp: ip } })
    .catch((error: unknown) => {
      logger.warn('auth.last_login.stamp_failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

/** Reserved for future OAuth provider linking and token refresh flows. */
export type FutureAuthProvider = 'credentials' | 'shopee' | 'tokopedia';

export const SUPPORTED_AUTH_PROVIDERS: FutureAuthProvider[] = ['credentials'];
