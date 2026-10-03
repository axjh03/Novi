import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization");
    const deviceToken = body.deviceToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);

    if (!deviceToken) {
      return NextResponse.json({ success: false, error: "deviceToken is required" }, { status: 400 });
    }

    const activation = await prisma.licenseActivation.findUnique({
      where: { deviceToken },
      include: {
        license: {
          include: { tenant: true },
        },
        device: true,
      },
    });

    if (!activation || activation.deactivatedAt) {
      return NextResponse.json(
        {
          success: false,
          licenseStatus: "DEACTIVATED",
          error: "Device activation is inactive or has been reset.",
        },
        { status: 401 }
      );
    }

    if (activation.device.status === "BLOCKED") {
      return NextResponse.json(
        {
          success: false,
          licenseStatus: "BLOCKED",
          error: "Device has been blocked by administrator.",
        },
        { status: 403 }
      );
    }

    const now = new Date();
    const license = activation.license;

    let computedStatus = license.status;
    let graceRemainingHours = 0;

    // Evaluate live expiry and grace period
    if (license.status === "REVOKED") {
      computedStatus = "REVOKED";
    } else if (license.status === "SUSPENDED") {
      computedStatus = "SUSPENDED";
    } else if (now > license.expiresAt) {
      // Check offline grace period (default 24 hours after expiry)
      const defaultGraceUntil = new Date(license.expiresAt.getTime() + 24 * 3600 * 1000);
      const graceUntil = license.graceUntil || defaultGraceUntil;

      if (now < graceUntil) {
        computedStatus = "GRACE";
        graceRemainingHours = Math.max(0, Math.round((graceUntil.getTime() - now.getTime()) / (3600 * 1000)));
      } else {
        computedStatus = "EXPIRED";
      }
    }

    // Update heartbeat timestamp
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: { lastHeartbeat: now },
    });

    await prisma.device.update({
      where: { id: activation.deviceId },
      data: {
        lastSeenAt: now,
        appVersion: body.appVersion || activation.device.appVersion,
      },
    });

    await createAuditLog({
      tenantId: license.tenantId,
      actorId: activation.deviceId,
      action: "DEVICE_HEARTBEAT",
      details: { status: computedStatus, deviceName: activation.device.name },
    });

    return NextResponse.json({
      success: true,
      data: {
        licenseStatus: computedStatus,
        expiresAt: license.expiresAt,
        nextCheckIn: 14400, // 4 hours in seconds
        graceRemainingHours,
        tenant: {
          id: license.tenant.id,
          name: license.tenant.name,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
