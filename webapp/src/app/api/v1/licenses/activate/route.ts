import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashLicenseKey, generateDeviceToken } from "@/lib/crypto";
import { createAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { licenseKey, device } = body;

    if (!licenseKey || !device || !device.fingerprint) {
      return NextResponse.json(
        { success: false, error: "licenseKey and device fingerprint are required" },
        { status: 400 }
      );
    }

    const licenseHash = hashLicenseKey(licenseKey);

    const license = await prisma.license.findUnique({
      where: { licenseHash },
      include: {
        tenant: true,
        activations: {
          where: { deactivatedAt: null },
        },
      },
    });

    if (!license) {
      return NextResponse.json({ success: false, error: "Invalid license key" }, { status: 404 });
    }

    // Check license status & expiry
    const now = new Date();
    if (license.status === "REVOKED") {
      return NextResponse.json({ success: false, error: "License has been revoked by administration" }, { status: 403 });
    }
    if (license.status === "SUSPENDED") {
      return NextResponse.json({ success: false, error: "License is currently suspended" }, { status: 403 });
    }
    if (now > license.expiresAt) {
      return NextResponse.json({ success: false, error: "License has expired. Please renew." }, { status: 403 });
    }

    // Upsert Device record
    const deviceRecord = await prisma.device.upsert({
      where: {
        tenantId_fingerprintHash: {
          tenantId: license.tenantId,
          fingerprintHash: device.fingerprint,
        },
      },
      update: {
        name: device.deviceName || "Desktop Client",
        platform: device.platform || "unknown",
        appVersion: device.appVersion || "1.0.0",
        publicKey: device.publicKey || null,
        lastSeenAt: now,
        status: "ACTIVE",
      },
      create: {
        tenantId: license.tenantId,
        name: device.deviceName || "Desktop Client",
        platform: device.platform || "unknown",
        appVersion: device.appVersion || "1.0.0",
        fingerprintHash: device.fingerprint,
        publicKey: device.publicKey || null,
        status: "ACTIVE",
      },
    });

    // Check if device is already activated for this license
    const existingActivation = await prisma.licenseActivation.findUnique({
      where: {
        licenseId_deviceId: {
          licenseId: license.id,
          deviceId: deviceRecord.id,
        },
      },
    });

    if (existingActivation && !existingActivation.deactivatedAt) {
      // Re-use existing activation token
      await createAuditLog({
        tenantId: license.tenantId,
        actorId: deviceRecord.id,
        action: "LICENSE_REACTIVATED",
        details: { deviceName: deviceRecord.name, licenseMasked: license.keyMasked },
      });

      return NextResponse.json({
        success: true,
        data: {
          activationId: existingActivation.id,
          deviceToken: existingActivation.deviceToken,
          license: {
            id: license.id,
            status: license.status,
            expiresAt: license.expiresAt,
            keyMasked: license.keyMasked,
          },
          tenant: {
            id: license.tenant.id,
            name: license.tenant.name,
            type: license.tenant.type,
          },
        },
      });
    }

    // Check slot limit for new activations
    if (license.activations.length >= license.activationLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `Activation limit reached (${license.activations.length}/${license.activationLimit} slots used). Please deactivate another device or upgrade your license.`,
        },
        { status: 403 }
      );
    }

    // Create new activation record
    const deviceToken = generateDeviceToken();
    const activation = await prisma.licenseActivation.create({
      data: {
        licenseId: license.id,
        deviceId: deviceRecord.id,
        deviceToken,
        activatedAt: now,
        lastHeartbeat: now,
      },
    });

    // Update license activation timestamp if first time
    if (!license.activatedAt) {
      await prisma.license.update({
        where: { id: license.id },
        data: { activatedAt: now },
      });
    }

    await createAuditLog({
      tenantId: license.tenantId,
      actorId: deviceRecord.id,
      action: "LICENSE_ACTIVATED",
      details: { deviceName: deviceRecord.name, licenseMasked: license.keyMasked },
    });

    return NextResponse.json({
      success: true,
      data: {
        activationId: activation.id,
        deviceToken,
        license: {
          id: license.id,
          status: license.status,
          expiresAt: license.expiresAt,
          keyMasked: license.keyMasked,
        },
        tenant: {
          id: license.tenant.id,
          name: license.tenant.name,
          type: license.tenant.type,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
