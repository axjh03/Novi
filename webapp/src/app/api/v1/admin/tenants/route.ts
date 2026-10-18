import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";

// GET /api/v1/admin/tenants?search=query
export async function GET(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const where = search ? { name: { contains: search } } : {};

    const organizations = await prisma.organization.findMany({
      where,
      include: {
        parentOrganization: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, status: true } },
        memberships: { include: { user: { select: { id: true, username: true, email: true, name: true } } } },
        _count: { select: { licenses: true, children: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const mapped = organizations.map((o: any) => ({
      ...o,
      parentTenant: o.parentOrganization,
      parentTenantId: o.parentOrganizationId,
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/v1/admin/tenants: create sub-corp for an existing corp organization
export async function POST(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, type, parentOrganizationId, parentTenantId } = body;
    const parentId = parentOrganizationId || parentTenantId || null;

    if (!name || !type) {
      return NextResponse.json({ success: false, error: "Name and type required" }, { status: 400 });
    }

    const organization = await prisma.organization.create({
      data: { name, type, parentOrganizationId: parentId },
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "ORGANIZATION_CREATED",
      organizationId: organization.id,
      details: { name, type, parentOrganizationId: parentId },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...organization,
        parentTenant: (organization as any).parentOrganization,
        parentTenantId: organization.parentOrganizationId,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
