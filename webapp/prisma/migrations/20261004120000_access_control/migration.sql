-- CreateTable
-- A partial unique index below enforces a single administrator across all writes.
CREATE TABLE "AccessAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccessAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessLicense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessLicense_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessLicense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "activeSlot" TEXT,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagedCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagedCredential_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LicenseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicenseRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AccessAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessAccount_username_key" ON "AccessAccount"("username");

-- CreateIndex
CREATE INDEX "AccessAccount_parentId_idx" ON "AccessAccount"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessLicense_key_key" ON "AccessLicense"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AccessLicense_accountId_key" ON "AccessLicense"("accountId");

-- CreateIndex
CREATE INDEX "AccessLicense_ownerId_idx" ON "AccessLicense"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessSession_activeSlot_key" ON "AccessSession"("activeSlot");

-- CreateIndex
CREATE INDEX "AccessSession_accountId_idx" ON "AccessSession"("accountId");

-- CreateIndex
CREATE INDEX "ManagedCredential_ownerId_idx" ON "ManagedCredential"("ownerId");

CREATE UNIQUE INDEX "AccessAccount_single_admin" ON "AccessAccount" ("role") WHERE "role" = 'ADMIN';
CREATE TRIGGER "AccessLicense_no_transfer" BEFORE UPDATE ON "AccessLicense"
WHEN NEW."key" <> OLD."key" OR NEW."ownerId" <> OLD."ownerId"
OR (OLD."accountId" IS NOT NULL AND NEW."accountId" IS NOT OLD."accountId")
OR (OLD."status" = 'TERMINATED' AND NEW."status" <> 'TERMINATED')
BEGIN SELECT RAISE(ABORT, 'License identity and assigned account are permanent'); END;
CREATE TRIGGER "AccessLicense_no_delete" BEFORE DELETE ON "AccessLicense"
BEGIN SELECT RAISE(ABORT, 'Licenses must be terminated, never deleted'); END;
CREATE TRIGGER "AccessAccount_no_move" BEFORE UPDATE ON "AccessAccount"
WHEN NEW."role" <> OLD."role" OR NEW."parentId" IS NOT OLD."parentId"
BEGIN SELECT RAISE(ABORT, 'Account role and hierarchy are permanent'); END;
