import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("tenantId");
    const userId = searchParams.get("userId");
    const reveal = searchParams.get("reveal") === "true";

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;

    const credentials = await prisma.apiCredential.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const formatted = credentials.map((cred) => {
      const decrypted = decryptSecret(cred.encryptedSecret);
      const masked = decrypted.length > 8 ? `${decrypted.slice(0, 7)}...${decrypted.slice(-4)}` : "••••••••";
      return {
        id: cred.id,
        provider: cred.provider,
        label: cred.label,
        scope: cred.scope,
        organizationId: cred.organizationId,
        tenantId: cred.organizationId,
        userId: cred.userId,
        secret: reveal ? decrypted : masked,
        isEncryptedAtRest: true,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { provider, label, secret, scope = "ORGANIZATION", organizationId, tenantId, userId } = body;
    const targetOrgId = organizationId || tenantId;

    if (!provider || !label || !secret) {
      return NextResponse.json(
        { success: false, error: "provider, label, and secret are required" },
        { status: 400 }
      );
    }

    const encryptedSecret = encryptSecret(secret);

    const credential = await prisma.apiCredential.create({
      data: {
        provider: provider.toUpperCase(),
        label,
        scope: scope === "TENANT" ? "ORGANIZATION" : scope,
        encryptedSecret,
        organizationId: targetOrgId || null,
        userId: userId || null,
      },
    });

    await createAuditLog({
      organizationId: targetOrgId || undefined,
      actorId: userId || undefined,
      action: "API_KEY_CREATED",
      details: { provider, label, scope, credentialId: credential.id },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: credential.id,
          provider: credential.provider,
          label: credential.label,
          scope: credential.scope,
          isEncryptedAtRest: true,
          createdAt: credential.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
