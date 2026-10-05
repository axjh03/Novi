import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webapp = resolve(root, 'webapp');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function run(label, command, args, cwd = root, extraEnv = {}) {
  console.log(`\n========================================`);
  console.log(`[FIX] ${label}`);
  console.log(`========================================`);
  const combinedEnv = {
    ...process.env,
    ...loadEnv(resolve(webapp, '.env')),
    ...loadEnv(resolve(webapp, '.env.access')),
    ...extraEnv,
  };
  if (!combinedEnv.DIRECT_URL && combinedEnv.DATABASE_URL) {
    combinedEnv.DIRECT_URL = combinedEnv.DATABASE_URL;
  }
  const cmd = command.includes(' ') ? `"${command}"` : command;
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: combinedEnv, shell: true });
  if (res.error) {
    console.error(`Failed to execute ${label}:`, res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`\n[FIX ERROR] ${label} failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

async function main() {
  console.log('>>> Novi / Astra Repair & Sync Script <<<');

  // 1. Install root dependencies if missing or updated
  run('Installing Root Dependencies', npmCmd, ['install'], root);

  // 2. Install webapp dependencies
  run('Installing Webapp Dependencies', npmCmd, ['install'], webapp);

  // 3. Generate Prisma Client
  run('Generating Prisma Client', npmCmd, ['run', 'db:generate'], webapp);

  // 4. Run local database setup if needed
  if (!existsSync(resolve(webapp, '.env.access'))) {
    run('Setting Up Webapp Database (.env.access)', npmCmd, ['run', 'setup'], webapp);
  }

  // 5. Type-check Electron
  run('Type-checking Electron', npmCmd, ['run', 'typecheck'], root);

  // 6. Type-check Webapp
  run('Type-checking Webapp', npmCmd, ['run', 'typecheck'], webapp);

  // 7. Full Build Verification
  run('Building Electron & Web App', process.execPath, [resolve(root, 'scripts/run.mjs'), 'build'], root);

  console.log('\n========================================');
  console.log('✓ All issues fixed and project build verified!');
  console.log('  You can now run .\\scripts\\build-and-run.bat or .\\scripts\\dev.bat');
  console.log('========================================\n');
}

main().catch(err => {
  console.error('[FIX FATAL ERROR]', err);
  process.exit(1);
});
