import { Prisma } from '@prisma/client';

/** True for a Prisma unique-constraint violation (P2002) — e.g. a duplicate SKU. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
