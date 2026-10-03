import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return NextResponse.json({ success: false, error: "Device not found" }, { status: 404 });
    }

    // Mark all activations as deactivated
    await prisma.licenseActivation.updateMany({
      where: { deviceId: id, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });

    // Update device status to INACTIVE
    const updated = await prisma.device.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await createAuditLog({
      tenantId: device.tenantId,
      actorId: id,
      action: "DEVICE_RESET",
      details: { deviceName: device.name, fingerprintHash: device.fingerprintHash },
    });

    return NextResponse.json({
      success: true,
      message: `Device "${device.name}" deactivated successfully and slot freed.`,
      data: updated,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
