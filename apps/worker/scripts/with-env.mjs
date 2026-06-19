import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(packageRoot, '../..');
const rootEnv = resolve(monorepoRoot, '.env');
const searchRoots = [packageRoot, monorepoRoot];

if (existsSync(rootEnv)) {
  config({ path: rootEnv, quiet: true });
}

const [, , command, ...args] = process.argv;

if (!command) {
  console.error('Usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(1);
}

function buildEnv() {
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const binDirs = searchRoots
    .map((root) => join(root, 'node_modules', '.bin'))
    .filter((dir) => existsSync(dir));

  return {
    ...process.env,
    // PATH is the inherited OS variable (prepend local .bin dirs), not a turbo-tracked
    // config var — declaring it in turbo.json would make it a cache key.
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    PATH: [...binDirs, process.env.PATH].filter(Boolean).join(pathSeparator),
  };
}

function resolveTsxCli() {
  for (const root of searchRoots) {
    const cliPath = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (existsSync(cliPath)) {
      return cliPath;
    }
  }

  return null;
}

function runCommand() {
  const env = buildEnv();

  if (command === 'tsx') {
    const tsxCli = resolveTsxCli();
    if (tsxCli) {
      return spawnSync(process.execPath, [tsxCli, ...args], {
        stdio: 'inherit',
        env,
        cwd: packageRoot,
      });
    }
  }

  return spawnSync(command, args, {
    stdio: 'inherit',
    env,
    cwd: packageRoot,
    shell: process.platform === 'win32',
  });
}

const result = runCommand();
process.exit(result.status ?? 1);
