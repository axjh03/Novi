import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/jwt";
import { createAuditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";

// GET /api/v1/admin/users/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: (await params).id },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                children: true,
                licenses: {
                  include: { activations: { include: { device: true } } },
                },
              },
            },
          },
        },
        licenses: {
          include: {
            organization: true,
            activations: { include: { device: true } },
          },
        },
      },
    });

    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const formattedMemberships = user.memberships.map((m: any) => ({
      ...m,
      tenant: m.organization ? {
        ...m.organization,
        parentTenantId: m.organization.parentOrganizationId,
      } : null,
      tenantId: m.organizationId,
    }));

    const formattedLicenses = user.licenses.map((l: any) => ({
      ...l,
      tenant: l.organization,
      tenantId: l.organizationId,
    }));

    const { passwordHash: _, ...safeUser } = {
      ...user,
      memberships: formattedMemberships,
      licenses: formattedLicenses,
    } as any;
    return NextResponse.json({ success: true, data: safeUser });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/v1/admin/users/[id]: reset password or update
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updateData: any = {};

    if (body.password) {
      updateData.passwordHash = await bcrypt.hash(body.password, 12);
    }
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email.toLowerCase().trim();

    const user = await prisma.user.update({
      where: { id: (await params).id },
      data: updateData,
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "USER_UPDATED",
      details: { userId: (await params).id, fields: Object.keys(updateData) },
    });

    const { passwordHash: _, ...safeUser } = user as any;
    return NextResponse.json({ success: true, data: safeUser });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/v1/admin/users/[id]: delete user (cascades licenses if unactivated, removes activation links)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requireAdmin(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: (await params).id },
      include: {
        licenses: true,
        memberships: { include: { organization: true } },
      },
    });

    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // Revoke all licenses bound to this user
    if (user.licenses.length > 0) {
      await prisma.license.updateMany({
        where: { userId: (await params).id },
        data: { status: "REVOKED", userId: null },
      });
    }

    await prisma.user.delete({ where: { id: (await params).id } });

    await createAuditLog({
      actorId: actor.userId,
      action: "USER_DELETED",
      details: { userId: (await params).id, email: user.email, licensesRevoked: user.licenses.length },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
