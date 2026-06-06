export type ShareLinkStatus = 'active' | 'revoked' | 'expired';

/**
 * A share link is usable only while it is neither revoked nor past its expiry.
 * `revoked` takes precedence over `expired` for clearer messaging.
 */
export function resolveShareLinkStatus(
  link: { revokedAt: Date | null; expiresAt: Date },
  now: Date,
): ShareLinkStatus {
  if (link.revokedAt !== null) return 'revoked';
  if (link.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function isShareLinkActive(
  link: { revokedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  return resolveShareLinkStatus(link, now) === 'active';
}
