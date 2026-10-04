import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";

// PATCH /api/v1/admin/licenses/[id]
// actions: RENEW (addDays), SUSPEND, REVOKE, UNSUSPEND, DELETE
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, addDays } = body;

    const license = await prisma.license.findUnique({
      where: { id: (await params).id },
      include: { tenant: true },
    });

    if (!license) return NextResponse.json({ success: false, error: "License not found" }, { status: 404 });

    let updateData: any = {};

    switch (action) {
      case "RENEW": {
        const days = addDays || 365;
        const base = license.expiresAt > new Date() ? license.expiresAt : new Date();
        updateData = {
          expiresAt: new Date(base.getTime() + days * 24 * 3600 * 1000),
          status: "ACTIVE",
        };
        break;
      }
      case "SUSPEND":
        updateData = { status: "SUSPENDED" };
        break;
      case "UNSUSPEND":
        updateData = { status: license.activatedAt ? "ACTIVE" : "UNACTIVATED" };
        break;
      case "REVOKE":
        updateData = { status: "REVOKED" };
        break;
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const updated = await prisma.license.update({
      where: { id: (await params).id },
      data: updateData,
    });

    await createAuditLog({
      actorId: actor.userId,
      action: `LICENSE_${action}`,
      tenantId: license.tenantId,
      details: { licenseId: (await params).id, keyMasked: license.keyMasked, ...updateData },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/v1/admin/licenses/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const license = await prisma.license.findUnique({ where: { id: (await params).id } });
    if (!license) return NextResponse.json({ success: false, error: "License not found" }, { status: 404 });

    await prisma.license.delete({ where: { id: (await params).id } });

    await createAuditLog({
      actorId: actor.userId,
      action: "LICENSE_DELETED",
      tenantId: license.tenantId,
      details: { licenseId: (await params).id, keyMasked: license.keyMasked },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
