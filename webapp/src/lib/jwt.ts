import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "astra_jwt_super_secret_key_2026_changeme_in_prod";
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
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
