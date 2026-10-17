import jwt from "jsonwebtoken";

// Retired /api/v1 only: refuse to sign or trust tokens without a real secret.
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("Configure JWT_SECRET with at least 32 random characters.");
  return value;
}
const JWT_EXPIRES_IN = "8h";

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  role: "ADMIN" | "CORP" | "INDIVIDUAL";
  organizationId?: string;
  tenantId?: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, secret(), { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, secret(), { algorithms: ["HS256"] }) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromHeader(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function requireAuth(req: Request): JWTPayload | null {
  const token = getTokenFromHeader(req);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAdmin(req: Request): JWTPayload | null {
  const payload = requireAuth(req);
  if (!payload || payload.role !== "ADMIN") return null;
  return payload;
}
