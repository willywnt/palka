export const orderKeys = {
  all: ['orders'] as const,
  list: ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  byResi: (noResi: string) => ['orders', 'by-resi', noResi] as const,
};
