import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(packageRoot, '../..');
const envPath = resolve(monorepoRoot, '.env');

if (existsSync(envPath)) {
  config({ path: envPath, quiet: true });
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for prisma migrate deploy');
  process.exit(1);
}

if (process.env.SKIP_DB_MIGRATE === '1') {
  console.log('SKIP_DB_MIGRATE=1 — skipping prisma migrate deploy');
  process.exit(0);
}

console.log('Applying pending Prisma migrations…');

const result = spawnSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
  cwd: packageRoot,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
