import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { action, addDays = 365, status } = body;

    const existing = await prisma.license.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "License not found" }, { status: 404 });
    }

    let updateData: any = {};

    if (action === "RENEW") {
      const currentExpiry = new Date(existing.expiresAt) > new Date() ? new Date(existing.expiresAt) : new Date();
      updateData = {
        expiresAt: new Date(currentExpiry.getTime() + addDays * 24 * 3600 * 1000),
        status: "ACTIVE",
        graceUntil: null,
      };
    } else if (action === "REVOKE") {
      updateData = { status: "REVOKED" };
    } else if (action === "SUSPEND") {
      updateData = { status: "SUSPENDED" };
    } else if (status) {
      updateData = { status };
    }

    const updated = await prisma.license.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      tenantId: updated.tenantId,
      action: `LICENSE_${action || "UPDATED"}`,
      details: { licenseId: id, updateData },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
