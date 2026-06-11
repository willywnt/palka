/** Query-key hierarchy for stock-opname sessions. `all` invalidates everything. */
export const stockOpnameKeys = {
  all: ['stock-opname'] as const,
  list: (params: Record<string, number>) => ['stock-opname', 'list', params] as const,
  detail: (id: string) => ['stock-opname', 'detail', id] as const,
  variants: (q: string, page: number, pageSize: number) =>
    ['stock-opname', 'variants', { q, page, pageSize }] as const,
};
