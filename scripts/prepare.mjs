/**
 * Skip Husky in CI / container builds where devDependencies are not installed.
 */
import { spawnSync } from 'node:child_process';

const skip = process.env.CI === 'true' || process.env.HUSKY === '0';

if (skip) {
  process.exit(0);
}

const result = spawnSync('husky', [], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 0);
