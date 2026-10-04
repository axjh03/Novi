import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/jwt";
import { hashLicenseKey } from "@/lib/crypto";
import { createAuditLog } from "@/lib/audit";
import { generateDeviceToken } from "@/lib/crypto";

// POST /api/v1/licenses/activate
// Body: { licenseKey, deviceFingerprint, deviceName, platform, appVersion }
// Called by the user (corp or individual) to activate their license on a device
export async function POST(req: Request) {
  const actor = requireAuth(req);
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { licenseKey, deviceFingerprint, deviceName, platform, appVersion } = body;

    if (!licenseKey || !deviceFingerprint) {
      return NextResponse.json({ success: false, error: "licenseKey and deviceFingerprint are required" }, { status: 400 });
    }

    const licenseHash = hashLicenseKey(licenseKey.trim().toUpperCase());

    // Find the license
    const license = await prisma.license.findUnique({
      where: { licenseHash },
      include: {
        organization: {
          include: {
            memberships: { select: { userId: true } },
          },
        },
        activations: { where: { deactivatedAt: null } },
      },
    });

    if (!license) {
      return NextResponse.json({ success: false, error: "Invalid license key" }, { status: 400 });
    }

    // Check if license belongs to user's organization or if user is a member
    const orgMemberIds = license.organization.memberships.map((m: any) => m.userId);
    if (!orgMemberIds.includes(actor.userId) && license.userId !== actor.userId) {
      return NextResponse.json({ success: false, error: "This license is not assigned to your account" }, { status: 403 });
    }

    // Check status
    if (license.status === "REVOKED") {
      return NextResponse.json({ success: false, error: "This license has been revoked" }, { status: 400 });
    }
    if (license.status === "SUSPENDED") {
      return NextResponse.json({ success: false, error: "This license is suspended. Contact admin." }, { status: 400 });
    }
    if (license.status === "EXPIRED") {
      return NextResponse.json({ success: false, error: "This license has expired" }, { status: 400 });
    }

    // If already bound to a different user
    if (license.userId && license.userId !== actor.userId) {
      return NextResponse.json({ success: false, error: "This license is already activated by another account" }, { status: 400 });
    }

    // Find or create device
    let device = await prisma.device.findUnique({
      where: { organizationId_fingerprintHash: { organizationId: license.organizationId, fingerprintHash: deviceFingerprint } },
    });

    if (!device) {
      device = await prisma.device.create({
        data: {
          organizationId: license.organizationId,
          fingerprintHash: deviceFingerprint,
          name: deviceName || "Unknown Device",
          platform: platform || "Unknown",
          appVersion: appVersion || "Unknown",
          lastUsedByUserId: actor.userId,
        },
      });
    }

    // Check for concurrent session violation: is this user already active on another device?
    const existingActivation = await prisma.licenseActivation.findFirst({
      where: {
        licenseId: license.id,
        userId: actor.userId,
        deactivatedAt: null,
        deviceId: { not: device.id },
      },
      include: { device: true },
    });

    if (existingActivation) {
      // Session violation! User is already active on another device.
      return NextResponse.json({
        success: false,
        error: "SESSION_VIOLATION",
        message: "Your account is already active on another device. Please log out from that device first.",
        activeDevice: existingActivation.device?.name || "Unknown Device",
        activationId: existingActivation.id,
      }, { status: 409 });
    }

    // Check activation slots
    const activeCount = license.activations.length;
    const existingOnThisDevice = license.activations.find((a: any) => a.deviceId === device!.id);

    if (!existingOnThisDevice && activeCount >= license.activationLimit) {
      return NextResponse.json({
        success: false,
        error: "SLOT_FULL",
        message: "No activation slots available. This device cannot be registered.",
      }, { status: 400 });
    }

    const deviceToken = generateDeviceToken();

    // Create or update activation
    const activation = await prisma.licenseActivation.upsert({
      where: { licenseId_deviceId: { licenseId: license.id, deviceId: device.id } },
      update: {
        deactivatedAt: null,
        lastHeartbeat: new Date(),
        deviceToken,
        userId: actor.userId,
      },
      create: {
        licenseId: license.id,
        deviceId: device.id,
        userId: actor.userId,
        deviceToken,
        lastHeartbeat: new Date(),
      },
    });

    // Mark license as activated and bind to user
    await prisma.license.update({
      where: { id: license.id },
      data: {
        status: "ACTIVE",
        userId: actor.userId,
        activatedAt: license.activatedAt ?? new Date(),
      },
    });

    // Update device last seen
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastUsedByUserId: actor.userId },
    });

    await createAuditLog({
      actorId: actor.userId,
      action: "LICENSE_ACTIVATED",
      organizationId: license.organizationId,
      details: { licenseId: license.id, deviceId: device.id, platform },
    });

    return NextResponse.json({
      success: true,
      data: {
        activationId: activation.id,
        deviceToken: activation.deviceToken,
        expiresAt: license.expiresAt,
        licenseStatus: "ACTIVE",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
