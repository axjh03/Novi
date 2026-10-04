"use client";

import React from "react";
import { Database } from "lucide-react";

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: "#0a0a0a",
      border: "1px solid #1a1a1a",
      borderRadius: 4,
      padding: "14px 16px",
      fontFamily: "monospace",
      fontSize: 11.5,
      color: "#888",
      overflowX: "auto",
      lineHeight: 1.7,
    }}>
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#666", letterSpacing: "0.06em" }}>{title}</div>
      {children}
    </div>
  );
}

export function ArchitectureView() {
  return (
    <div style={{ maxWidth: 780, padding: "24px 0", display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5" }}>Architecture</div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>DB design, Tenant model, and PostgreSQL migration guide</div>
      </div>

      {/* Current DB */}
      <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 6, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Current Database</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888", marginTop: 4 }}>
            PostgreSQL · <span style={{ color: "#22c55e" }}>Supabase</span> · AWS us-east-2
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 11, color: "#22c55e" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          Connected
        </div>
      </div>

      <Section title="UNIFIED ORGANIZATION MODEL">
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8 }}>
          A single <span style={{ fontFamily: "monospace", color: "#888" }}>Tenant</span> table handles Individuals, Corporations, and nested Sub-Corps via <span style={{ fontFamily: "monospace", color: "#888" }}>parentTenantId</span>.
          No separate tables needed for each level.
        </div>
        <Code>{`Tenant {
  id
  type: "INDIVIDUAL" | "CORPORATION"
  name
  parentTenantId?     // → Sub-Corp relationship
  status
}

Corp → Sub-Corp → Sub-Corp → Licenses → Devices  (unlimited depth)`}</Code>
      </Section>

      <Section title="LICENSE SECURITY">
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8 }}>
          Raw license keys are <strong style={{ color: "#888" }}>never stored</strong>. Only the HMAC-SHA256 hash is persisted. Keys are displayed exactly once upon generation.
        </div>
        <Code>{`rawKey = secureRandom()                  // "NVI-7K4M-PX29-QRT8-DM73"
hash   = HMAC-SHA256(serverSecret, rawKey)

Database stores:  licenseHash    ✓
Customer gets:    plaintextKey   (shown once)

Activation: HMAC(input) → lookup → verify status → bind device`}</Code>
      </Section>

      <Section title="API KEY ENCRYPTION">
        <Code>{`plaintext  →  AES-256-GCM(masterKey)  →  PostgreSQL

Stored: iv:authTag:ciphertext    (never raw sk-xxxx)

Decryption only at runtime, master key in env vars.
Production: use AWS KMS / Google Cloud KMS`}</Code>
      </Section>

      <Section title="MIGRATE TO CLOUD POSTGRESQL">
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8 }}>
          Three steps — no code changes, only config:
        </div>
        <Code>{`# Step 1: Update prisma/schema.prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}

# Step 2: Update .env
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"

# Step 3: Push schema + seed
npx prisma db push
npx tsx prisma/seed.ts`}</Code>
        <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace" }}>
          Recommended: Neon · Supabase · Railway · AWS RDS · GCP Cloud SQL
        </div>
      </Section>

      <Section title="REST API SURFACE">
        <Code>{`POST   /api/v1/auth/login
GET    /api/v1/stats
GET    /api/v1/admin/tenants        POST /api/v1/admin/tenants
GET    /api/v1/admin/licenses       POST /api/v1/admin/licenses
PATCH  /api/v1/admin/licenses/:id
POST   /api/v1/licenses/activate
POST   /api/v1/devices/heartbeat
GET    /api/v1/devices              DELETE /api/v1/devices/:id
GET    /api/v1/credentials          POST   /api/v1/credentials
DELETE /api/v1/credentials/:id
GET    /api/v1/orders               POST   /api/v1/orders
PATCH  /api/v1/orders/:id
GET    /api/v1/audit-logs`}</Code>
      </Section>

      <Section title="HEARTBEAT FLOW">
        <Code>{`Electron starts
  └─► POST /licenses/activate      → deviceToken (stored locally)

Every 4 hours:
  └─► POST /devices/heartbeat      Bearer: deviceToken
       ├─ 200 { licenseStatus: "ACTIVE",  nextCheckIn: 14400 }
       ├─ 200 { licenseStatus: "GRACE",   graceRemainingHours: 18 }
       └─ 200 { licenseStatus: "EXPIRED", requiresRenewal: true }

Offline grace: 24 hours (prevents Comcast outage killing paid users)`}</Code>
      </Section>
    </div>
  );
}
