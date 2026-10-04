import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const existing = await prisma.apiCredential.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
    }

    await prisma.apiCredential.delete({ where: { id } });

    await createAuditLog({
      organizationId: existing.organizationId || undefined,
      actorId: existing.userId || undefined,
      action: "API_KEY_DELETED",
      details: { provider: existing.provider, label: existing.label },
    });

    return NextResponse.json({ success: true, message: "Credential deleted successfully" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
