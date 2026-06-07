export const saleKeys = {
  all: ['sales'] as const,
  list: ['sales', 'list'] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
  variants: (q: string, page: number, pageSize: number) =>
    ['sales', 'variants', q, page, pageSize] as const,
};
