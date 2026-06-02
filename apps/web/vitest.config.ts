import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url));

/**
 * Unit/integration tests for the core business logic that guards the two happy flows
 * (manual recording + mobile scanner pairing). Node environment only — no DOM, no DB,
 * no R2; collaborators at the Prisma/storage boundary are mocked per-test.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    clearMocks: true,
  },
  resolve: {
    alias: [
      // `server-only` throws when imported outside an RSC bundle; stub it for tests.
      { find: /^server-only$/, replacement: serverOnlyStub },
      // Mirror the tsconfig `@/*` path alias.
      { find: /^@\//, replacement: `${srcDir}/` },
    ],
  },
});
