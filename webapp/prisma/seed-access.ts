import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { durationDate, licenseKey, password } from '../src/lib/access-policy';

const db = new PrismaClient();
async function main() {
  const adminPassword = password(process.env.ADMIN_PASSWORD);
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) throw new Error('Invalid ADMIN_USERNAME.');
  if (!(await db.accessAccount.findFirst({ where: { role: 'ADMIN' } }))) {
    await db.accessAccount.create({ data: { username, name: 'Administrator', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 12) } });
  }
  if (process.env.SEED_DEMO === 'true') {
    const demoHash = await bcrypt.hash(password(process.env.DEMO_PASSWORD), 12);
    const create = (username: string, name: string, role: string, parentId?: string) => db.accessAccount.upsert({ where: { username }, update: {}, create: { username, name, role, parentId, passwordHash: demoHash } });
    const standalone = await create('standalone', 'Alex Morgan', 'STANDALONE');
    const individual = await create('individual', 'Sam Rivera', 'INDIVIDUAL');
    if (!(await db.accessLicense.findUnique({ where: { accountId: individual.id } }))) await db.accessLicense.create({ data: { ownerId: individual.id, accountId: individual.id, key: licenseKey(), plan: 'PRO', expiresAt: durationDate(new Date(), 1, 'YEARS') } });
    const corp = await create('corporation', 'Acme Corporation', 'CORP');
    const subcorp = await create('subcorp', 'Acme Studio', 'SUBCORP', corp.id);
    for (const [owner, name] of [[standalone, 'standalone.desktop'], [subcorp, 'studio.desktop']] as const) {
      const account = await create(name, `${owner.name} desktop`, 'LICENSE', owner.id);
      if (!(await db.accessLicense.findUnique({ where: { accountId: account.id } }))) await db.accessLicense.create({ data: { ownerId: owner.id, accountId: account.id, key: licenseKey(), plan: 'ULTIMATE', expiresAt: durationDate(new Date(), 1, 'YEARS') } });
      if (!(await db.accessLicense.count({ where: { ownerId: owner.id, accountId: null } }))) await db.accessLicense.create({ data: { ownerId: owner.id, key: licenseKey(), plan: 'ULTIMATE', expiresAt: durationDate(new Date(), 1, 'YEARS') } });
    }
    console.log('Individual web + desktop: individual. Team owners: standalone (legacy), corporation, subcorp. Enterprise desktop: standalone.desktop, studio.desktop. Passwords come from DEMO_PASSWORD.');
  }
  console.log('Access database ready. Existing accounts and passwords were preserved.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
