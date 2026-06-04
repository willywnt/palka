import type { ReturnStatus } from '@prisma/client';

export const returnKeys = {
  all: ['returns'] as const,
  list: (status?: ReturnStatus) => ['returns', 'list', status ?? 'all'] as const,
  detail: (id: string) => ['returns', 'detail', id] as const,
};
