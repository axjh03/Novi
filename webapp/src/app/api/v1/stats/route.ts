import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/jwt";

// GET /api/v1/stats — overview stats for admin dashboard
export async function GET(req: Request) {
  const actor = requireAuth(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const [
      totalUsers,
      corpUsers,
      indvUsers,
      totalTenants,
      corporations,
      individuals,
      activeLicenses,
      unactivatedLicenses,
      suspendedLicenses,
      revokedLicenses,
      expiredLicenses,
      activeDevices,
      totalDevices,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "CORP" } }),
      prisma.user.count({ where: { role: "INDIVIDUAL" } }),
      prisma.tenant.count(),
      prisma.tenant.count({ where: { type: "CORPORATION", parentTenantId: null } }),
      prisma.tenant.count({ where: { type: "INDIVIDUAL" } }),
      prisma.license.count({ where: { status: "ACTIVE" } }),
      prisma.license.count({ where: { status: "UNACTIVATED" } }),
      prisma.license.count({ where: { status: "SUSPENDED" } }),
      prisma.license.count({ where: { status: "REVOKED" } }),
      prisma.license.count({ where: { status: "EXPIRED" } }),
      prisma.device.count({ where: { status: "ACTIVE" } }),
      prisma.device.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: { total: totalUsers, corp: corpUsers, individual: indvUsers },
        tenants: { total: totalTenants, corporations, individuals },
        licenses: {
          active: activeLicenses,
          unactivated: unactivatedLicenses,
          suspended: suspendedLicenses,
          revoked: revokedLicenses,
          expired: expiredLicenses,
        },
        devices: { active: activeDevices, total: totalDevices },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
