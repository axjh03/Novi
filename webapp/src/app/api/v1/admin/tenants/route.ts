import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        parentTenant: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, type: true, status: true } },
        licenses: {
          select: { id: true, keyMasked: true, status: true, expiresAt: true, activationLimit: true, activations: true },
        },
        memberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        _count: {
          select: { licenses: true, credentials: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: tenants });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, type, parentTenantId } = body;

    if (!name || !type) {
      return NextResponse.json({ success: false, error: "Name and type are required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        type, // "INDIVIDUAL" | "CORPORATION"
        parentTenantId: parentTenantId || null,
        status: "ACTIVE",
      },
    });

    await createAuditLog({
      tenantId: tenant.id,
      action: "TENANT_CREATED",
      details: { name, type, parentTenantId },
    });

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
