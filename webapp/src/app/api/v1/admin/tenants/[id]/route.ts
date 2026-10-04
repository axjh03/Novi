import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";

// PATCH /api/v1/admin/tenants/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { status, name } = body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (name) updateData.name = name;

    const tenant = await prisma.tenant.update({
      where: { id: (await params).id },
      data: updateData,
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "TENANT_UPDATED",
      tenantId: (await params).id,
      details: { fields: updateData },
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/v1/admin/tenants/[id] — cascades to children, licenses, devices
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: (await params).id },
      include: { _count: { select: { children: true, licenses: true } } },
    });

    if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    await prisma.tenant.delete({ where: { id: (await params).id } });

    await createAuditLog({
      actorId: actor.userId,
      action: "TENANT_DELETED",
      details: {
        tenantId: (await params).id,
        name: tenant.name,
        childrenDeleted: tenant._count.children,
        licensesDeleted: tenant._count.licenses,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
