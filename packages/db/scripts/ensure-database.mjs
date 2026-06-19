import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

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
  return spawnSync('docker', ['compose', ...args, '-f', composeFile], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: monorepoRoot,
  });
}

function tryStartWindowsPostgresService() {
  if (process.platform !== 'win32') return false;

  console.log('Attempting to start local PostgreSQL service...');

  const script = `
    $services = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue
    if (-not $services) { exit 1 }
    foreach ($service in $services) {
      if ($service.Status -ne 'Running') {
        Start-Service -Name $service.Name
      }
    }
    exit 0
  `;

  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });

  return result.status === 0;
}

async function canConnect() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function waitForDatabase(maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await canConnect()) {
      console.log('Database is ready.');
      return true;
    }
    console.log(`Waiting for database... (${attempt}/${maxAttempts})`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  return false;
}

export async function ensureDatabase() {
  if (!existsSync(envPath)) {
    console.error(`Missing ${envPath}`);
    console.error('Run from monorepo root: cp .env.example .env');
    process.exit(1);
  }

  if (await canConnect()) {
    console.log('Database already reachable.');
    return;
  }

  if (hasDocker()) {
    console.log('Starting PostgreSQL via Docker...');
    const result = runDockerCompose(['up', '-d']);
    if (result.status === 0 && (await waitForDatabase())) {
      return;
    }
  }

  if (tryStartWindowsPostgresService() && (await waitForDatabase())) {
    return;
  }

  console.error('\nCould not connect to PostgreSQL.\n');
  console.error('Choose one option:\n');
  console.error('1) Install Docker Desktop, then run:');
  console.error('     pnpm db:setup\n');
  console.error('2) Install PostgreSQL locally (Windows):');
  console.error('     winget install -e --id PostgreSQL.PostgreSQL.17');
  console.error('   Set DATABASE_URL in .env, create the database, then run:');
  console.error('     pnpm db:migrate:dev');
  console.error('     pnpm db:seed\n');
  console.error('Example DATABASE_URL:');
  console.error('  postgresql://postgres:YOUR_PASSWORD@localhost:5432/falka\n');
  process.exit(1);
}

if (process.argv[1]?.endsWith('ensure-database.mjs')) {
  await ensureDatabase();
}
