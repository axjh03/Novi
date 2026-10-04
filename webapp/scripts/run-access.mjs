import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';

// Load into the environment without passing env-file flags to Next's workers.
if (existsSync('.env')) loadEnvFile('.env');
if (existsSync('.env.access')) loadEnvFile('.env.access');
const [command, ...args] = process.argv.slice(2);
const entry = command === 'next' ? ['node_modules/next/dist/bin/next'] : command === 'prisma' ? ['node_modules/prisma/build/index.js'] : command === 'seed' ? ['--import', 'tsx', 'prisma/seed-access.ts'] : null;
if (!entry) throw new Error('Expected next, prisma, or seed.');
const result = spawnSync(process.execPath, [...entry, ...args], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
