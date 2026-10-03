import { prisma } from "./db";

interface AuditLogOptions {
  actorId?: string;
  tenantId?: string;
  action: string;
  details?: Record<string, any> | string;
  ipAddress?: string;
}

export async function createAuditLog({
  actorId,
  tenantId,
  action,
  details,
  ipAddress,
}: AuditLogOptions) {
  try {
    const detailsStr = typeof details === "object" ? JSON.stringify(details) : details;
    return await prisma.auditLog.create({
      data: {
        actorId: actorId || "SYSTEM",
        tenantId,
        action,
        details: detailsStr,
        ipAddress: ipAddress || "127.0.0.1",
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
