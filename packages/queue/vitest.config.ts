import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the marketplace-sync orchestration (the live stock-write path).
 * Node environment; the Prisma/provider/token boundaries are mocked per-test, so
 * no DB, Redis, or real marketplace API is touched.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    clearMocks: true,
  },
});
