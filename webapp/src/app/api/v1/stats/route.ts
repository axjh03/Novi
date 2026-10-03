import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const totalTenants = await prisma.tenant.count();
    const corporationCount = await prisma.tenant.count({ where: { type: "CORPORATION", parentTenantId: null } });
    const subCorpCount = await prisma.tenant.count({ where: { type: "CORPORATION", parentTenantId: { not: null } } });
    const individualCount = await prisma.tenant.count({ where: { type: "INDIVIDUAL" } });

    const totalLicenses = await prisma.license.count();
    const activeLicenses = await prisma.license.count({ where: { status: "ACTIVE" } });
    const graceLicenses = await prisma.license.count({ where: { status: "GRACE" } });
    const expiredLicenses = await prisma.license.count({ where: { status: "EXPIRED" } });

    const totalDevices = await prisma.device.count();
    const activeDevices = await prisma.device.count({ where: { status: "ACTIVE" } });

    const totalRevenue = await prisma.order.aggregate({
      _sum: { amount: true },
      where: { status: "COMPLETED" },
    });

    return NextResponse.json({
      success: true,
      data: {
        tenants: {
          total: totalTenants,
          corporations: corporationCount,
          subCorps: subCorpCount,
          individuals: individualCount,
        },
        licenses: {
          total: totalLicenses,
          active: activeLicenses,
          grace: graceLicenses,
          expired: expiredLicenses,
        },
        devices: {
          total: totalDevices,
          active: activeDevices,
        },
        revenue: totalRevenue._sum.amount || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
