import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/jwt";

// GET /api/v1/devices?tenantId=x
export async function GET(req: Request) {
  const actor = requireAuth(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    // Admin can view all, others only their own tenant
    const where: any = {};
    if (actor.role === "ADMIN") {
      if (tenantId) where.tenantId = tenantId;
    } else {
      where.tenantId = actor.tenantId;
    }

    const devices = await prisma.device.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true, type: true } },
        activations: {
          where: { deactivatedAt: null },
          include: {
            license: {
              select: { id: true, keyMasked: true, status: true, expiresAt: true, userId: true, user: { select: { username: true, name: true } } },
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
