import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";

export async function GET(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");

    const where = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    const totalRevenue = await prisma.order.aggregate({
      _sum: { amount: true },
      where: { status: "COMPLETED" },
    });

    const pendingRevenue = await prisma.order.aggregate({
      _sum: { amount: true },
      where: { status: "PENDING" },
    });

    return NextResponse.json({
      success: true,
      data: orders.map((o: any) => ({
        ...o,
        tenant: o.organization,
        tenantId: o.organizationId,
      })),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalRevenue: totalRevenue._sum.amount || 0,
        pendingRevenue: pendingRevenue._sum.amount || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { organizationId, tenantId, productName, amount, paymentMethod = "CRYPTO", status = "PENDING" } = body;
    const targetOrgId = organizationId || tenantId;

    if (!targetOrgId || !productName || !amount) {
      return NextResponse.json(
        { success: false, error: "organizationId, productName, and amount are required" },
        { status: 400 }
      );
    }

    const order = await prisma.order.create({
      data: {
        organizationId: targetOrgId,
        productName,
        amount: Number(amount),
        currency: "USD",
        paymentMethod,
        status,
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        tenant: order.organization,
        tenantId: order.organizationId,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
