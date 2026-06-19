import type { Prisma } from '@prisma/client';

export function getPrismaLogLevels(): Prisma.LogLevel[] | Prisma.LogDefinition[] {
  if (process.env.NODE_ENV === 'development') {
    const levels: Prisma.LogDefinition[] = [
      { emit: 'stdout', level: 'error' },
      { emit: 'stdout', level: 'warn' },
    ];

    // Per-query logging floods the dev terminal; opt in with PRISMA_LOG_QUERY=1 when debugging SQL.
    if (process.env.PRISMA_LOG_QUERY === '1') {
      levels.unshift({ emit: 'stdout', level: 'query' });
    }

    return levels;
  }

  return [{ emit: 'stdout', level: 'error' }];
}
