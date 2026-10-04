"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

function Badge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  let color = "#555", bg = "#f0f0f0", border = "#ccc";
  if (s === "ACTIVE") { color = "#000"; bg = "#eaeaea"; border = "#ccc"; }
  else if (s === "GRACE") { color = "#666"; bg = "#f5f5f5"; border = "#ddd"; }
  else if (s === "EXPIRED" || s === "REVOKED") { color = "#666"; bg = "#fcfcfc"; border = "#eee"; }
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 10, padding: "2px 7px", borderRadius: 3,
      color, background: bg, border: `1px solid ${border}`, letterSpacing: "0.04em", fontWeight: 600,
    }}>
      {s}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 8, padding: "24px", width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Btn({ children, onClick, primary, danger, small, style }: any) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: small ? "4px 10px" : "6px 13px",
      borderRadius: 4, fontSize: small ? 11 : 12.5, fontWeight: 500, border: "1px solid",
      cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap",
      background: primary ? "#111" : danger ? "#ffe5e5" : "#f5f5f5",
      color: primary ? "#fff" : danger ? "#d00" : "#444",
      borderColor: primary ? "#111" : danger ? "#ffcccc" : "#d0d0d0", ...style,
    }}>
      {children}
    </button>
  );
}

export function CustomerPortal() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [selTenantId, setSelTenantId] = useState("");
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<"licenses" | "devices" | "vault" | "billing">("licenses");

  const [showAddKey, setShowAddKey] = useState(false);
  const [newProvider, setNewProvider] = useState("OPENAI");
  const [newLabel, setNewLabel] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newScope, setNewScope] = useState("TENANT");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/v1/admin/tenants").then(r => r.json()).then(d => {
      if (d.success && d.data.length > 0) {
        setTenants(d.data);
        setSelTenantId(d.data[0].id);
      }
    });
  }, []);

  const fetchTenantData = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, dev, cred, ord] = await Promise.all([
        fetch(`/api/v1/admin/licenses?tenantId=${id}`).then(r => r.json()),
        fetch(`/api/v1/devices?tenantId=${id}`).then(r => r.json()),
        fetch(`/api/v1/credentials?tenantId=${id}&reveal=true`).then(r => r.json()),
        fetch(`/api/v1/orders?tenantId=${id}`).then(r => r.json()),
      ]);
      if (l.success) setLicenses(l.data);
      if (dev.success) setDevices(dev.data);
      if (cred.success) setCredentials(cred.data);
      if (ord.success) setOrders(ord.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selTenantId) fetchTenantData(selTenantId); }, [selTenantId]);

  const addCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/v1/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: newProvider, label: newLabel, secret: newSecret, scope: newScope, tenantId: selTenantId }),
    });
    const data = await res.json();
    if (data.success) { setShowAddKey(false); setNewLabel(""); setNewSecret(""); fetchTenantData(selTenantId); }
    else alert(data.error);
  };

  const deleteCredential = async (id: string) => {
    if (!confirm("Delete this API key?")) return;
    await fetch(`/api/v1/credentials/${id}`, { method: "DELETE" });
    fetchTenantData(selTenantId);
  };

  const deactivateDevice = async (id: string) => {
    if (!confirm("Unbind this device slot?")) return;
    await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
    fetchTenantData(selTenantId);
  };

  const selTenant = tenants.find(t => t.id === selTenantId);
  const subCorps = tenants.filter(t => t.parentTenantId === selTenantId);

  const navItems = [
    { id: "licenses" as const, label: "Licenses" },
    { id: "devices" as const, label: "Devices" },
    { id: "vault" as const, label: "API Vault" },
    { id: "billing" as const, label: "Billing" },
  ];

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 52px)" }}>
      {/* Sidebar */}
      <aside style={{ width: 200, borderRight: "1px solid #eaeaea", padding: "20px 12px", flexShrink: 0 }}>
        {/* Tenant switcher */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 2 }}>WORKSPACE</div>
          <div style={{ position: "relative" }}>
            <select
              value={selTenantId}
              onChange={e => setSelTenantId(e.target.value)}
              style={{ width: "100%", paddingRight: 28, fontSize: 12.5, background: "#fff", border: "1px solid #ddd", color: "#111" }}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {selTenant && (
            <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", marginTop: 6, paddingLeft: 2 }}>
              {selTenant.type} · {selTenant.status}
              {selTenant.parentTenant && <div>↳ {selTenant.parentTenant.name}</div>}
            </div>
          )}
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #eaeaea", marginBottom: 16 }} />

        <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.1em", marginBottom: 10, paddingLeft: 2 }}>SECTIONS</div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setSection(n.id)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "7px 12px", marginBottom: 2, borderRadius: 4, fontSize: 13, border: "1px solid",
            cursor: "pointer", transition: "all 0.12s",
            background: section === n.id ? "#f5f5f5" : "transparent",
            color: section === n.id ? "#111" : "#666",
            borderColor: section === n.id ? "#e0e0e0" : "transparent",
          }}>
            {n.label}
          </button>
        ))}

        {subCorps.length > 0 && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid #eaeaea", margin: "16px 0" }} />
            <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 2 }}>SUB-CORPS</div>
            {subCorps.map(s => (
              <button key={s.id} onClick={() => setSelTenantId(s.id)} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 12px", marginBottom: 2, borderRadius: 4, fontSize: 12,
                border: "1px solid transparent", cursor: "pointer",
                background: "transparent", color: "#666",
              }}>
                ↳ {s.name}
              </button>
            ))}
          </>
        )}
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
            {selTenant?.name || "—"}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            Customer Portal · {navItems.find(n => n.id === section)?.label}
          </div>
        </div>

        {/* LICENSES */}
        {section === "licenses" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr style={{ borderBottom: "1px solid #eaeaea", color: "#666" }}>
                  <th style={{ padding: "12px 16px" }}>Key</th><th style={{ padding: "12px 16px" }}>Status</th><th style={{ padding: "12px 16px" }}>Slots</th><th style={{ padding: "12px 16px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => {
                  const active = lic.activations?.filter((a: any) => !a.deactivatedAt).length || 0;
                  return (
                    <tr key={lic.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ fontFamily: "monospace", color: "#333", padding: "12px 16px" }}>{lic.keyMasked}</td>
                      <td style={{ padding: "12px 16px" }}><Badge status={lic.status} /></td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: active >= lic.activationLimit ? "#d00" : "#333" }}>
                          {active} / {lic.activationLimit}
                        </span>
                        <div style={{ marginTop: 4, height: 2, background: "#eaeaea", borderRadius: 2, width: 80 }}>
                          <div style={{ height: "100%", width: `${(active / lic.activationLimit) * 100}%`, background: "#888", borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>
                        {new Date(lic.expiresAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {licenses.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#888", padding: "32px 0" }}>No licenses</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* DEVICES */}
        {section === "devices" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr style={{ borderBottom: "1px solid #eaeaea", color: "#666" }}>
                  <th style={{ padding: "12px 16px" }}>Name</th><th style={{ padding: "12px 16px" }}>Platform</th><th style={{ padding: "12px 16px" }}>Status</th><th style={{ padding: "12px 16px" }}>Last Seen</th><th style={{ padding: "12px 16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ color: "#111", fontWeight: 500, padding: "12px 16px" }}>{d.name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>{d.platform}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={d.status} /></td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>
                      {new Date(d.lastSeenAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Btn onClick={() => deactivateDevice(d.id)} danger small>Unbind</Btn>
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#888", padding: "32px 0" }}>No devices</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* API VAULT */}
        {section === "vault" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "#666" }}>
                AES-256-GCM encrypted · keys never stored in plaintext
              </div>
              <Btn onClick={() => setShowAddKey(true)} small>
                <Plus size={11} /> Add Key
              </Btn>
            </div>

            <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
              {credentials.map((c, idx) => (
                <div key={c.id} style={{
                  padding: "14px 16px",
                  borderBottom: idx < credentials.length - 1 ? "1px solid #eaeaea" : "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontFamily: "monospace", fontSize: 10, padding: "2px 7px", borderRadius: 3,
                        color: "#333", background: "#f0f0f0", border: "1px solid #ddd",
                      }}>
                        {c.provider}
                      </span>
                      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{c.label}</span>
                      <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>{c.scope}</span>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#666" }}>
                      {revealed[c.id] ? c.secret : "••••••••••••••••••••••"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setRevealed(p => ({ ...p, [c.id]: !p[c.id] }))}
                      style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex" }}
                    >
                      {revealed[c.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => deleteCredential(c.id)}
                      style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {credentials.length === 0 && (
                <div style={{ textAlign: "center", color: "#888", padding: "32px 0", fontSize: 12 }}>
                  No API keys stored
                </div>
              )}
            </div>
          </div>
        )}

        {/* BILLING */}
        {section === "billing" && (
          <div style={{ background: "#fff", border: "1px solid #eaeaea", borderRadius: 6 }}>
            <table className="data-table">
              <thead>
                <tr style={{ borderBottom: "1px solid #eaeaea", color: "#666" }}>
                  <th style={{ padding: "12px 16px" }}>Product</th><th style={{ padding: "12px 16px" }}>Amount</th><th style={{ padding: "12px 16px" }}>Method</th><th style={{ padding: "12px 16px" }}>Status</th><th style={{ padding: "12px 16px" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ color: "#333", padding: "12px 16px" }}>{o.productName}</td>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: "#111", padding: "12px 16px" }}>${o.amount.toFixed(2)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>{o.paymentMethod}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={o.status} /></td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#666", padding: "12px 16px" }}>
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#888", padding: "32px 0" }}>No orders</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showAddKey && (
        <Modal title="Save API Key" onClose={() => setShowAddKey(false)}>
          <form onSubmit={addCredential} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 6 }}>PROVIDER</div>
              <select value={newProvider} onChange={e => setNewProvider(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }}>
                {["OPENAI", "ANTHROPIC", "GEMINI"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 6 }}>LABEL</div>
              <input type="text" placeholder="e.g. Main OpenAI Key" value={newLabel} onChange={e => setNewLabel(e.target.value)} required style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 6 }}>SECRET</div>
              <input type="password" placeholder="sk-..." value={newSecret} onChange={e => setNewSecret(e.target.value)} required style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13, fontFamily: "monospace" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.06em", marginBottom: 6 }}>SCOPE</div>
              <select value={newScope} onChange={e => setNewScope(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }}>
                <option value="TENANT">Tenant (shared across devices)</option>
                <option value="PERSONAL">Personal (private)</option>
              </select>
            </div>
            <Btn primary style={{ width: "100%", justifyContent: "center" }}>Encrypt & Save</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}
