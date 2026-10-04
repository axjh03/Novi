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

    const organization = await prisma.organization.update({
      where: { id: (await params).id },
      data: updateData,
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      organizationId: (await params).id,
      details: { fields: updateData },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...organization,
        tenantId: organization.id,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/v1/admin/tenants/[id] — cascades to children, licenses, devices
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: (await params).id },
      include: { _count: { select: { children: true, licenses: true } } },
    });

    if (!organization) return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });

    await prisma.organization.delete({ where: { id: (await params).id } });

    await createAuditLog({
      actorId: actor.userId,
      action: "ORGANIZATION_DELETED",
      details: {
        organizationId: (await params).id,
        name: organization.name,
        childrenDeleted: organization._count.children,
        licensesDeleted: organization._count.licenses,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
