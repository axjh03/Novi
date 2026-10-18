import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { generateLicenseKey, hashLicenseKey, maskLicenseKey } from "@/lib/crypto";
import { createAuditLog } from "@/lib/audit";

// GET /api/v1/admin/licenses?tenantId=x&userId=x
export async function GET(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("tenantId");
    const userId = searchParams.get("userId");

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;

    const licenses = await prisma.license.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, type: true, parentOrganization: { select: { name: true } } } },
        user: { select: { id: true, username: true, email: true, name: true } },
        activations: {
          include: {
            device: {
              select: { id: true, name: true, platform: true, lastSeenAt: true, status: true, lastUsedByUserId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = licenses.map((l: any) => ({
      ...l,
      tenant: l.organization ? {
        ...l.organization,
        parentTenant: l.organization.parentOrganization,
      } : null,
      tenantId: l.organizationId,
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/v1/admin/licenses: Issue a new license (admin creates, not yet activated)
// body: { organizationId, tenantId, validDays, activationLimit }
export async function POST(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { organizationId, tenantId, validDays = 365, activationLimit = 1 } = body;
    const targetOrgId = organizationId || tenantId;

    if (!targetOrgId) {
      return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!organization) return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });

    const rawLicenseKey = generateLicenseKey();
    const licenseHash = hashLicenseKey(rawLicenseKey);
    const keyMasked = maskLicenseKey(rawLicenseKey);
    const expiresAt = new Date(Date.now() + validDays * 24 * 3600 * 1000);

    const license = await prisma.license.create({
      data: {
        organizationId: targetOrgId,
        licenseHash,
        keyMasked,
        status: "UNACTIVATED",
        expiresAt,
        activationLimit: Number(activationLimit) || 1,
      },
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "LICENSE_ISSUED",
      organizationId: targetOrgId,
      details: { licenseId: license.id, keyMasked, validDays, activationLimit },
    });

    return NextResponse.json({
      success: true,
      message: "License issued. This is the only time the plaintext key is shown.",
      data: {
        id: license.id,
        organizationId: license.organizationId,
        tenantId: license.organizationId,
        plaintextLicenseKey: rawLicenseKey,
        keyMasked: license.keyMasked,
        status: license.status,
        activationLimit: license.activationLimit,
        expiresAt: license.expiresAt,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
