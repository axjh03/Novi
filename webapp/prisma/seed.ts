import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const SERVER_SECRET = process.env.LICENSE_SERVER_SECRET || "novi_super_secret_hmac_key_2026";
const MASTER_KEY_HEX = process.env.ENCRYPTION_MASTER_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function hashLicenseKey(licenseKey: string): string {
  const cleanKey = licenseKey.trim().toUpperCase();
  return crypto.createHmac("sha256", SERVER_SECRET).update(cleanKey).digest("hex");
}

function encryptSecret(plaintext: string): string {
  const key = Buffer.from(MASTER_KEY_HEX.slice(0, 64), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

async function main() {
  console.log("🌱 Seeding local database...");

  // Clear existing
  await prisma.auditLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.apiCredential.deleteMany();
  await prisma.licenseActivation.deleteMany();
  await prisma.device.deleteMany();
  await prisma.license.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Users
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@novi.com",
      name: "Platform SuperAdmin",
      passwordHash: "pbkdf2_hashed_password",
    },
  });

  const aalokUser = await prisma.user.create({
    data: {
      email: "aalok@example.com",
      name: "Aalok Bhagat",
      passwordHash: "pbkdf2_hashed_password",
    },
  });

  const corpAdminUser = await prisma.user.create({
    data: {
      email: "cto@acme.com",
      name: "Sarah Connor (CTO)",
      passwordHash: "pbkdf2_hashed_password",
    },
  });

  // 2. Tenants: Individual
  const aalokTenant = await prisma.tenant.create({
    data: {
      name: "Aalok Bhagat (Personal)",
      type: "INDIVIDUAL",
      status: "ACTIVE",
    },
  });

  await prisma.membership.create({
    data: {
      userId: aalokUser.id,
      tenantId: aalokTenant.id,
      role: "OWNER",
    },
  });

  // 3. Tenants: Corporation & Sub-Corps
  const acmeCorp = await prisma.tenant.create({
    data: {
      name: "Acme Corporation",
      type: "CORPORATION",
      status: "ACTIVE",
    },
  });

  await prisma.membership.create({
    data: {
      userId: corpAdminUser.id,
      tenantId: acmeCorp.id,
      role: "OWNER",
    },
  });

  const dallasSubCorp = await prisma.tenant.create({
    data: {
      name: "Dallas Division",
      type: "CORPORATION",
      parentTenantId: acmeCorp.id,
      status: "ACTIVE",
    },
  });

  const austinSubCorp = await prisma.tenant.create({
    data: {
      name: "Austin Division",
      type: "CORPORATION",
      parentTenantId: acmeCorp.id,
      status: "ACTIVE",
    },
  });

  // 4. Create Licenses
  const key1 = "NVI-7K4M-PX29-QRT8-DM73";
  const license1 = await prisma.license.create({
    data: {
      tenantId: aalokTenant.id,
      licenseHash: hashLicenseKey(key1),
      keyMasked: "NVI-7K4M-****-****-DM73",
      status: "ACTIVE",
      issuedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      activatedAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() + 335 * 24 * 3600 * 1000),
      activationLimit: 2,
    },
  });

  const key2 = "NVI-9X82-WPL4-MN10-ACME";
  const license2 = await prisma.license.create({
    data: {
      tenantId: dallasSubCorp.id,
      licenseHash: hashLicenseKey(key2),
      keyMasked: "NVI-9X82-****-****-ACME",
      status: "ACTIVE",
      issuedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
      activatedAt: new Date(Date.now() - 58 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
      activationLimit: 5,
    },
  });

  const key3 = "NVI-11AA-22BB-33CC-AUST";
  const license3 = await prisma.license.create({
    data: {
      tenantId: austinSubCorp.id,
      licenseHash: hashLicenseKey(key3),
      keyMasked: "NVI-11AA-****-****-AUST",
      status: "GRACE",
      issuedAt: new Date(Date.now() - 370 * 24 * 3600 * 1000),
      activatedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 1 * 24 * 3600 * 1000), // expired yesterday
      graceUntil: new Date(Date.now() + 2 * 24 * 3600 * 1000), // 2 days grace remaining
      activationLimit: 3,
    },
  });

  const key4 = "NVI-44DD-55EE-66FF-EXPR";
  await prisma.license.create({
    data: {
      tenantId: austinSubCorp.id,
      licenseHash: hashLicenseKey(key4),
      keyMasked: "NVI-44DD-****-****-EXPR",
      status: "EXPIRED",
      issuedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 35 * 24 * 3600 * 1000),
      activationLimit: 1,
    },
  });

  // 5. Create Devices & Activations
  const dev1 = await prisma.device.create({
    data: {
      tenantId: aalokTenant.id,
      name: "Aalok-PC Workstation",
      platform: "win32",
      appVersion: "1.4.0",
      fingerprintHash: "fp_win_aalok_pc_99812",
      status: "ACTIVE",
      firstSeenAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
      lastSeenAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
    },
  });

  await prisma.licenseActivation.create({
    data: {
      licenseId: license1.id,
      deviceId: dev1.id,
      deviceToken: "devtok_aalok_pc_token_12345",
      activatedAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
      lastHeartbeat: new Date(Date.now() - 15 * 60 * 1000),
    },
  });

  const dev2 = await prisma.device.create({
    data: {
      tenantId: aalokTenant.id,
      name: "Aalok-MacBook-Pro",
      platform: "darwin",
      appVersion: "1.4.0",
      fingerprintHash: "fp_mac_aalok_mbp_44211",
      status: "ACTIVE",
      firstSeenAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      lastSeenAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago
    },
  });

  await prisma.licenseActivation.create({
    data: {
      licenseId: license1.id,
      deviceId: dev2.id,
      deviceToken: "devtok_aalok_mac_token_67890",
      activatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      lastHeartbeat: new Date(Date.now() - 2 * 3600 * 1000),
    },
  });

  const devDallas1 = await prisma.device.create({
    data: {
      tenantId: dallasSubCorp.id,
      name: "DALLAS-DESKTOP-01",
      platform: "win32",
      appVersion: "1.4.0",
      fingerprintHash: "fp_dallas_desktop_01",
      status: "ACTIVE",
      firstSeenAt: new Date(Date.now() - 50 * 24 * 3600 * 1000),
      lastSeenAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  await prisma.licenseActivation.create({
    data: {
      licenseId: license2.id,
      deviceId: devDallas1.id,
      deviceToken: "devtok_dallas_01_token",
      activatedAt: new Date(Date.now() - 50 * 24 * 3600 * 1000),
      lastHeartbeat: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  // 6. Encrypted API Credentials
  await prisma.apiCredential.create({
    data: {
      provider: "OPENAI",
      label: "Main OpenAI Key",
      scope: "PERSONAL",
      encryptedSecret: encryptSecret("sk-proj-99281726384910284719284710"),
      tenantId: aalokTenant.id,
      userId: aalokUser.id,
    },
  });

  await prisma.apiCredential.create({
    data: {
      provider: "ANTHROPIC",
      label: "Claude Pro Key",
      scope: "PERSONAL",
      encryptedSecret: encryptSecret("sk-ant-api03-8829102938471-prod-AA"),
      tenantId: aalokTenant.id,
      userId: aalokUser.id,
    },
  });

  await prisma.apiCredential.create({
    data: {
      provider: "OPENAI",
      label: "Acme Corp Shared GPT-4",
      scope: "TENANT",
      encryptedSecret: encryptSecret("sk-proj-acme-corp-enterprise-master-key"),
      tenantId: acmeCorp.id,
      userId: corpAdminUser.id,
    },
  });

  // 7. Orders & Billing
  await prisma.order.create({
    data: {
      tenantId: aalokTenant.id,
      productName: "Novi Pro Individual (1 Year)",
      amount: 199.0,
      currency: "USD",
      paymentMethod: "CRYPTO",
      status: "COMPLETED",
    },
  });

  await prisma.order.create({
    data: {
      tenantId: acmeCorp.id,
      productName: "Novi Enterprise License (10 Seats)",
      amount: 2990.0,
      currency: "USD",
      paymentMethod: "CRYPTO",
      status: "COMPLETED",
    },
  });

  // 8. Audit Logs
  await prisma.auditLog.create({
    data: {
      actorId: adminUser.id,
      tenantId: acmeCorp.id,
      action: "TENANT_CREATED",
      details: JSON.stringify({ name: "Acme Corporation", type: "CORPORATION" }),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: aalokUser.id,
      tenantId: aalokTenant.id,
      action: "LICENSE_ACTIVATED",
      details: JSON.stringify({ device: "Aalok-PC Workstation", licenseMasked: "NVI-7K4M-****-****-DM73" }),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: dev1.id,
      tenantId: aalokTenant.id,
      action: "DEVICE_HEARTBEAT",
      details: JSON.stringify({ status: "ACTIVE", nextCheckIn: 14400 }),
    },
  });

  console.log("✅ Seed database finished successfully!");
  console.log("🔑 Demo License Keys generated:");
  console.log(`  - Aalok Personal: ${key1}`);
  console.log(`  - Dallas Division: ${key2}`);
  console.log(`  - Austin Division (Grace): ${key3}`);
  console.log(`  - Austin Division (Expired): ${key4}`);
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
