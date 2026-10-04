import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AccessError } from './access-policy';

function jwtSecret() {
  const value = process.env.ACCESS_JWT_SECRET;
  if (!value || value.length < 32) throw new Error('Configure ACCESS_JWT_SECRET with at least 32 random characters.');
  return value;
}
function encryptionKey() {
  const value = process.env.ACCESS_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Configure ACCESS_ENCRYPTION_KEY with 32 random bytes in hex.');
  return Buffer.from(value, 'hex');
}
export function seal(secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
}
export function unseal(secret: string) {
  const [iv, tag, data] = secret.split('.').map(x => Buffer.from(x, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
export function tokenFor(accountId: string, sessionId: string, audience: string) {
  return jwt.sign({ sid: sessionId }, jwtSecret(), { algorithm: 'HS256', issuer: 'astra-access', audience, subject: accountId, expiresIn: '8h' });
}
export function readToken(token: string, audience: string) {
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'], issuer: 'astra-access', audience });
    if (typeof payload === 'string' || typeof payload.sid !== 'string' || !payload.sub) throw new Error();
    return { accountId: payload.sub, sessionId: payload.sid };
  } catch { throw new AccessError('Your session has ended. Sign in again.', 401); }
}
