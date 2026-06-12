import 'server-only';

import { Prisma } from '@prisma/client';

/** Max attempts for a code-collision retry (first try + 2 retries). */
const MAX_ATTEMPTS = 3;

function isCodeCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes('code')
  );
}

/**
 * Re-runs a whole transaction when its generated document code (S/RF/PO/OP —
 * `count + 1` inside the tx) collides with a concurrent writer in the same
 * organization. The unique index `[organizationId, code]` turns the race into
 * a P2002, the failed tx has rolled back, and the rerun recounts. Any other
 * error rethrows untouched.
 */
export async function retryOnCodeCollision<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isCodeCollision(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}
