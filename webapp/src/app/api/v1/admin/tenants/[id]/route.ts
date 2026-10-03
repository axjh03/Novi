import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { status } = body;

    if (!["ACTIVE", "SUSPENDED", "INACTIVE", "BLOCKED"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    const updated = await prisma.tenant.update({
      where: { id },
      data: { status },
    });

    await createAuditLog({
      tenantId: id,
      action: "TENANT_STATUS_UPDATED",
      details: { status },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
