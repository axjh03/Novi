"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Key, Monitor, BarChart2, Users, RefreshCw, Building2, Plus, Trash2, AlertTriangle } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("astra_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers || {}) } });
  return res.json();
}

function Badge({ status }: { status: string }) {
  const s = (status || "UNKNOWN").toUpperCase();
  const map: Record<string, { bg: string; text: string }> = {
    ACTIVE:      { bg: "rgba(16,185,129,0.12)", text: "#10b981" },
    UNACTIVATED: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8" },
    SUSPENDED:   { bg: "rgba(234,179,8,0.12)", text: "#eab308" },
    REVOKED:     { bg: "rgba(239,68,68,0.12)", text: "#ef4444" },
    EXPIRED:     { bg: "rgba(239,68,68,0.12)", text: "#ef4444" },
    BLOCKED:     { bg: "rgba(239,68,68,0.12)", text: "#ef4444" },
    INACTIVE:    { bg: "rgba(148,163,184,0.12)", text: "#94a3b8" },
  };
  const c = map[s] || { bg: "rgba(148,163,184,0.1)", text: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.text, letterSpacing: "0.06em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, flexShrink: 0 }} />
      {s}
    </span>
  );
}

function Btn({ children, onClick, primary, danger, disabled, style }: any) {
  let bg = "rgba(255,255,255,0.06)", color = "#94a3b8", border = "rgba(255,255,255,0.1)";
  if (primary) { bg = "linear-gradient(135deg,#6366f1,#8b5cf6)"; color = "#fff"; border = "transparent"; }
  if (danger)  { bg = "rgba(239,68,68,0.12)"; color = "#ef4444"; border = "rgba(239,68,68,0.25)"; }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px",
      borderRadius: 7, fontSize: 12.5, fontWeight: 500, border: `1px solid ${border}`,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
      transition: "all 0.15s", whiteSpace: "nowrap", background: bg, color, ...style,
    }}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: any) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "28px", width: "100%", maxWidth: 480, boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Corp Portal ──────────────────────────────────────────────────────────────
export function CorpPortal({ user }: { user: any }) {
  const [section, setSection] = useState<"overview" | "licenses" | "devices" | "subcorps">("overview");
  const [myTenant, setMyTenant] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [subCorps, setSubCorps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [newSubcorp, setNewSubcorp] = useState({ name: "", username: "", email: "", password: "" });

  const fetchData = useCallback(async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const [t, l, d] = await Promise.all([
        api(`/api/v1/admin/tenants`),
        api(`/api/v1/admin/licenses?tenantId=${user.tenantId}`),
        api(`/api/v1/devices?tenantId=${user.tenantId}`),
      ]);
      if (t.success) {
        const all = t.data;
        const mine = all.find((ten: any) => ten.id === user.tenantId);
        setMyTenant(mine);
        setSubCorps(all.filter((ten: any) => ten.parentTenantId === user.tenantId));
      }
      if (l.success) setLicenses(l.data);
      if (d.success) setDevices(d.data);
    } finally { setLoading(false); }
  }, [user?.tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createSubCorp = async (e: React.FormEvent) => {
    e.preventDefault();
    // First create the tenant
    const tenantRes = await api("/api/v1/admin/tenants", {
      method: "POST",
      body: JSON.stringify({ name: newSubcorp.name, type: "CORPORATION", parentTenantId: user.tenantId }),
    });
    if (!tenantRes.success) { alert(tenantRes.error); return; }

    // Then create the user
    const userRes = await api("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: newSubcorp.username,
        email: newSubcorp.email,
        password: newSubcorp.password,
        name: newSubcorp.name,
        role: "CORP",
        parentTenantId: user.tenantId,
      }),
    });
    if (!userRes.success) { alert(userRes.error); return; }

    setModal(null);
    setNewSubcorp({ name: "", username: "", email: "", password: "" });
    fetchData();
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "licenses", label: "Licenses", icon: Key },
    { id: "devices", label: "Devices", icon: Monitor },
    { id: "subcorps", label: "Sub-Corps", icon: Building2 },
  ] as const;

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 56px)", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <aside style={{ width: 200, borderRight: "1px solid rgba(255,255,255,0.07)", padding: "20px 12px", flexShrink: 0, background: "rgba(0,0,0,0.2)" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.12em", marginBottom: 6, paddingLeft: 10 }}>WORKSPACE</div>
          <div style={{ padding: "10px 12px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#818cf8", fontWeight: 600 }}>{myTenant?.name || user.tenantName}</div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>CORPORATION</div>
          </div>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "12px 0" }} />
        {navItems.map(n => {
          const Icon = n.icon;
          const active = section === n.id;
          return (
            <button key={n.id} onClick={() => setSection(n.id)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              padding: "8px 10px", marginBottom: 2, borderRadius: 8, fontSize: 12.5, border: "1px solid",
              cursor: "pointer", transition: "all 0.12s",
              background: active ? "rgba(99,102,241,0.15)" : "transparent",
              color: active ? "#818cf8" : "#64748b",
              borderColor: active ? "rgba(99,102,241,0.3)" : "transparent",
            }}>
              <Icon size={13} />{n.label}
            </button>
          );
        })}
      </aside>

      <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{navItems.find(n => n.id === section)?.label}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Corporation · {user.username}</div>
          </div>
          <button onClick={fetchData} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px", borderRadius: 7 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {section === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {[
              { label: "ACTIVE LICENSES", value: licenses.filter(l => l.status === "ACTIVE").length, accent: "#10b981" },
              { label: "UNACTIVATED", value: licenses.filter(l => l.status === "UNACTIVATED").length, accent: "#94a3b8" },
              { label: "ACTIVE DEVICES", value: devices.filter(d => d.status === "ACTIVE").length, accent: "#0ea5e9" },
              { label: "SUB-CORPS", value: subCorps.length, accent: "#6366f1" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.08em", marginBottom: 12 }}>{s.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: s.accent, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {section === "licenses" && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["License Key", "Bound To", "Status", "Devices", "Expires"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => {
                  const active = lic.activations?.filter((a: any) => !a.deactivatedAt).length || 0;
                  return (
                    <tr key={lic.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>{lic.keyMasked}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>
                        {lic.user ? `${lic.user.username} (${lic.user.name})` : <span style={{ color: "#475569" }}>Not activated</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={lic.status} /></td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>
                        {active}/{lic.activationLimit}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                        {new Date(lic.expiresAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {licenses.length === 0 && <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No licenses assigned</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === "devices" && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Device", "Platform", "Current User", "License", "Last Seen", "Status"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map(d => {
                  const activation = d.activations?.[0];
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "12px 16px", color: "#e2e8f0" }}>{d.name || "Unknown"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{d.platform || "Unknown"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>
                        {activation?.license?.user?.username || "None"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
                        {activation?.license?.keyMasked || "None"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
                        {new Date(d.lastSeenAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge status={d.status} /></td>
                    </tr>
                  );
                })}
                {devices.length === 0 && <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No devices</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === "subcorps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn primary onClick={() => setModal("createSubcorp")}><Plus size={12} /> New Sub-Corporation</Btn>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Sub-Corp", "Status", "Created"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontSize: 11, color: "#475569", letterSpacing: "0.06em", textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subCorps.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "12px 16px", color: "#e2e8f0", fontWeight: 500 }}>↳ {s.name}</td>
                      <td style={{ padding: "12px 16px" }}><Badge status={s.status} /></td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {subCorps.length === 0 && <tr><td colSpan={3} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No sub-corporations yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {modal === "createSubcorp" && (
        <Modal title="Create Sub-Corporation" onClose={() => setModal(null)}>
          <form onSubmit={createSubCorp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "DIVISION NAME", key: "name", placeholder: "Acme West" },
              { label: "USERNAME", key: "username", placeholder: "acme_west" },
              { label: "EMAIL", key: "email", placeholder: "admin@acme-west.com", type: "email" },
              { label: "PASSWORD", key: "password", placeholder: "Min. 6 chars", type: "password" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>{f.label}</div>
                <input required type={f.type || "text"} placeholder={f.placeholder}
                  value={(newSubcorp as any)[f.key]} onChange={e => setNewSubcorp({ ...newSubcorp, [f.key]: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <Btn primary style={{ width: "100%", justifyContent: "center" }}>Create Sub-Corporation</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Individual Portal ────────────────────────────────────────────────────────
export function IndividualPortal({ user }: { user: any }) {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const [l, d] = await Promise.all([
        api(`/api/v1/admin/licenses?tenantId=${user.tenantId}`),
        api(`/api/v1/devices?tenantId=${user.tenantId}`),
      ]);
      if (l.success) setLicenses(l.data);
      if (d.success) setDevices(d.data);
    } finally { setLoading(false); }
  }, [user?.tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const myLicense = licenses.find(l => l.userId === user.id) || licenses[0];
  const myDevice = devices.find(d => d.activations?.some((a: any) => a.userId === user.id && !a.deactivatedAt));

  return (
    <div style={{ padding: "32px 48px", maxWidth: 800, margin: "0 auto", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>My Account</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Individual · {user.name}</div>
      </div>

      {/* License status card */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Key size={16} style={{ color: "#6366f1" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>License</span>
        </div>
        {myLicense ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>KEY</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#94a3b8" }}>{myLicense.keyMasked}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>STATUS</div>
              <Badge status={myLicense.status} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>EXPIRES</div>
              <div style={{ fontSize: 13, color: "#e2e8f0" }}>{new Date(myLicense.expiresAt).toLocaleDateString()}</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "24px", textAlign: "center" }}>
            <AlertTriangle size={24} style={{ color: "#eab308", marginBottom: 8 }} />
            <div style={{ color: "#94a3b8", fontSize: 13 }}>No license assigned yet. Contact your administrator.</div>
          </div>
        )}
      </div>

      {/* Active device */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Monitor size={16} style={{ color: "#0ea5e9" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>My Device</span>
        </div>
        {myDevice ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>DEVICE</div>
              <div style={{ fontSize: 13, color: "#e2e8f0" }}>{myDevice.name || "Unknown"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>PLATFORM</div>
              <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{myDevice.platform || "Unknown"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, letterSpacing: "0.06em" }}>LAST SEEN</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>{new Date(myDevice.lastSeenAt).toLocaleString()}</div>
            </div>
          </div>
        ) : (
          <div style={{ color: "#475569", fontSize: 13 }}>No active device session</div>
        )}
      </div>
    </div>
  );
}
