/**
 * Sign-in tokens for the RETIRED /api/v1 prototype API.
 *
 * The live portal and the desktop app use `access-security.ts` instead. Every /api/v1 request is
 * already answered with "410 retired" by `src/proxy.ts`, so this file only matters if someone turns
 * that API back on. It is kept (not deleted) because the old code may be needed for a data migration.
 *
 * Security rule: this file must never fall back to a built-in secret. A default secret written in
 * the source code would let anyone who reads the repository create a valid ADMIN token.
 */
import jwt from "jsonwebtoken";

/**
 * Returns the JWT signing secret from the `JWT_SECRET` environment variable.
 *
 * The secret is read each time it is needed (not once at import), so that `next build` still works
 * on machines where the variable is not set. The old API simply refuses to work there.
 *
 * @throws Error when `JWT_SECRET` is missing or shorter than 32 characters. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("Configure JWT_SECRET with at least 32 random characters.");
  return value;
}

/** How long an old-API token stays valid after it is issued. */
const JWT_EXPIRES_IN = "8h";

/** What an old-API token says about the person who holds it. */
export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  role: "ADMIN" | "CORP" | "INDIVIDUAL";
  organizationId?: string;
  tenantId?: string;
}

/**
 * Creates a signed token for a signed-in old-API user.
 *
 * The algorithm is fixed to HS256 so the token format can't be changed by whoever reads it.
 *
 * @throws Error (from `secret()`) when no real secret is configured.
 */
export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, secret(), { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN });
}

/**
 * Checks a token and returns what it says, or `null` if it can't be trusted.
 *
 * Returns `null` (never throws) when the token is expired, tampered with, signed with a different
 * secret, uses another algorithm, or when no real secret is configured. That makes every caller
 * below refuse the request instead of crashing.
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    // Only HS256 is accepted, which blocks tokens that claim "none" or another algorithm.
    return jwt.verify(token, secret(), { algorithms: ["HS256"] }) as JWTPayload;
  } catch {
    return null;
  }
}

/** Pulls the token out of an `Authorization: Bearer <token>` header, or returns `null` if there isn't one. */
export function getTokenFromHeader(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Returns the signed-in old-API user for this request, or `null` when there is no valid token. */
export function requireAuth(req: Request): JWTPayload | null {
  const token = getTokenFromHeader(req);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Returns the signed-in user only if they are an ADMIN, otherwise `null`.
 *
 * Every old-API route that can read or change data starts with this check and answers
 * "401 Unauthorized" when it returns `null`.
 */
export function requireAdmin(req: Request): JWTPayload | null {
  const payload = requireAuth(req);
  if (!payload || payload.role !== "ADMIN") return null;
  return payload;
}
