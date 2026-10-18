import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";

// DELETE /api/v1/devices/[id]: reset device activation slot
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    // Deactivate all activations for this device
    await prisma.licenseActivation.updateMany({
      where: { deviceId: (await params).id, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });

    await prisma.device.update({
      where: { id: (await params).id },
      data: { status: "INACTIVE" },
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "DEVICE_RESET",
      details: { deviceId: (await params).id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/v1/devices/[id]: update device status
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const device = await prisma.device.update({
      where: { id: (await params).id },
      data: { status: body.status },
    });

    return NextResponse.json({ success: true, data: device });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
