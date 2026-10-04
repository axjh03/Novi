import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Username and password required" }, { status: 400 });
    }

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase().trim() },
          { email: username.toLowerCase().trim() },
        ],
      },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    // Get primary organization
    const primaryMembership = user.memberships[0];
    const organizationId = primaryMembership?.organizationId;
    const organization = primaryMembership?.organization;

    const token = signToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role as "ADMIN" | "CORP" | "INDIVIDUAL",
      organizationId,
      tenantId: organizationId,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId,
        organizationName: organization?.name,
        organizationType: organization?.type,
        tenantId: organizationId,
        tenantName: organization?.name,
        tenantType: organization?.type,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
