"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Check, Copy, Search, Trash2, Shield, Building2,
  User, Monitor, Key, FileText, BarChart2, ChevronDown, RotateCcw,
  PauseCircle, XCircle, PlayCircle, Clock, Edit2, AlertTriangle,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("astra_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers || {}) } });
  return res.json();
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const s = (status || "UNKNOWN").toUpperCase();
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    ACTIVE:       { bg: "rgba(16,185,129,0.12)", text: "#10b981", dot: "#10b981" },
    UNACTIVATED:  { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", dot: "#94a3b8" },
    SUSPENDED:    { bg: "rgba(234,179,8,0.12)",   text: "#eab308", dot: "#eab308" },
    REVOKED:      { bg: "rgba(239,68,68,0.12)",   text: "#ef4444", dot: "#ef4444" },
    EXPIRED:      { bg: "rgba(239,68,68,0.12)",   text: "#ef4444", dot: "#ef4444" },
    CORPORATION:  { bg: "rgba(99,102,241,0.12)",  text: "#6366f1", dot: "#6366f1" },
    INDIVIDUAL:   { bg: "rgba(14,165,233,0.12)",  text: "#0ea5e9", dot: "#0ea5e9" },
    BLOCKED:      { bg: "rgba(239,68,68,0.12)",   text: "#ef4444", dot: "#ef4444" },
    INACTIVE:     { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", dot: "#94a3b8" },
    ADMIN:        { bg: "rgba(168,85,247,0.12)",  text: "#a855f7", dot: "#a855f7" },
    CORP:         { bg: "rgba(99,102,241,0.12)",  text: "#6366f1", dot: "#6366f1" },
    OWNER:        { bg: "rgba(245,158,11,0.12)",  text: "#f59e0b", dot: "#f59e0b" },
  };
  const c = map[s] || { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", dot: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.text, letterSpacing: "0.06em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {s}
    </span>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "20px 22px",
    }}>
      <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.08em", marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || "#e2e8f0", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 6, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function Btn({ children, onClick, primary, danger, warning, disabled, style, size = "md" }: any) {
  const pad = size === "sm" ? "4px 10px" : "7px 14px";
  const fs = size === "sm" ? 11 : 12.5;
  let bg = "rgba(255,255,255,0.06)", color = "#94a3b8", border = "rgba(255,255,255,0.1)";
  if (primary)  { bg = "linear-gradient(135deg,#6366f1,#8b5cf6)"; color = "#fff"; border = "transparent"; }
  if (danger)   { bg = "rgba(239,68,68,0.12)"; color = "#ef4444"; border = "rgba(239,68,68,0.25)"; }
  if (warning)  { bg = "rgba(234,179,8,0.12)"; color = "#eab308"; border = "rgba(234,179,8,0.25)"; }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: pad, borderRadius: 7,
      fontSize: fs, fontWeight: 500, border: `1px solid ${border}`, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, transition: "all 0.15s", whiteSpace: "nowrap",
      background: bg, color, ...style,
    }}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, wide }: any) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: "#0f1729", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
        padding: "28px", width: "100%", maxWidth: wide ? 680 : 480, boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>{label}</div>}
      <input {...props} style={{
        width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0",
        fontSize: 13, outline: "none", boxSizing: "border-box", ...(props.style || {}),
      }} />
    </div>
  );
}

function Select({ label, children, ...props }: any) {
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>{label}</div>}
      <select {...props} style={{
        width: "100%", padding: "9px 12px", background: "rgba(15,23,41,0.9)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0",
        fontSize: 13, outline: "none", ...(props.style || {}),
      }}>
        {children}
      </select>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────
export function ControlPanel({ user }: { user: any }) {
  const [section, setSection] = useState<"overview" | "accounts" | "licenses" | "devices" | "tenants" | "logs">("overview");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modals
  const [modal, setModal] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [renewDaysInput, setRenewDaysInput] = useState("365");

  // Create user form
  const [createUser, setCreateUser] = useState({ username: "", email: "", password: "", name: "", role: "CORP", parentTenantId: "" });
  // Create tenant form
  const [createTenant, setCreateTenant] = useState({ name: "", type: "CORPORATION", parentTenantId: "" });
  // Issue license form
  const [issueLicense, setIssueLicense] = useState({ tenantId: "", validDays: "365", activationLimit: "1" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, t, l, d, a] = await Promise.all([
        api("/api/v1/stats"),
        api(`/api/v1/admin/users?search=${encodeURIComponent(search)}&pageSize=50`),
        api("/api/v1/admin/tenants"),
        api("/api/v1/admin/licenses"),
        api("/api/v1/devices"),
        api("/api/v1/audit-logs?limit=50"),
      ]);
      if (s.success) setStats(s.data);
      if (u.success) setUsers(u.data);
      if (t.success) setTenants(t.data);
      if (l.success) setLicenses(l.data);
      if (d.success) setDevices(d.data);
      if (a.success) setAuditLogs(a.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchAll(); }, []);

  const handleSearch = async () => {
    setLoading(true);
    const u = await api(`/api/v1/admin/users?search=${encodeURIComponent(search)}&pageSize=50`);
    if (u.success) setUsers(u.data);
    setLoading(false);
  };

  const doCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await api("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ ...createUser, parentTenantId: createUser.parentTenantId || null }),
    });
    if (data.success) { setModal(null); setCreateUser({ username: "", email: "", password: "", name: "", role: "CORP", parentTenantId: "" }); fetchAll(); }
    else alert(data.error);
  };

  const doDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This will also revoke their associated licenses.`)) return;
    const data = await api(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
    if (data.success) fetchAll(); else alert(data.error);
  };

  const doResetPassword = async (userId: string) => {
    const pw = prompt("Enter new password (min 6 chars):");
    if (!pw || pw.length < 6) { alert("Password too short"); return; }
    const data = await api(`/api/v1/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ password: pw }),
    });
    if (data.success) alert("Password updated successfully."); else alert(data.error);
  };

  const doCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await api("/api/v1/admin/tenants", {
      method: "POST",
      body: JSON.stringify({ ...createTenant, parentTenantId: createTenant.parentTenantId || null }),
    });
    if (data.success) { setModal(null); setCreateTenant({ name: "", type: "CORPORATION", parentTenantId: "" }); fetchAll(); }
    else alert(data.error);
  };

  const doDeleteTenant = async (tenantId: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? This will cascade-delete all child tenants, licenses, and devices.`)) return;
    const data = await api(`/api/v1/admin/tenants/${tenantId}`, { method: "DELETE" });
    if (data.success) fetchAll(); else alert(data.error);
  };

  const doIssueLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await api("/api/v1/admin/licenses", {
      method: "POST",
      body: JSON.stringify({
        tenantId: issueLicense.tenantId,
        validDays: parseInt(issueLicense.validDays),
        activationLimit: parseInt(issueLicense.activationLimit),
      }),
    });
    if (data.success) { setIssuedKey(data.data); fetchAll(); }
    else alert(data.error);
  };

  const doLicenseAction = async (licenseId: string, action: string, addDays?: number) => {
    const data = await api(`/api/v1/admin/licenses/${licenseId}`, {
      method: "PATCH",
      body: JSON.stringify({ action, addDays }),
    });
    if (data.success) fetchAll(); else alert(data.error);
  };

  const doDeleteLicense = async (licenseId: string, keyMasked: string) => {
    if (!confirm(`Permanently delete license ${keyMasked}?`)) return;
    const data = await api(`/api/v1/admin/licenses/${licenseId}`, { method: "DELETE" });
    if (data.success) fetchAll(); else alert(data.error);
  };

  const doResetDevice = async (deviceId: string) => {
    if (!confirm("Reset this device's activation slot?")) return;
    const data = await api(`/api/v1/devices/${deviceId}`, { method: "DELETE" });
    if (data.success) fetchAll(); else alert(data.error);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "accounts", label: "Accounts", icon: User },
    { id: "tenants", label: "Tenants", icon: Building2 },
    { id: "licenses", label: "Licenses", icon: Key },
    { id: "devices", label: "Devices", icon: Monitor },
    { id: "logs", label: "Audit Log", icon: FileText },
  ] as const;

  const corpTenants = tenants.filter(t => t.type === "CORPORATION");

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 56px)", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 200, borderRight: "1px solid rgba(255,255,255,0.07)",
        padding: "20px 12px", flexShrink: 0, background: "rgba(0,0,0,0.2)",
      }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.12em", marginBottom: 10, paddingLeft: 10 }}>NAVIGATION</div>
        {navItems.map(n => {
          const Icon = n.icon;
          const active = section === n.id;
          return (
            <button key={n.id} onClick={() => setSection(n.id)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              textAlign: "left", padding: "8px 10px", marginBottom: 2, borderRadius: 8,
              fontSize: 12.5, border: "1px solid", cursor: "pointer", transition: "all 0.12s",
              background: active ? "rgba(99,102,241,0.15)" : "transparent",
              color: active ? "#818cf8" : "#64748b",
              borderColor: active ? "rgba(99,102,241,0.3)" : "transparent",
            }}>
              <Icon size={13} />
              {n.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "16px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Btn primary onClick={() => { setIssuedKey(null); setIssueLicense({ tenantId: tenants[0]?.id || "", validDays: "365", activationLimit: "1" }); setModal("issueLicense"); }}>
            <Plus size={11} /> Issue License
          </Btn>
          <Btn onClick={() => setModal("createUser")}>
            <Plus size={11} /> New Account
          </Btn>
          <Btn onClick={() => setModal("createTenant")}>
            <Plus size={11} /> New Tenant
          </Btn>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
              {navItems.find(n => n.id === section)?.label}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Platform Admin: {user?.username}
            </div>
          </div>
          <button onClick={fetchAll} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.1)",
            color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center",
            gap: 6, fontSize: 12, padding: "6px 12px", borderRadius: 7,
          }}>
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── OVERVIEW ──────────────────────────────────────────── */}
        {section === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
              <Stat label="TOTAL USERS" value={stats?.users?.total ?? "…"} sub={`${stats?.users?.corp ?? 0} corp · ${stats?.users?.individual ?? 0} individual`} accent="#818cf8" />
              <Stat label="CORPORATIONS" value={stats?.tenants?.corporations ?? "…"} sub="Root companies" accent="#6366f1" />
              <Stat label="ACTIVE LICENSES" value={stats?.licenses?.active ?? "…"} sub={`${stats?.licenses?.unactivated ?? 0} unactivated · ${stats?.licenses?.suspended ?? 0} paused`} accent="#10b981" />
              <Stat label="ACTIVE DEVICES" value={stats?.devices?.active ?? "…"} sub={`${stats?.devices?.total ?? 0} total registered`} accent="#0ea5e9" />
              <Stat label="REVOKED" value={stats?.licenses?.revoked ?? "…"} sub={`${stats?.licenses?.expired ?? 0} expired`} accent="#ef4444" />
            </div>
            {/* Quick action cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { icon: Plus, label: "Issue License", sub: "Create new license key for a tenant", action: () => { setIssuedKey(null); setModal("issueLicense"); } },
                { icon: User, label: "New Account", sub: "Create corp or individual account", action: () => setModal("createUser") },
                { icon: Building2, label: "New Tenant", sub: "Create tenant or sub-corporation", action: () => setModal("createTenant") },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <button key={c.label} onClick={c.action} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12, padding: "18px 20px", cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  >
                    <Icon size={18} style={{ color: "#6366f1", marginBottom: 10 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{c.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ACCOUNTS ──────────────────────────────────────────── */}
        {section === "accounts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Search bar */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  type="text"
                  placeholder="Search by username, email, or name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  style={{
                    width: "100%", padding: "9px 12px 9px 34px",
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <Btn onClick={handleSearch}><Search size={12} /> Search</Btn>
              <Btn primary onClick={() => setModal("createUser")}><Plus size={12} /> New Account</Btn>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["User", "Username", "Email", "Role", "License", "Joined", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const lic = u.licenses?.[0];
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 16px", color: "#e2e8f0", fontWeight: 500 }}>{u.name}</td>
                        <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>{u.username}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>{u.email}</td>
                        <td style={{ padding: "12px 16px" }}><Badge status={u.role} /></td>
                        <td style={{ padding: "12px 16px" }}>
                          {lic ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>{lic.keyMasked}</span>
                              <Badge status={lic.status} />
                            </div>
                          ) : <span style={{ fontSize: 11, color: "#475569" }}>None</span>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 5 }}>
                            <Btn size="sm" onClick={() => doResetPassword(u.id)}><RotateCcw size={10} /> Reset PW</Btn>
                            <Btn size="sm" danger onClick={() => doDeleteUser(u.id, u.name)}><Trash2 size={10} /></Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No accounts found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TENANTS ──────────────────────────────────────────── */}
        {section === "tenants" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn primary onClick={() => setModal("createTenant")}><Plus size={12} /> New Tenant</Btn>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Tenant", "Type", "Status", "Parent", "Children", "Licenses", "Members", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px", color: "#e2e8f0", fontWeight: 500 }}>
                        {t.parentTenantId && <span style={{ color: "#475569", marginRight: 6 }}>↳</span>}
                        {t.name}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={t.type} /></td>
                      <td style={{ padding: "12px 16px" }}><Badge status={t.status} /></td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>{t.parentTenant?.name || "None"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{t._count?.children ?? 0}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{t._count?.licenses ?? 0}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{t.memberships?.length ?? 0}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <Btn size="sm" danger onClick={() => doDeleteTenant(t.id, t.name)}><Trash2 size={10} /></Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── LICENSES ─────────────────────────────────────────── */}
        {section === "licenses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn primary onClick={() => { setIssuedKey(null); setIssueLicense({ tenantId: tenants[0]?.id || "", validDays: "365", activationLimit: "1" }); setModal("issueLicense"); }}>
                <Plus size={12} /> Issue License
              </Btn>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["License Key", "Tenant", "Bound To", "Status", "Expires", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {licenses.map(lic => (
                    <tr key={lic.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>{lic.keyMasked}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: 13, color: "#e2e8f0" }}>{lic.tenant?.name}</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>{lic.tenant?.type}</div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {lic.user ? (
                          <div>
                            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{lic.user.username}</div>
                            <div style={{ fontSize: 11, color: "#475569" }}>{lic.user.email}</div>
                          </div>
                        ) : <span style={{ fontSize: 11, color: "#475569" }}>Unbound</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={lic.status} /></td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                        {new Date(lic.expiresAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <Btn size="sm" onClick={() => { setSelectedUser(lic); setRenewDaysInput("365"); setModal("renewLicense"); }}>
                            <Clock size={10} /> Renew
                          </Btn>
                          {lic.status !== "SUSPENDED" && lic.status !== "REVOKED" && (
                            <Btn size="sm" warning onClick={() => doLicenseAction(lic.id, "SUSPEND")}>
                              <PauseCircle size={10} /> Pause
                            </Btn>
                          )}
                          {lic.status === "SUSPENDED" && (
                            <Btn size="sm" onClick={() => doLicenseAction(lic.id, "UNSUSPEND")}>
                              <PlayCircle size={10} /> Resume
                            </Btn>
                          )}
                          {lic.status !== "REVOKED" && (
                            <Btn size="sm" danger onClick={() => doLicenseAction(lic.id, "REVOKE")}>
                              <XCircle size={10} /> Revoke
                            </Btn>
                          )}
                          <Btn size="sm" danger onClick={() => doDeleteLicense(lic.id, lic.keyMasked)}>
                            <Trash2 size={10} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {licenses.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No licenses</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DEVICES ──────────────────────────────────────────── */}
        {section === "devices" && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Device", "Platform", "Tenant", "Active License", "Current User", "Last Seen", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map(d => {
                  const activeActivation = d.activations?.[0];
                  const activeLicense = activeActivation?.license;
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: 13, color: "#e2e8f0" }}>{d.name || "Unknown"}</div>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{d.fingerprintHash.slice(0, 12)}…</div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{d.platform || "Unknown"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{d.tenant?.name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {activeLicense ? (
                          <div>
                            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>{activeLicense.keyMasked}</div>
                            <Badge status={activeLicense.status} />
                          </div>
                        ) : <span style={{ fontSize: 11, color: "#475569" }}>None</span>}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>
                        {activeLicense?.user?.username || d.lastUsedByUserId?.slice(0, 8) || "None"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
                        {new Date(d.lastSeenAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={d.status} /></td>
                      <td style={{ padding: "12px 16px" }}>
                        <Btn size="sm" danger onClick={() => doResetDevice(d.id)}><RotateCcw size={10} /> Reset</Btn>
                      </td>
                    </tr>
                  );
                })}
                {devices.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No devices registered</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── AUDIT LOG ────────────────────────────────────────── */}
        {section === "logs" && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Timestamp", "Action", "Actor", "Tenant", "Details"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontFamily: "monospace", fontSize: 10, padding: "3px 8px", borderRadius: 6,
                        background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)",
                      }}>{log.action}</span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
                      {log.actor?.username || "SYSTEM"}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>{log.tenant?.name || "None"}</td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 10, color: "#475569", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.details || "None"}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No audit entries</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── MODALS ─────────────────────────────────────────────── */}

      {/* Issue License */}
      {modal === "issueLicense" && (
        <Modal title="Issue License Key" onClose={() => setModal(null)}>
          {issuedKey ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "12px 14px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, fontSize: 12, color: "#eab308" }}>
                <AlertTriangle size={13} style={{ display: "inline", marginRight: 6 }} />
                <strong>One-time display.</strong> Copy this key now. Only the HMAC hash is stored.
              </div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, padding: "12px 16px",
              }}>
                <span style={{ fontFamily: "monospace", fontSize: 15, color: "#e2e8f0", fontWeight: 700, letterSpacing: "0.1em" }}>
                  {issuedKey.plaintextLicenseKey}
                </span>
                <button onClick={() => copyKey(issuedKey.plaintextLicenseKey)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <Btn primary style={{ width: "100%", justifyContent: "center" }} onClick={() => setModal(null)}>Done</Btn>
            </div>
          ) : (
            <form onSubmit={doIssueLicense} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Select label="ASSIGN TO TENANT" value={issueLicense.tenantId} onChange={(e: any) => setIssueLicense({ ...issueLicense, tenantId: e.target.value })} required>
                <option value="">Select tenant...</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
              </Select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="VALIDITY (DAYS)" type="number" min="1" value={issueLicense.validDays} onChange={(e: any) => setIssueLicense({ ...issueLicense, validDays: e.target.value })} />
                <Input label="MAX DEVICES" type="number" min="1" max="10" value={issueLicense.activationLimit} onChange={(e: any) => setIssueLicense({ ...issueLicense, activationLimit: e.target.value })} />
              </div>
              <Btn primary style={{ width: "100%", justifyContent: "center" }}>Generate License Key</Btn>
            </form>
          )}
        </Modal>
      )}

      {/* Renew License */}
      {modal === "renewLicense" && selectedUser && (
        <Modal title={`Renew License: ${selectedUser.keyMasked}`} onClose={() => { setModal(null); setSelectedUser(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "30 days", days: 30 }, { label: "90 days", days: 90 },
                { label: "6 months", days: 180 }, { label: "1 year", days: 365 },
              ].map(opt => (
                <button key={opt.days} onClick={() => setRenewDaysInput(String(opt.days))} style={{
                  padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500,
                  border: `1px solid ${renewDaysInput === String(opt.days) ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
                  background: renewDaysInput === String(opt.days) ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  color: renewDaysInput === String(opt.days) ? "#818cf8" : "#94a3b8",
                }}>{opt.label}</button>
              ))}
            </div>
            <Input label="CUSTOM DAYS" type="number" min="1" value={renewDaysInput} onChange={(e: any) => setRenewDaysInput(e.target.value)} />
            <Btn primary style={{ width: "100%", justifyContent: "center" }} onClick={async () => {
              await doLicenseAction(selectedUser.id, "RENEW", parseInt(renewDaysInput));
              setModal(null); setSelectedUser(null);
            }}>
              Renew for {renewDaysInput} days
            </Btn>
          </div>
        </Modal>
      )}

      {/* Create User */}
      {modal === "createUser" && (
        <Modal title="Create Account" onClose={() => setModal(null)}>
          <form onSubmit={doCreateUser} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="FULL NAME" required value={createUser.name} onChange={(e: any) => setCreateUser({ ...createUser, name: e.target.value })} placeholder="John Doe" />
              <Input label="USERNAME" required value={createUser.username} onChange={(e: any) => setCreateUser({ ...createUser, username: e.target.value })} placeholder="johndoe" />
            </div>
            <Input label="EMAIL" type="email" required value={createUser.email} onChange={(e: any) => setCreateUser({ ...createUser, email: e.target.value })} placeholder="john@example.com" />
            <Input label="PASSWORD" type="password" required value={createUser.password} onChange={(e: any) => setCreateUser({ ...createUser, password: e.target.value })} placeholder="Min. 6 chars" />
            <Select label="ACCOUNT TYPE" value={createUser.role} onChange={(e: any) => setCreateUser({ ...createUser, role: e.target.value })}>
              <option value="CORP">Corporation</option>
              <option value="INDIVIDUAL">Individual</option>
            </Select>
            {createUser.role === "CORP" && (
              <Select label="PARENT CORPORATION (if sub-corp)" value={createUser.parentTenantId} onChange={(e: any) => setCreateUser({ ...createUser, parentTenantId: e.target.value })}>
                <option value="">None (Top-Level Corp)</option>
                {corpTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
            <Btn primary style={{ width: "100%", justifyContent: "center" }}>Create Account</Btn>
          </form>
        </Modal>
      )}

      {/* Create Tenant */}
      {modal === "createTenant" && (
        <Modal title="Create Tenant" onClose={() => setModal(null)}>
          <form onSubmit={doCreateTenant} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="TENANT NAME" required value={createTenant.name} onChange={(e: any) => setCreateTenant({ ...createTenant, name: e.target.value })} placeholder="Acme Corp" />
            <Select label="TYPE" value={createTenant.type} onChange={(e: any) => setCreateTenant({ ...createTenant, type: e.target.value })}>
              <option value="CORPORATION">Corporation</option>
              <option value="INDIVIDUAL">Individual</option>
            </Select>
            {createTenant.type === "CORPORATION" && (
              <Select label="PARENT CORPORATION (optional)" value={createTenant.parentTenantId} onChange={(e: any) => setCreateTenant({ ...createTenant, parentTenantId: e.target.value })}>
                <option value="">None (Top-Level)</option>
                {corpTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
            <Btn primary style={{ width: "100%", justifyContent: "center" }}>Create Tenant</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}
