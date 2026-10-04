import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const file = resolve('.env.access');
if (!existsSync(file)) {
  const secret = () => randomBytes(32).toString('hex');
  writeFileSync(file, [
    'DATABASE_URL="file:./access.db"', 'PORTAL_ORIGIN="http://localhost:3000"',
    `ACCESS_JWT_SECRET="${secret()}"`, `ACCESS_ENCRYPTION_KEY="${secret()}"`,
    'ADMIN_USERNAME="admin"', `ADMIN_PASSWORD="${secret()}"`,
    'SEED_DEMO="true"', `DEMO_PASSWORD="${secret()}"`, '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
}
const env = { ...process.env };
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  if (match) env[match[1]] = match[2];
}
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed-access.ts'], { env, stdio: 'inherit' });
console.log('Local setup complete. Credentials are in webapp/.env.access (not printed). Start with npm run dev.');
