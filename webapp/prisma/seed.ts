import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

// Retired /api/v1 data only; license hashes must match the server's real secret.
const SERVER_SECRET = process.env.LICENSE_SERVER_SECRET || "";
if (SERVER_SECRET.length < 32) throw new Error("Configure LICENSE_SERVER_SECRET with at least 32 random characters.");

function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "NVI";
  for (let i = 0; i < 4; i++) {
    key += "-";
    for (let j = 0; j < 4; j++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return key;
}

function hashLicenseKey(licenseKey: string): string {
  return crypto.createHmac("sha256", SERVER_SECRET).update(licenseKey.trim().toUpperCase()).digest("hex");
}

function maskLicenseKey(licenseKey: string): string {
  const parts = licenseKey.trim().split("-");
  if (parts.length === 5) {
    return `${parts[0]}-${parts[1]}-****-****-${parts[4]}`;
  }
  return `${licenseKey.slice(0, 8)}****${licenseKey.slice(-4)}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Admin ─────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@astra.local",
      name: "Platform Admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log("✅ Admin:", admin.username, "/ admin123");

  // ── Corporation: AcmeCorp ─────────────────────────────────────────
  const corpHash = await bcrypt.hash("corp123", 12);
  const corpUser = await prisma.user.upsert({
    where: { username: "acmecorp" },
    update: {},
    create: {
      username: "acmecorp",
      email: "admin@acmecorp.com",
      name: "Acme Corporation",
      passwordHash: corpHash,
      role: "CORP",
    },
  });

  const acmeOrganization = await prisma.organization.upsert({
    where: { id: "org_acme_corp_001" },
    update: {},
    create: {
      id: "org_acme_corp_001",
      name: "Acme Corp",
      type: "CORPORATION",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: corpUser.id, organizationId: acmeOrganization.id } },
    update: {},
    create: { userId: corpUser.id, organizationId: acmeOrganization.id, role: "OWNER" },
  });
  console.log("✅ Corp:", corpUser.username, "/ corp123");

  // ── Sub-Corp under Acme ────────────────────────────────────────────
  const subCorpHash = await bcrypt.hash("subcorp123", 12);
  const subCorpUser = await prisma.user.upsert({
    where: { username: "acme_west" },
    update: {},
    create: {
      username: "acme_west",
      email: "admin@acme-west.com",
      name: "Acme West Division",
      passwordHash: subCorpHash,
      role: "CORP",
    },
  });

  const acmeWestOrganization = await prisma.organization.upsert({
    where: { id: "org_acme_west_001" },
    update: {},
    create: {
      id: "org_acme_west_001",
      name: "Acme West",
      type: "CORPORATION",
      parentOrganizationId: acmeOrganization.id,
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: subCorpUser.id, organizationId: acmeWestOrganization.id } },
    update: {},
    create: { userId: subCorpUser.id, organizationId: acmeWestOrganization.id, role: "OWNER" },
  });
  console.log("✅ Sub-Corp:", subCorpUser.username, "/ subcorp123");

  // ── Individual User ────────────────────────────────────────────────
  const indvHash = await bcrypt.hash("indv123", 12);
  const indvUser = await prisma.user.upsert({
    where: { username: "johndoe" },
    update: {},
    create: {
      username: "johndoe",
      email: "john@example.com",
      name: "John Doe",
      passwordHash: indvHash,
      role: "INDIVIDUAL",
    },
  });

  const indvOrganization = await prisma.organization.upsert({
    where: { id: "org_john_001" },
    update: {},
    create: {
      id: "org_john_001",
      name: "John Doe's Account",
      type: "INDIVIDUAL",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: indvUser.id, organizationId: indvOrganization.id } },
    update: {},
    create: { userId: indvUser.id, organizationId: indvOrganization.id, role: "OWNER" },
  });
  console.log("✅ Individual:", indvUser.username, "/ indv123");

  // ── Issue sample licenses ──────────────────────────────────────────
  // License for Acme Corp (UNACTIVATED — waiting for user to enter key)
  const corpLicKey = generateLicenseKey();
  console.log("\n📋 Sample license keys (save these!):");
  console.log("  Acme Corp license:", corpLicKey);
  await prisma.license.create({
    data: {
      organizationId: acmeOrganization.id,
      licenseHash: hashLicenseKey(corpLicKey),
      keyMasked: maskLicenseKey(corpLicKey),
      status: "UNACTIVATED",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      activationLimit: 1,
    },
  }).catch(() => {}); // ignore duplicate

  // License for individual (UNACTIVATED)
  const indvLicKey = generateLicenseKey();
  console.log("  John Doe license:", indvLicKey);
  await prisma.license.create({
    data: {
      organizationId: indvOrganization.id,
      licenseHash: hashLicenseKey(indvLicKey),
      keyMasked: maskLicenseKey(indvLicKey),
      status: "UNACTIVATED",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      activationLimit: 1,
    },
  }).catch(() => {}); // ignore duplicate

  console.log("\n✅ Seed complete!\n");
  console.log("Login credentials:");
  console.log("  Admin:    username=admin       password=admin123");
  console.log("  Corp:     username=acmecorp    password=corp123");
  console.log("  Sub-Corp: username=acme_west   password=subcorp123");
  console.log("  Indv:     username=johndoe     password=indv123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
