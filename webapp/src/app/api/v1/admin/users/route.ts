import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";

// GET /api/v1/admin/users?page=1&pageSize=10&search=query
export async function GET(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");
    const search = url.searchParams.get("search") || "";
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { username: { contains: search } },
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        where,
        orderBy: { createdAt: "desc" },
        include: {
          memberships: {
            include: { organization: { include: { parentOrganization: true } } },
          },
          licenses: {
            select: { id: true, status: true, keyMasked: true, expiresAt: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((u: any) => ({
      ...u,
      memberships: u.memberships?.map((m: any) => ({
        ...m,
        tenant: m.organization,
        tenantId: m.organizationId,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/v1/admin/users — Create user (ADMIN only)
// body: { username, email, password, name, role, tenantId? (if corp sub-user), parentTenantId? }
export async function POST(req: Request) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { email, username, password, name, role, parentTenantId } = body;

    if (!email || !username || !password || !name || !role) {
      return NextResponse.json({ success: false, error: "Missing required fields: email, username, password, name, role" }, { status: 400 });
    }

    if (!["CORP", "INDIVIDUAL"].includes(role)) {
      return NextResponse.json({ success: false, error: "Role must be CORP or INDIVIDUAL" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          username: username.toLowerCase().trim(),
          name,
          passwordHash,
          role,
        },
      });

      const orgType = role === "CORP" ? "CORPORATION" : "INDIVIDUAL";
      const organization = await tx.organization.create({
        data: {
          name: role === "CORP" ? `${name} Corp` : `${name}'s Account`,
          type: orgType,
          parentOrganizationId: parentTenantId || null,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "OWNER",
        },
      });

      return { user, organization };
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "USER_CREATED",
      organizationId: result.organization.id,
      details: { email, username, role, organizationId: result.organization.id },
    });

    return NextResponse.json({ success: true, data: { ...result.user, passwordHash: undefined } }, { status: 201 });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ success: false, error: "Username or email already exists" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
