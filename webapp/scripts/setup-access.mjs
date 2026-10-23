import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const file = resolve('.env.access');
if (!existsSync(file)) {
  const secret = () => randomBytes(32).toString('hex');
  writeFileSync(file, [
    '# A separate development PostgreSQL database, for example a second free Supabase project.',
    '# Never production: setup adds demo accounts using the passwords below.',
    'DATABASE_URL=""', 'DIRECT_URL=""', 'PORTAL_ORIGIN="http://localhost:3000"',
    `ACCESS_JWT_SECRET="${secret()}"`, `ACCESS_ENCRYPTION_KEY="${secret()}"`,
    'ADMIN_USERNAME="admin"', `ADMIN_PASSWORD="${secret()}"`,
    'SEED_DEMO="true"', `DEMO_PASSWORD="${secret()}"`, '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
}
// The database comes only from .env.access, never from the shell, so a production URL exported for
// a migration can never receive the demo accounts this script adds.
const env = { ...process.env, DATABASE_URL: '', DIRECT_URL: '' };
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  if (match) env[match[1]] = match[2];
}
if (![env.DATABASE_URL, env.DIRECT_URL].every(url => /^postgres(ql)?:\/\//.test(url))) {
  console.error('Set DATABASE_URL and DIRECT_URL in webapp/.env.access to a separate development PostgreSQL database (never production), then run setup again.');
  process.exit(1);
}
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed-access.ts'], { env, stdio: 'inherit' });
console.log('Local setup complete. Credentials are in webapp/.env.access (not printed). Start with npm run dev.');
