import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLicenseKey, hashLicenseKey, maskLicenseKey } from "@/lib/crypto";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    const where = tenantId ? { tenantId } : {};

    const licenses = await prisma.license.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true, type: true } },
        activations: {
          include: {
            device: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: licenses });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenantId, validDays = 365, activationLimit = 1 } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const rawLicenseKey = generateLicenseKey();
    const licenseHash = hashLicenseKey(rawLicenseKey);
    const keyMasked = maskLicenseKey(rawLicenseKey);

    const expiresAt = new Date(Date.now() + validDays * 24 * 3600 * 1000);

    const license = await prisma.license.create({
      data: {
        tenantId,
        licenseHash,
        keyMasked,
        status: "ACTIVE",
        expiresAt,
        activationLimit: Number(activationLimit) || 1,
      },
    });

    await createAuditLog({
      tenantId,
      action: "LICENSE_CREATED",
      details: { licenseId: license.id, keyMasked, activationLimit, expiresAt },
    });

    return NextResponse.json(
      {
        success: true,
        message: "License issued successfully. Store the raw license key safely — it will not be shown again!",
        data: {
          id: license.id,
          tenantId: license.tenantId,
          plaintextLicenseKey: rawLicenseKey, // Displayed ONLY ONCE
          keyMasked: license.keyMasked,
          status: license.status,
          activationLimit: license.activationLimit,
          expiresAt: license.expiresAt,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
