import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import crypto from "crypto";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "10");
    const skip = (page - 1) * pageSize;

    const users = await prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: {
            tenant: true,
          },
        },
      },
    });

    const total = await prisma.user.count();

    return NextResponse.json({
      success: true,
      data: users,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, type } = body; // type is "CORPORATION" or "INDIVIDUAL"

    if (!email || !password || !name || !type) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    // Hash password (dummy hashing for this example)
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

    // Create user and tenant in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: type === "CORPORATION" ? `${name} Corp` : `${name}'s Account`,
          type,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: "OWNER",
        },
      });

      return { user, tenant };
    });

    await createAuditLog({
      action: "USER_CREATED",
      tenantId: result.tenant.id,
      details: { email, type },
    });

    return NextResponse.json({ success: true, data: result.user });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ success: false, error: "Email already exists" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
