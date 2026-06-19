import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(packageRoot, '../..');
const envPath = resolve(monorepoRoot, '.env');

if (!existsSync(envPath)) {
  console.error(`Missing ${envPath}`);
  console.error('Run: cp .env.example .env  (from the monorepo root)');
  process.exit(1);
}

config({ path: envPath, quiet: true });

const [, , command, ...args] = process.argv;

if (!command) {
  console.error('Usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
  cwd: packageRoot,
});

process.exit(result.status ?? 1);
