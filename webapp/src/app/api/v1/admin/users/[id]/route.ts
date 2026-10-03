import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import crypto from "crypto";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            tenant: {
              include: {
                children: true, // Sub-corps
                licenses: {
                  include: { activations: true }
                }, // Licenses
                credentials: true, // API keys
              }
            }
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Fetch devices manually since Tenant model lacks the reverse relation array
    const rootTenant = user.memberships.find(m => !m.tenant.parentTenantId)?.tenant;
    if (rootTenant) {
      const devices = await prisma.device.findMany({ where: { tenantId: rootTenant.id } });
      (rootTenant as any).devices = devices;
    }

    return NextResponse.json({ success: true, data: user });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { password, name } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (password) {
      updateData.passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      action: "USER_UPDATED",
      details: { userId: id, passwordChanged: !!password, nameChanged: !!name },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
