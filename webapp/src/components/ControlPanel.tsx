"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Check, Copy, ChevronDown, ChevronRight,
  Minus, ArrowUpRight,
} from "lucide-react";

// ─── Shared helpers ───────────────────────────────────────────────────────────
const S: React.CSSProperties = {};
function px(n: number) { return `${n}px`; }

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid #eaeaea", margin: "20px 0" }} />;
}

function Badge({ status }: { status: string }) {
  const s = status?.toUpperCase() || "UNKNOWN";
  let color = "#555", bg = "#f0f0f0", border = "#ccc";
  if (s === "ACTIVE") { color = "#000"; bg = "#eaeaea"; border = "#ccc"; }
  else if (s === "GRACE") { color = "#666"; bg = "#f5f5f5"; border = "#ddd"; }
  else if (s === "EXPIRED" || s === "REVOKED") { color = "#666"; bg = "#fcfcfc"; border = "#eee"; }
  else if (s === "CORPORATION") { color = "#444"; bg = "#eaeaea"; border = "#ccc"; }
  else if (s === "INDIVIDUAL") { color = "#666"; bg = "#f0f0f0"; border = "#ddd"; }
  return (
    <span style={{
      fontFamily: "monospace",
      fontSize: 10,
      padding: "2px 7px",
      borderRadius: 3,
      color,
      background: bg,
      border: `1px solid ${border}`,
      letterSpacing: "0.05em",
      fontWeight: 600,
    }}>
      {s}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#111", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 6, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function Btn({
  children, onClick, primary, danger, disabled, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 13px",
        borderRadius: 4,
        fontSize: 12.5,
        fontWeight: 500,
        border: "1px solid",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.12s",
        whiteSpace: "nowrap",
        background: primary ? "#111" : "#f5f5f5",
        color: primary ? "#fff" : danger ? "#d00" : "#444",
        borderColor: primary ? "#111" : "#e0e0e0",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Modal({
  title, onClose, children
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(255,255,255,0.7)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: "#fff",
        border: "1px solid #eaeaea",
        borderRadius: 8,
        padding: "24px",
        width: "100%",
        maxWidth: 460,
        boxShadow: "0 24px 64px rgba(0,0,0,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Control Panel ───────────────────────────────────────────────────────
export function ControlPanel() {
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [issuedKey, setIssuedKey] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Issue license form
  const [selTenantId, setSelTenantId] = useState("");
  const [validDays, setValidDays] = useState(365);
  const [slots, setSlots] = useState(2);

  // New tenant form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("CORPORATION");
  const [newParent, setNewParent] = useState("");

  // Active section
  const [section, setSection] = useState<"overview" | "tenants" | "licenses" | "devices" | "logs">("overview");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, l, d, a] = await Promise.all([
        fetch("/api/v1/stats").then(r => r.json()),
        fetch("/api/v1/admin/tenants").then(r => r.json()),
        fetch("/api/v1/admin/licenses").then(r => r.json()),
        fetch("/api/v1/devices").then(r => r.json()),
        fetch("/api/v1/audit-logs").then(r => r.json()),
      ]);
      if (s.success) setStats(s.data);
      if (t.success) { setTenants(t.data); if (!selTenantId && t.data[0]) setSelTenantId(t.data[0].id); }
      if (l.success) setLicenses(l.data);
      if (d.success) setDevices(d.data);
      if (a.success) setAuditLogs(a.data);
    } finally {
      setLoading(false);
    }
  }, [selTenantId]);

  useEffect(() => { fetchAll(); }, []);

  const issueLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/v1/admin/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: selTenantId, validDays, activationLimit: slots }),
    });
    const data = await res.json();
    if (data.success) { setIssuedKey(data.data); fetchAll(); }
    else alert(data.error);
  };

  const createTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/v1/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type: newType, parentTenantId: newParent || null }),
    });
    const data = await res.json();
    if (data.success) { setShowTenantModal(false); setNewName(""); fetchAll(); }
    else alert(data.error);
  };

  const licenseAction = async (id: string, action: "RENEW" | "REVOKE" | "SUSPEND") => {
    const res = await fetch(`/api/v1/admin/licenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.success) fetchAll(); else alert(data.error);
  };

  const resetDevice = async (id: string) => {
    if (!confirm("Reset this device's activation slot?")) return;
    const res = await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) fetchAll(); else alert(data.error);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Nav sidebar items
  const navItems = [
    { id: "overview", label: "Overview" },
    { id: "tenants", label: "Tenants" },
    { id: "licenses", label: "Licenses" },
    { id: "devices", label: "Devices" },
    { id: "logs", label: "Audit Log" },
  ] as const;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 52px)" }}>
      {/* Sidebar */}
      <aside style={{
        width: 180,
        borderRight: "1px solid #eaeaea",
        padding: "20px 12px",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.1em", marginBottom: 10, paddingLeft: 12 }}>
          SECTIONS
        </div>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setSection(n.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 12px",
              marginBottom: 2,
              borderRadius: 4,
              fontSize: 13,
              border: "1px solid",
              cursor: "pointer",
              transition: "all 0.12s",
              background: section === n.id ? "#f5f5f5" : "transparent",
              color: section === n.id ? "#111" : "#666",
              borderColor: section === n.id ? "#e0e0e0" : "transparent",
            }}
          >
            {n.label}
          </button>
        ))}

        <Divider />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Btn onClick={() => { setIssuedKey(null); setShowIssueModal(true); }} primary>
            <Plus size={11} /> Issue License
          </Btn>
          <Btn onClick={() => setShowTenantModal(true)}>
            <Plus size={11} /> New Tenant
          </Btn>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
              {navItems.find(n => n.id === section)?.label}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Control Plane — Super Admin
            </div>
          </div>
          <button
            onClick={fetchAll}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {section === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              <Stat label="CORPORATIONS" value={stats?.tenants?.corporations ?? "—"} sub="Root companies" />
              <Stat label="INDIVIDUALS" value={stats?.tenants?.individuals ?? "—"} sub="Personal accounts" />
              <Stat label="ACTIVE LICENSES" value={stats?.licenses?.active ?? "—"} sub={`${stats?.licenses?.grace ?? 0} grace · ${stats?.licenses?.expired ?? 0} expired`} />
              <Stat label="ACTIVE DEVICES" value={stats?.devices?.active ?? "—"} sub="Heartbeat OK" />
            </div>
          </div>
        )}

        {/* ── TENANTS ──────────────────────────────────────────── */}
        {section === "tenants" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Parent</th>
                  <th>Licenses</th>
                  <th>Members</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #eaeaea" }}>
                    <td style={{ color: "#111", fontWeight: 500, padding: "12px 16px" }}>{t.name}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={t.type} /></td>
                    <td style={{ padding: "12px 16px" }}><Badge status={t.status} /></td>
                    <td style={{ color: "#666", fontFamily: "monospace", fontSize: 11, padding: "12px 16px" }}>
                      {t.parentTenant?.name || "—"}
                    </td>
                    <td style={{ color: "#666", padding: "12px 16px" }}>{t._count?.licenses ?? 0}</td>
                    <td style={{ color: "#666", padding: "12px 16px" }}>{t.memberships?.length ?? 0}</td>
                    <td style={{ color: "#888", fontFamily: "monospace", fontSize: 11, padding: "12px 16px" }}>
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── LICENSES ─────────────────────────────────────────── */}
        {section === "licenses" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Slots</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => {
                  const active = lic.activations?.filter((a: any) => !a.deactivatedAt).length || 0;
                  return (
                    <tr key={lic.id} style={{ borderBottom: "1px solid #eaeaea" }}>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "#333", padding: "12px 16px" }}>{lic.keyMasked}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ color: "#111", fontWeight: 500, fontSize: 12.5 }}>{lic.tenant?.name}</div>
                        <div style={{ fontSize: 10, color: "#666" }}>{lic.tenant?.type}</div>
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={lic.status} /></td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, padding: "12px 16px" }}>
                        <span style={{ color: active >= lic.activationLimit ? "#d00" : "#333" }}>
                          {active}/{lic.activationLimit}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>
                        {new Date(lic.expiresAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn onClick={() => licenseAction(lic.id, "RENEW")}>+1yr</Btn>
                          {lic.status !== "REVOKED" && (
                            <Btn onClick={() => licenseAction(lic.id, "REVOKE")} danger>Revoke</Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── DEVICES ──────────────────────────────────────────── */}
        {section === "devices" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Platform</th>
                  <th>App Ver</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Fingerprint</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #eaeaea" }}>
                    <td style={{ color: "#111", fontWeight: 500, padding: "12px 16px" }}>{d.name || "Unknown"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>{d.platform}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>{d.appVersion}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={d.status} /></td>
                    <td style={{ fontSize: 11, color: "#666", fontFamily: "monospace", padding: "12px 16px" }}>
                      {new Date(d.lastSeenAt).toLocaleString()}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#888", padding: "12px 16px" }}>
                      {d.fingerprintHash.slice(0, 16)}…
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Btn onClick={() => resetDevice(d.id)} danger>Reset Slot</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── AUDIT LOG ────────────────────────────────────────── */}
        {section === "logs" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Tenant</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #eaeaea" }}>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", whiteSpace: "nowrap", padding: "12px 16px" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        color: "#333",
                        background: "#f0f0f0",
                        border: "1px solid #ddd",
                        padding: "2px 7px",
                        borderRadius: 3,
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#666", padding: "12px 16px" }}>{log.tenant?.name || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#888", padding: "12px 16px" }}>
                      {log.actorId ? log.actorId.slice(0, 12) + "…" : "SYSTEM"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#666", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "12px 16px" }}>
                      {log.details || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── MODAL: Issue License ───────────────────────────────── */}
      {showIssueModal && (
        <Modal title="Issue License Key" onClose={() => setShowIssueModal(false)}>
          {issuedKey ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 12, color: "#666", background: "#fcfcfc", border: "1px solid #eaeaea", borderRadius: 4, padding: "10px 12px" }}>
                <strong style={{ color: "#111" }}>One-time display.</strong> Copy this key now — only the HMAC hash is stored.
              </div>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: "10px 12px",
              }}>
                <span style={{ fontFamily: "monospace", fontSize: 14, color: "#111", fontWeight: 700, letterSpacing: "0.1em" }}>
                  {issuedKey.plaintextLicenseKey}
                </span>
                <button
                  onClick={() => copyKey(issuedKey.plaintextLicenseKey)}
                  style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                >
                  {copied ? <Check size={12} color="#444" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <Btn onClick={() => setShowIssueModal(false)} primary style={{ width: "100%", justifyContent: "center" }}>Done</Btn>
            </div>
          ) : (
            <form onSubmit={issueLicense} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Label>TENANT</Label>
                <select value={selTenantId} onChange={e => setSelTenantId(e.target.value)}>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label>VALIDITY (DAYS)</Label>
                  <input type="number" value={validDays} onChange={e => setValidDays(+e.target.value)} />
                </div>
                <div>
                  <Label>DEVICE SLOTS</Label>
                  <input type="number" value={slots} onChange={e => setSlots(+e.target.value)} />
                </div>
              </div>
              <Btn primary style={{ width: "100%", justifyContent: "center" }}>Generate Key</Btn>
            </form>
          )}
        </Modal>
      )}

      {/* ── MODAL: New Tenant ──────────────────────────────────── */}
      {showTenantModal && (
        <Modal title="Create Tenant" onClose={() => setShowTenantModal(false)}>
          <form onSubmit={createTenant} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>NAME</Label>
              <input type="text" placeholder="Acme Corp / John Doe" value={newName} onChange={e => setNewName(e.target.value)} required />
            </div>
            <div>
              <Label>TYPE</Label>
              <select value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="CORPORATION">Corporation</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>
            </div>
            {newType === "CORPORATION" && (
              <div>
                <Label>PARENT CORPORATION (optional)</Label>
                <select value={newParent} onChange={e => setNewParent(e.target.value)}>
                  <option value="">None (Top-Level)</option>
                  {tenants.filter(t => t.type === "CORPORATION" && !t.parentTenantId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Btn primary style={{ width: "100%", justifyContent: "center" }}>Create Tenant</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}
