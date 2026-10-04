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

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        parentTenant: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, status: true } },
        memberships: { include: { user: { select: { id: true, username: true, email: true, name: true } } } },
        _count: { select: { licenses: true, children: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: tenants });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/v1/admin/tenants — create sub-corp for an existing corp tenant
export async function POST(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, type, parentTenantId } = body;

    if (!name || !type) {
      return NextResponse.json({ success: false, error: "Name and type required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: { name, type, parentTenantId: parentTenantId || null },
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "TENANT_CREATED",
      tenantId: tenant.id,
      details: { name, type, parentTenantId },
    });

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
