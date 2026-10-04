import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/jwt";

// GET /api/v1/audit-logs
export async function GET(req: Request) {
  const actor = requireAuth(req);
  if (!actor || actor.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const organizationId = searchParams.get("organizationId") || searchParams.get("tenantId");

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        organization: { select: { name: true } },
        actor: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: logs.map((l: any) => ({
        ...l,
        tenant: l.organization,
        tenantId: l.organizationId,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
