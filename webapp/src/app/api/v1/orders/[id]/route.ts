import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { action } = body; // "APPROVE" | "REJECT"

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    let newStatus = order.status;
    if (action === "APPROVE") newStatus = "COMPLETED";
    else if (action === "REJECT") newStatus = "REJECTED";

    const updated = await prisma.order.update({
      where: { id },
      data: { status: newStatus },
      include: { organization: { select: { id: true, name: true } } },
    });

    await createAuditLog({
      organizationId: order.organizationId,
      actorId: actor.userId,
      action: `PAYMENT_${action}`,
      details: { orderId: id, amount: order.amount, newStatus },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        tenant: (updated as any).organization,
        tenantId: updated.organizationId,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
