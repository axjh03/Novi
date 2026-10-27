import { Prisma, type AccessAccount } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { canResetPassword } from './access-permissions';
import { activityEvents } from './activity-events';
import { AccessError, durationDate, licenseKey, password, plan, providers, roles, string, validParent } from './access-policy';
import { readToken, seal, tokenFor, unseal } from './access-security';
import { LIFETIME_EXPIRY, PLAN_FEATURES, PLAN_NAMES, PLANS_HEADER, type LicensePlan } from '../../../src/shared/plans';
import { listModels } from '../../../src/main/services/models';
import { UserError } from '../../../src/main/services/validation';

type DB = Prisma.TransactionClient;
export const LEASE_MS = 90_000;
const publicAccount = { id: true, username: true, name: true, role: true, status: true, parentId: true, createdAt: true } as const;
const credentialFields = { id: true, ownerId: true, provider: true, nickname: true, model: true, lastFour: true } as const;
const audit = (db: DB, actorId: string, action: string, targetId: string) => db.accessAudit.create({ data: { actorId, action, targetId } });
async function chain(db: DB, account: AccessAccount) {
  const result = [account];
  while (result.at(-1)?.parentId) {
    const next = await db.accessAccount.findUnique({ where: { id: result.at(-1)!.parentId! } });
    if (!next || result.some(a => a.id === next.id)) throw new AccessError('Invalid account hierarchy.', 403);
    result.push(next);
  }
  if (result.some(a => a.status !== 'ACTIVE')) throw new AccessError('This account or its organization is inactive.', 403);
  return result;
}
async function eligible(db: DB, account: AccessAccount) {
  const parents = await chain(db, account);
  if (account.role !== 'LICENSE' || !['STANDALONE', 'SUBCORP'].includes(parents[1]?.role)) throw new AccessError('Ineligible account. Use a licensed desktop account provided by your standalone owner or sub-corporation.', 403);
  const license = await db.accessLicense.findUnique({ where: { accountId: account.id } });
  if (!license || license.ownerId !== account.parentId || license.status !== 'ACTIVE' || license.expiresAt <= new Date()) throw new AccessError('Your license is expired or terminated. Contact your administrator.', 403);
  return license;
}
/**
 * The expiry for a new license, or for a license leaving Lifetime: Lifetime never expires (stored as
 * the far-future LIFETIME_EXPIRY), every other plan runs for the chosen term from now.
 *
 * @throws AccessError when a plan other than Lifetime has no valid term.
 */
function planExpiry(licensePlan: LicensePlan, duration: unknown, unit: unknown) {
  return licensePlan === 'LIFETIME' ? LIFETIME_EXPIRY : durationDate(new Date(), duration, unit);
}
/**
 * Refuses a desktop app that does not enforce plans when its license is on Core, Pro or Lifetime.
 *
 * Apps released before plans existed unlock every feature and send no `x-novi-plans` header. Ultimate
 * includes every feature, so they may keep using Ultimate licenses. On any other plan they would hand
 * out features the license doesn't include, so they are turned away with a message saying where to
 * get the update (old apps only show their updater after sign-in).
 *
 * Called at desktop sign-in and on every desktop check-in (`desktop()`), so a license moved off
 * Ultimate stops working in an old app within one check-in (about 20 seconds).
 *
 * @throws AccessError 403 with the update instructions.
 */
function requirePlanAwareApp(license: { plan: string }, req?: Request) {
  if (license.plan === 'ULTIMATE' || req?.headers.get(PLANS_HEADER) === '1') return;
  const download = req ? `${new URL(req.url).origin}/download` : 'the Download page on the Novi website';
  throw new AccessError(`This license is on the ${PLAN_NAMES[license.plan as LicensePlan] ?? license.plan} plan, which needs the newest version of Novi. Download it from ${download}, install it, then sign in again.`, 403);
}
/**
 * Returns the caller's IP address, or `null` when it isn't known.
 *
 * Used for two things: the per-address sign-in limit in `login()`, and the "last seen from" address
 * shown for desktop sessions in the portal.
 *
 * Only headers that Vercel overwrites with the real caller address are trusted:
 * - `x-real-ip`
 * - `x-forwarded-for` (first entry)
 * Vercel replaces any value the caller sends in these, so they can't be faked. Other headers such as
 * `cf-connecting-ip` are deliberately ignored: on Vercel they pass straight through from the caller,
 * so anyone could send a different fake address on every try and dodge the per-address limit.
 *
 * If the portal is ever moved behind another proxy (for example Cloudflare), revisit this function,
 * because that proxy decides which header holds the real address.
 *
 * @returns the address (at most 64 characters), or `null` when no trusted header is present.
 */
function clientIp(req?: Request) {
  const value = req?.headers.get('x-real-ip') || req?.headers.get('x-forwarded-for')?.split(',')[0];
  const ip = value?.trim();
  return ip && ip.length <= 64 ? ip : null;
}
/**
 * Records one sign-in attempt against a throttle counter and refuses the attempt when it is over the limit.
 *
 * Counters live in the `LoginThrottle` table (key, count, expiresAt), so the limit holds across all
 * server instances. A counter is created on the first attempt with a 15-minute expiry and then only
 * counts up; `login()` deletes expired counters, and deletes the user's counters after a successful
 * sign-in.
 *
 * @param key   which counter to use, for example `user:alice` or `ip:203.0.113.7|user:alice`.
 * @param limit how many attempts are allowed in the 15-minute window.
 * @param now   the time of this attempt, used when the counter is created.
 * @throws AccessError 429 "Too many sign-in attempts..." once the count goes past `limit`.
 */
async function countAttempt(key: string, limit: number, now: Date) {
  const attempt = await prisma.loginThrottle.upsert({ where: { key }, create: { key, expiresAt: new Date(+now + 900_000) }, update: { count: { increment: 1 } } });
  if (attempt.count > limit) throw new AccessError('Too many sign-in attempts. Try again in 15 minutes.', 429);
}
export async function login(body: Record<string, unknown>, req?: Request) {
  const username = string(body.username, 'username', 64).toLowerCase();
  string(body.password, 'password', 128);
  const secret = body.password as string;
  if (Buffer.byteLength(secret) > 72) throw new AccessError('Username or password is incorrect.', 401);
  const audience = body.audience === 'desktop' ? 'desktop' : 'portal';
  const now = new Date();
  // Durable throttling also works across server workers. Expired rows are bounded by cleanup.
  await prisma.loginThrottle.deleteMany({ where: { expiresAt: { lt: now } } });
  // Two sign-in limits, both reset 15 minutes after the first attempt:
  // 1. Per address and account (`ip:<address>|user:<name>`): 10 attempts. Someone mistyping or
  //    guessing from one place is stopped here.
  // 2. Per account (`user:<name>`): 50 attempts from all addresses together. A backstop against
  //    guessing spread over many machines.
  // Order matters: the per-address counter is checked first and throws first, so a blocked address
  // stops adding to the account counter. One address can therefore add at most 11 to it, and locking
  // an account out takes at least 5 different real addresses. (Before this change, 11 wrong
  // passwords from anywhere locked the account.)
  // The "ip:" and "user:" prefixes keep the two kinds of counters apart whatever username is typed.
  // With no known address everyone shares `ip:unknown`, which behaves like the old single counter.
  const throttle = [`ip:${clientIp(req) || 'unknown'}|user:${username}`, `user:${username}`];
  await countAttempt(throttle[0], 10, now);
  await countAttempt(throttle[1], 50, now);
  const account = await prisma.accessAccount.findUnique({ where: { username } });
  const valid = await bcrypt.compare(secret, account?.passwordHash || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxIkqHU2zd2PcBzSVdmjCCoINHa');
  if (!account || !valid) throw new AccessError('Username or password is incorrect.', 401);
  const result = await prisma.$transaction(async db => {
    // Password resets update this same row, so they must wait for session creation or finish first.
    await db.$queryRaw`SELECT "id" FROM "AccessAccount" WHERE "id" = ${account.id} FOR UPDATE`;
    const current = await db.accessAccount.findUniqueOrThrow({ where: { id: account.id } });
    if (current.passwordHash !== account.passwordHash) throw new AccessError('Credentials changed. Sign in again.', 401);
    await chain(db, current);
    if (audience === 'portal' && account.role === 'LICENSE') throw new AccessError('Desktop accounts must sign in through the desktop app.', 403);
    if (audience === 'desktop') {
      requirePlanAwareApp(await eligible(db, current), req);
      await db.accessSession.updateMany({ where: { accountId: account.id, activeSlot: account.id, OR: [{ lastSeenAt: { lt: new Date(+now - LEASE_MS) } }, { expiresAt: { lte: now } }] }, data: { activeSlot: null, revokedAt: now } });
      if (await db.accessSession.findUnique({ where: { activeSlot: account.id } })) throw new AccessError('This account is active on another device. Log out there first, or ask your administrator to end the session.', 409);
    }
    const session = await db.accessSession.create({ data: {
      accountId: account.id, audience, activeSlot: audience === 'desktop' ? account.id : null,
      deviceId: audience === 'desktop' ? string(body.deviceId, 'device identifier') : null,
      deviceName: audience === 'desktop' ? string(body.deviceName, 'device name') : null,
      ipAddress: audience === 'desktop' ? clientIp(req) : null,
      expiresAt: new Date(+now + 8 * 60 * 60 * 1000),
    } });
    const token = tokenFor(account.id, session.id, audience);
    await audit(db, account.id, 'SIGNED_IN', session.id);
    return { token, user: { id: account.id, username: account.username, name: account.name, role: account.role } };
  });
  // A successful sign-in clears this address's counter and the account counter. Counters for other
  // addresses (for example one that was guessing) stay, so a blocked address stays blocked.
  await prisma.loginThrottle.deleteMany({ where: { key: { in: throttle } } });
  return result;
}
export async function authenticate(req: Request, db: DB = prisma) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '');
  const cookie = req.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith('astra_session='))?.slice(14);
  const audience = bearer ? 'desktop' : 'portal';
  const claims = readToken(bearer || cookie || '', audience);
  const session = await db.accessSession.findUnique({ where: { id: claims.sessionId }, include: { account: true } });
  if (!session || session.accountId !== claims.accountId || session.audience !== audience || session.revokedAt || session.expiresAt <= new Date()) throw new AccessError('Your session has ended. Sign in again.', 401);
  await chain(db, session.account);
  if (audience === 'desktop') {
    // A lapsed lease only lets another device sign in (see login). Until one does, this session may resume after an outage.
    if (session.activeSlot !== session.accountId) throw new AccessError('Your device session has expired. Sign in again.', 401);
    await eligible(db, session.account);
  }
  return { account: session.account, session };
}
async function visibleIds(db: DB, actor: AccessAccount) {
  const accounts = await db.accessAccount.findMany({ select: { id: true, parentId: true } });
  if (actor.role === 'ADMIN') return accounts.map(a => a.id);
  const ids = new Set([actor.id]);
  let changed = true;
  while (changed) { changed = false; for (const a of accounts) if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) { ids.add(a.id); changed = true; } }
  return [...ids];
}
export async function state(req: Request) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal') throw new AccessError('Use the management portal.', 403);
  await prisma.accessSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  const ids = await visibleIds(prisma, account);
  const lastActivity = await prisma.accessSession.groupBy({ by: ['accountId', 'audience'], where: { accountId: { in: ids } }, _max: { lastSeenAt: true } });
  const [accounts, licenses, sessions, credentials, requests] = await Promise.all([
    prisma.accessAccount.findMany({ where: { id: { in: ids } }, select: publicAccount, orderBy: { createdAt: 'asc' } }),
    prisma.accessLicense.findMany({ where: { ownerId: { in: ids } }, orderBy: { createdAt: 'desc' } }),
    prisma.accessSession.findMany({ where: { accountId: { in: ids }, audience: 'desktop', revokedAt: null, expiresAt: { gt: new Date() }, lastSeenAt: { gt: new Date(Date.now() - LEASE_MS) } }, select: { id: true, accountId: true, deviceName: true, ipAddress: true, lastSeenAt: true } }),
    prisma.managedCredential.findMany({ where: { ownerId: account.role === 'ADMIN' ? { in: ids } : account.id }, select: credentialFields }),
    prisma.licenseRequest.findMany({ where: { ownerId: { in: ids } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { user: { id: account.id, name: account.name, username: account.username, role: account.role }, accounts: accounts.map(a => ({ ...a, activity: lastActivity.filter(item => item.accountId === a.id).map(item => ({ audience: item.audience, lastSeenAt: item._max.lastSeenAt })) })), licenses, sessions, credentials, requests, providers };
}
export async function revealCredential(req: Request, id: string) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new AccessError('Invalid request origin.', 403);
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal') throw new AccessError('Use the management portal.', 403);
  const credential = await prisma.managedCredential.findFirst({ where: { id, ...(account.role === 'ADMIN' ? {} : { ownerId: account.id }) } });
  if (!credential) throw new AccessError('Credential not found.', 404);
  await audit(prisma, account.id, 'CREDENTIAL_REVEALED', credential.id);
  return { secret: unseal(credential.encryptedSecret) };
}
export async function credentialModels(req: Request, id: string) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal') throw new AccessError('Use the management portal.', 403);
  const credential = await prisma.managedCredential.findFirst({ where: { id, ...(account.role === 'ADMIN' ? {} : { ownerId: account.id }) } });
  if (!credential) throw new AccessError('Credential not found.', 404);
  const provider = providers[credential.provider as keyof typeof providers];
  if (!provider) throw new AccessError('Choose a supported provider.');
  try {
    const models = await listModels({ provider: provider.kind, baseUrl: provider.baseUrl, model: '', stream: true }, unseal(credential.encryptedSecret));
    return { models, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof UserError) throw new AccessError(error.message, 502);
    throw error;
  }
}
export async function activity(req: Request) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal' || account.role !== 'ADMIN') throw new AccessError('Administrator portal access required.', 403);
  const params = new URL(req.url).searchParams;
  const event = params.get('event') || '';
  const sort = params.get('sort') || 'desc';
  const requestedPage = Number(params.get('page') || '1');
  if (event && !Object.hasOwn(activityEvents, event)) throw new AccessError('Choose an account or license event.');
  if (!['asc', 'desc'].includes(sort)) throw new AccessError('Choose newest or oldest first.');
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new AccessError('Invalid page.');
  const parseDate = (key: string) => {
    const value = params.get(key);
    if (!value) return undefined;
    const date = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(+date)) throw new AccessError('Invalid date and time.');
    return date;
  };
  const from = parseDate('from'), to = parseDate('to');
  if (from && to && from > to) throw new AccessError('The end must be on or after the start.');
  const where: Prisma.AccessAuditWhereInput = {
    action: event || { in: Object.keys(activityEvents) },
    createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
  };
  return prisma.$transaction(async db => {
    const total = await db.accessAudit.count({ where });
    const pageSize = 20, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requestedPage, pages);
    const items = await db.accessAudit.findMany({ where, orderBy: [{ createdAt: sort as 'asc' | 'desc' }, { id: sort as 'asc' | 'desc' }], skip: (page - 1) * pageSize, take: pageSize });
    const targetIds = items.map(item => item.targetId);
    const [accounts, licenses, requests] = await Promise.all([
      db.accessAccount.findMany({ where: { id: { in: [...targetIds, ...items.map(item => item.actorId)] } }, select: { id: true, username: true } }),
      db.accessLicense.findMany({ where: { id: { in: targetIds } }, select: { id: true, key: true } }),
      db.licenseRequest.findMany({ where: { id: { in: targetIds } }, select: { id: true, quantity: true } }),
    ]);
    const usernames = new Map(accounts.map(item => [item.id, `@${item.username}`]));
    const targets = new Map([...usernames, ...licenses.map(item => [item.id, item.key] as const), ...requests.map(item => [item.id, `${item.quantity} licenses`] as const)]);
    return { items: items.map(item => ({ ...item, actorName: usernames.get(item.actorId) || item.actorId, targetName: targets.get(item.targetId) || item.targetId })), total, page, pages, pageSize };
  });
}
export async function desktop(req: Request) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'desktop') throw new AccessError('Desktop session required.', 403);
  const license = await eligible(prisma, account);
  try { requirePlanAwareApp(license, req); }
  catch (error) {
    // End the old app's session now, so the updated app can sign in at once instead of waiting
    // 90 seconds for the lease to lapse.
    await prisma.accessSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), activeSlot: null } });
    throw error;
  }
  const parents = await chain(prisma, account);
  // Keys saved for providers since removed from the catalog are skipped instead of failing every desktop refresh.
  const credentials = await prisma.managedCredential.findMany({ where: { ownerId: { in: parents.slice(1).map(a => a.id) }, provider: { in: Object.keys(providers) } } });
  const ipAddress = clientIp(req);
  await prisma.accessSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), ...(ipAddress ? { ipAddress } : {}) } });
  // `features` is what the app unlocks; it is derived here so the plan table can change without a desktop release.
  return { user: { id: account.id, username: account.username, name: account.name }, license, features: PLAN_FEATURES[license.plan as LicensePlan] ?? [], credentials: credentials.map(c => ({ id: c.id, name: c.nickname, ownerName: parents.find(a => a.id === c.ownerId)?.name, provider: providers[c.provider as keyof typeof providers].kind, baseUrl: providers[c.provider as keyof typeof providers].baseUrl, model: c.model, stream: true, apiKey: unseal(c.encryptedSecret) })) };
}
export async function mutate(req: Request, resource: string, id: string | undefined, body: Record<string, unknown>) {
  return prisma.$transaction(async db => {
    const { account: actor, session } = await authenticate(req, db);
    if (resource === 'logout') {
      await db.accessSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), activeSlot: null } });
      return {};
    }
    if (session.audience !== 'portal') throw new AccessError('Desktop accounts have read-only access.', 403);
    const admin = actor.role === 'ADMIN';
    const ids = await visibleIds(db, actor);
    const needAdmin = () => { if (!admin) throw new AccessError('Administrator access required.', 403); };
    const owner = async (ownerId: unknown) => {
      const user = await db.accessAccount.findUnique({ where: { id: string(ownerId, 'owner') } });
      if (!user || !ids.includes(user.id) || !['STANDALONE', 'SUBCORP'].includes(user.role)) throw new AccessError('Choose a standalone or sub-corporation owner.', 403);
      await chain(db, user); return user;
    };
    if (resource === 'accounts' && !id && req.method === 'POST') {
      const role = string(body.role, 'role');
      if (!roles.includes(role as typeof roles[number]) || role === 'ADMIN') throw new AccessError('Only one administrator is allowed.');
      const parentId = body.parentId ? string(body.parentId, 'parent') : null;
      const parent = parentId ? await db.accessAccount.findUnique({ where: { id: parentId } }) : null;
      if (!validParent(role, parent?.role) || (parentId && !parent)) throw new AccessError('Invalid parent for this account type.');
      if (!admin && !(parentId === actor.id && ((actor.role === 'CORP' && role === 'SUBCORP') || (['STANDALONE', 'SUBCORP'].includes(actor.role) && role === 'LICENSE')))) throw new AccessError('You cannot create this account.', 403);
      if (parent) await chain(db, parent);
      const username = string(body.username, 'username', 64).toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) throw new AccessError('Use 3–64 letters, numbers, dots, underscores or hyphens.');
      const created = await db.accessAccount.create({ data: { username, name: string(body.name, 'name'), role, parentId, passwordHash: await bcrypt.hash(password(body.password), 12) }, select: publicAccount });
      if (role === 'LICENSE') {
        const result = await db.accessLicense.updateMany({ where: { id: string(body.licenseId, 'license'), ownerId: parentId!, accountId: null, status: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { accountId: created.id } });
        if (result.count !== 1) throw new AccessError('Choose an unused, active license belonging to this parent. A license can never be reassigned.');
      }
      await audit(db, actor.id, 'ACCOUNT_CREATED', created.id); return created;
    }
    if (resource === 'accounts' && id && ['PATCH', 'DELETE'].includes(req.method)) {
      const target = await db.accessAccount.findUnique({ where: { id } });
      if (!target) throw new AccessError('Account not found.', 404);
      const passwordOnly = req.method === 'PATCH' && body.password !== undefined && body.name === undefined && body.username === undefined && body.status === undefined;
      const allowedReset = passwordOnly && canResetPassword(actor.role, target.role) && (admin || ids.includes(target.id));
      if (!allowedReset) needAdmin();
      if (target.role === 'ADMIN' && !allowedReset) throw new AccessError('The administrator account is protected.', 403);
      if (req.method === 'DELETE') {
        const descendants = await visibleIds(db, target);
        await db.accessAccount.updateMany({ where: { id: { in: descendants } }, data: { status: 'DELETED' } });
        await db.accessSession.updateMany({ where: { accountId: { in: descendants } }, data: { revokedAt: new Date(), activeSlot: null } });
        await db.accessLicense.updateMany({ where: { OR: [{ ownerId: { in: descendants } }, { accountId: { in: descendants } }] }, data: { status: 'TERMINATED' } });
      } else {
        if (target.status === 'DELETED') throw new AccessError('Deleted accounts cannot be restored.');
        const data: Prisma.AccessAccountUpdateInput = {};
        if (body.name !== undefined) data.name = string(body.name, 'name');
        if (body.username !== undefined) { const name = string(body.username, 'username', 64).toLowerCase(); if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(name)) throw new AccessError('Invalid username.'); data.username = name; }
        if (body.password !== undefined) data.passwordHash = await bcrypt.hash(password(body.password), 12);
        if (body.status !== undefined) { if (!['ACTIVE', 'SUSPENDED'].includes(String(body.status))) throw new AccessError('Invalid status.'); data.status = String(body.status); }
        await db.accessAccount.update({ where: { id }, data });
        const affected = passwordOnly ? [target.id] : await visibleIds(db, target);
        await db.accessSession.updateMany({ where: { accountId: { in: affected } }, data: { revokedAt: new Date(), activeSlot: null } });
      }
      await audit(db, actor.id, req.method === 'DELETE' ? 'ACCOUNT_DELETED' : body.password ? 'PASSWORD_RESET' : 'ACCOUNT_UPDATED', id); return {};
    }
    if (resource === 'sessions' && id && req.method === 'DELETE') {
      needAdmin(); await db.accessSession.updateMany({ where: { id }, data: { revokedAt: new Date(), activeSlot: null } });
      await audit(db, actor.id, 'SESSION_ENDED', id); return {};
    }
    if (resource === 'licenses') {
      needAdmin();
      if (req.method === 'POST' && !id) {
        const target = await owner(body.ownerId);
        const licensePlan = plan(body.plan);
        const license = await db.accessLicense.create({ data: { key: licenseKey(), ownerId: target.id, plan: licensePlan, expiresAt: planExpiry(licensePlan, body.duration, body.unit) } });
        await audit(db, actor.id, 'LICENSE_ISSUED', license.id); return license;
      }
      if (req.method === 'PATCH' && id) {
        const license = await db.accessLicense.findUniqueOrThrow({ where: { id } });
        if (body.action === 'terminate') {
          await db.accessLicense.update({ where: { id }, data: { status: 'TERMINATED' } });
          if (license.accountId) await db.accessSession.updateMany({ where: { accountId: license.accountId }, data: { revokedAt: new Date(), activeSlot: null } });
        } else if (body.action === 'renew') {
          if (license.status === 'TERMINATED') throw new AccessError('Terminated licenses cannot be renewed or reused.');
          if (license.plan === 'LIFETIME') throw new AccessError('Lifetime licenses never expire, so there is nothing to renew.');
          await db.accessLicense.update({ where: { id }, data: { expiresAt: durationDate(new Date(Math.max(Date.now(), +license.expiresAt)), body.duration, body.unit) } });
        } else if (body.action === 'plan') {
          // The desktop app picks up the new plan at its next check-in (about 20 seconds); no sign-in needed.
          if (license.status === 'TERMINATED') throw new AccessError('Terminated licenses cannot change plan.');
          const next = plan(body.plan);
          if (next === license.plan) throw new AccessError(`This license is already on ${PLAN_NAMES[next]}.`);
          // Moving to Lifetime removes the expiry. Leaving Lifetime needs a new term, counted from now.
          // Between the monthly plans the expiry stays as it is.
          const expiresAt = next === 'LIFETIME' || license.plan === 'LIFETIME' ? planExpiry(next, body.duration, body.unit) : undefined;
          await db.accessLicense.update({ where: { id }, data: { plan: next, ...(expiresAt ? { expiresAt } : {}) } });
        } else throw new AccessError('Choose renew, change plan or terminate.');
        await audit(db, actor.id, body.action === 'renew' ? 'LICENSE_RENEWED' : body.action === 'plan' ? 'LICENSE_PLAN_CHANGED' : 'LICENSE_TERMINATED', id); return {};
      }
    }
    if (resource === 'credentials' && ['STANDALONE', 'CORP', 'SUBCORP'].includes(actor.role)) {
      const existing = id ? await db.managedCredential.findFirst({ where: { id, ownerId: actor.id } }) : null;
      if (id && !existing) throw new AccessError('Credential not found.', 404);
      if (req.method === 'DELETE' && id) { await db.managedCredential.delete({ where: { id } }); await audit(db, actor.id, 'API_KEY_REMOVED', id); return {}; }
      if (req.method === 'POST' || (req.method === 'PATCH' && id)) {
        const provider = string(body.provider, 'provider');
        if (!Object.hasOwn(providers, provider)) throw new AccessError('Choose a supported provider.');
        const data = { provider, nickname: string(body.nickname, 'nickname', 60), model: '' };
        const rawSecret = body.secret ? string(body.secret, 'API key', 4096).trim() : undefined;
        const secret = rawSecret || undefined;
        if (existing && existing.provider !== provider && !secret) throw new AccessError('Enter a new API key when changing providers.');
        if (!id && !secret) throw new AccessError('Enter an API key.');
        const encrypted = secret ? { encryptedSecret: seal(secret), lastFour: secret.slice(-4) } : {};
        const saved = id ? await db.managedCredential.update({ where: { id }, data: { ...data, ...encrypted }, select: credentialFields }) : await db.managedCredential.create({ data: { ...data, ownerId: actor.id, encryptedSecret: seal(secret!), lastFour: secret!.slice(-4) }, select: credentialFields });
        await audit(db, actor.id, 'API_KEY_SAVED', saved.id); return saved;
      }
    }
    if (resource === 'requests') {
      if (req.method === 'POST' && !id) {
        const target = await owner(body.ownerId || actor.id);
        const requestPlan = plan(body.plan);
        planExpiry(requestPlan, body.duration, body.unit); // validates the term; Lifetime has none
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new AccessError('Request between 1 and 100 licenses.');
        const term = requestPlan === 'LIFETIME' ? { duration: 0, unit: 'LIFETIME' } : { duration: Number(body.duration), unit: String(body.unit) };
        const request = await db.licenseRequest.create({ data: { ownerId: target.id, quantity, plan: requestPlan, ...term } });
        await audit(db, actor.id, 'LICENSES_REQUESTED', request.id); return request;
      }
      if (req.method === 'PATCH' && id) {
        needAdmin();
        if (!['APPROVED', 'REJECTED'].includes(String(body.status))) throw new AccessError('Choose approve or reject.');
        const request = await db.licenseRequest.findUniqueOrThrow({ where: { id } });
        if (request.status !== 'PENDING') throw new AccessError('This request has already been processed.');
        const claimed = await db.licenseRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: String(body.status) } });
        if (claimed.count !== 1) throw new AccessError('This request has already been processed.');
        if (body.status === 'APPROVED') {
          await owner(request.ownerId);
          const requestPlan = plan(request.plan);
          for (let i = 0; i < request.quantity; i++) await db.accessLicense.create({ data: { key: licenseKey(), ownerId: request.ownerId, plan: requestPlan, expiresAt: planExpiry(requestPlan, request.duration, request.unit) } });
        }
        await audit(db, actor.id, `REQUEST_${body.status}`, id); return {};
      }
    }
    throw new AccessError('Action not permitted.', 403);
  }, { timeout: 15_000 });
}
