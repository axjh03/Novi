import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    const where = tenantId ? { tenantId } : {};

    const devices = await prisma.device.findMany({
      where,
      include: {
        activations: {
          include: {
            license: {
              select: { id: true, keyMasked: true, status: true, expiresAt: true },
            },
          },
        },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return NextResponse.json({ success: true, data: devices });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
