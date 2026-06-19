import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { ensureDatabase } from './ensure-database.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(packageRoot, '../..');
const envPath = resolve(monorepoRoot, '.env');

config({ path: envPath, quiet: true });

function hasDocker() {
  const result = spawnSync('docker', ['--version'], {
    shell: process.platform === 'win32',
    stdio: 'ignore',
  });
  return result.status === 0;
}

function runDockerCompose(args) {
  const composeFile = resolve(monorepoRoot, 'docker-compose.yml');

  if (!existsSync(composeFile)) {
    console.error('docker-compose.yml not found.');
    process.exit(1);
  }

  if (!hasDocker()) {
    console.error('\nDocker is not installed or not in PATH.');
    console.error('Use local PostgreSQL instead:');
    console.error('  winget install -e --id PostgreSQL.PostgreSQL.17');
    console.error('  pnpm db:setup\n');
    process.exit(1);
  }

  const result = spawnSync('docker', ['compose', ...args, '-f', composeFile], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: monorepoRoot,
  });

  process.exit(result.status ?? 1);
}

const command = process.argv[2];

if (command === 'wait') {
  await ensureDatabase();
} else if (command === 'up') {
  runDockerCompose(['up', '-d']);
} else if (command === 'down') {
  runDockerCompose(['down']);
} else {
  console.error('Usage: node scripts/db-docker.mjs <up|down|wait>');
  process.exit(1);
}
