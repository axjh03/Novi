import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
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
          tenant: { select: { id: true, name: true, type: true } },
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
      data: orders,
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
  try {
    const body = await req.json();
    const { tenantId, productName, amount, paymentMethod = "CRYPTO", status = "PENDING" } = body;

    if (!tenantId || !productName || !amount) {
      return NextResponse.json(
        { success: false, error: "tenantId, productName, and amount are required" },
        { status: 400 }
      );
    }

    const order = await prisma.order.create({
      data: {
        tenantId,
        productName,
        amount: Number(amount),
        currency: "USD",
        paymentMethod,
        status,
      },
      include: {
        tenant: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
