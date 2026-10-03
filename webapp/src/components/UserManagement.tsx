"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Plus, MoreVertical, Edit2, ShieldAlert, Key, Smartphone, FileText, Ban } from "lucide-react";

// --- Helpers ---
function Badge({ status }: { status: string }) {
  const s = status?.toUpperCase() || "UNKNOWN";
  let color = "#555", bg = "#f0f0f0", border = "#ccc";
  if (s === "ACTIVE") { color = "#000"; bg = "#eaeaea"; border = "#ccc"; }
  else if (s === "GRACE") { color = "#666"; bg = "#f5f5f5"; border = "#ddd"; }
  else if (s === "EXPIRED" || s === "REVOKED" || s === "SUSPENDED" || s === "BLOCKED") { color = "#666"; bg = "#fcfcfc"; border = "#eee"; }
  else if (s === "CORPORATION") { color = "#444"; bg = "#eaeaea"; border = "#ccc"; }
  else if (s === "INDIVIDUAL") { color = "#666"; bg = "#f0f0f0"; border = "#ddd"; }
  
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 10, padding: "2px 7px",
      borderRadius: 3, color, background: bg, border: `1px solid ${border}`,
      letterSpacing: "0.05em", fontWeight: 600,
    }}>{s}</span>
  );
}

function Btn({ children, onClick, primary, danger, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 13px", borderRadius: 4, fontSize: 12.5, fontWeight: 500,
      border: "1px solid", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, transition: "all 0.12s", whiteSpace: "nowrap",
      background: primary ? "#111" : danger ? "#ffe5e5" : "#f5f5f5",
      color: primary ? "#fff" : danger ? "#d00" : "#444",
      borderColor: primary ? "#111" : danger ? "#ffcccc" : "#d0d0d0",
    }}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(255,255,255,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ddd", borderRadius: 8,
        padding: "24px", width: "100%", maxWidth: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.1)",
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

export function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState({ name: "", email: "", password: "", type: "CORPORATION" });

  // View state
  const [viewingUser, setViewingUser] = useState<any | null>(null);

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/users?page=${page}&pageSize=10`);
    const data = await res.json();
    if (data.success) {
      setUsers(data.data);
      setMeta(data.meta);
    }
    setLoading(false);
  }, []);

  const fetchUserProfile = async (userId: string) => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/users/${userId}`);
    const data = await res.json();
    if (data.success) {
      setViewingUser(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createData),
    });
    const data = await res.json();
    if (data.success) {
      setShowCreateModal(false);
      setCreateData({ name: "", email: "", password: "", type: "CORPORATION" });
      fetchUsers(1);
    } else {
      alert(data.error);
    }
  };

  // Profile actions
  const handleUpdatePassword = async (newPass: string) => {
    if (!newPass) return;
    const res = await fetch(`/api/v1/admin/users/${viewingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPass }),
    });
    const data = await res.json();
    if (data.success) alert("Password updated successfully.");
    else alert(data.error);
  };

  const handleToggleTenantStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const res = await fetch(`/api/v1/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) fetchUserProfile(viewingUser.id);
    else alert(data.error);
  };

  const handleLicenseAction = async (licenseId: string, action: string, addDays?: number) => {
    const res = await fetch(`/api/v1/admin/licenses/${licenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, addDays }),
    });
    const data = await res.json();
    if (data.success) fetchUserProfile(viewingUser.id);
    else alert(data.error);
  };

  if (viewingUser) {
    const rootMembership = viewingUser.memberships.find((m: any) => !m.tenant.parentTenantId);
    const tenant = rootMembership?.tenant;

    return (
      <div style={{ padding: "24px 0", maxWidth: 1000, margin: "0 auto" }}>
        <button onClick={() => { setViewingUser(null); fetchUsers(meta.page); }} style={{
          background: "none", border: "none", color: "#888", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 20, fontSize: 13
        }}>
          <ChevronLeft size={16} /> Back to Users
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: "0 0 8px 0", color: "#111", display: "flex", alignItems: "center", gap: 12 }}>
              {viewingUser.name}
              {tenant && <Badge status={tenant.type} />}
            </h1>
            <div style={{ color: "#666", fontSize: 14 }}>{viewingUser.email}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => {
              const p = prompt("Enter new password for user:");
              if (p) handleUpdatePassword(p);
            }}>Reset Password</Btn>
            
            {tenant && (
              <Btn danger={tenant.status === "ACTIVE"} onClick={() => handleToggleTenantStatus(tenant.id, tenant.status)}>
                {tenant.status === "ACTIVE" ? <><Ban size={14} /> Suspend Tenant</> : "Unsuspend Tenant"}
              </Btn>
            )}
          </div>
        </div>

        {tenant && (
          <div style={{ display: "grid", gap: 24 }}>
            {/* Devices & Licenses */}
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eaeaea", padding: 20 }}>
              <h2 style={{ fontSize: 14, color: "#333", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <Smartphone size={16} /> Devices & Licenses
              </h2>
              <table className="data-table" style={{ width: "100%", fontSize: 12, textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#666", borderBottom: "1px solid #eaeaea" }}>
                    <th style={{ padding: "8px 0" }}>Device Hash</th>
                    <th>Last Seen</th>
                    <th>License</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.devices?.map((d: any) => {
                    const activation = tenant.licenses?.flatMap((l: any) => l.activations).find((a: any) => a.deviceId === d.id);
                    const license = tenant.licenses?.find((l: any) => l.id === activation?.licenseId);
                    return (
                      <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "12px 0", fontFamily: "monospace", color: "#333" }}>{d.fingerprintHash.substring(0, 16)}...</td>
                        <td style={{ color: "#666" }}>{new Date(d.lastSeenAt).toLocaleDateString()}</td>
                        <td>
                          {license ? (
                            <div>
                              <div style={{ fontFamily: "monospace", color: "#444" }}>{license.keyMasked}</div>
                              <Badge status={license.status} />
                            </div>
                          ) : <span style={{ color: "#888" }}>Unlicensed</span>}
                        </td>
                        <td style={{ color: "#666" }}>{license ? new Date(license.expiresAt).toLocaleDateString() : "—"}</td>
                        <td>
                          {license && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <Btn small onClick={() => {
                                const days = prompt("Renew for how many days?", "30");
                                if (days) handleLicenseAction(license.id, "RENEW", parseInt(days));
                              }}>Renew</Btn>
                              <Btn small danger onClick={() => {
                                if (confirm("Terminate license?")) handleLicenseAction(license.id, "REVOKE");
                              }}>Terminate</Btn>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!tenant.devices || tenant.devices.length === 0) && (
                    <tr><td colSpan={5} style={{ padding: "20px 0", color: "#555", textAlign: "center" }}>No devices registered.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Sub-Corps (Only if CORP) */}
            {tenant.type === "CORPORATION" && (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eaeaea", padding: 20 }}>
                <h2 style={{ fontSize: 14, color: "#333", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldAlert size={16} /> Sub-Organizations
                </h2>
                {tenant.children?.length > 0 ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                    {tenant.children.map((c: any) => (
                      <li key={c.id} style={{ padding: "10px 14px", background: "#fcfcfc", border: "1px solid #eaeaea", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#222" }}>{c.name}</span>
                        <Badge status={c.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: "#888", fontSize: 12 }}>No sub-organizations found.</div>
                )}
              </div>
            )}

            {/* API Keys */}
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eaeaea", padding: 20 }}>
              <h2 style={{ fontSize: 14, color: "#333", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <Key size={16} /> API Providers
              </h2>
              {tenant.credentials?.length > 0 ? (
                <table style={{ width: "100%", fontSize: 12, textAlign: "left", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "#666", borderBottom: "1px solid #eaeaea" }}>
                      <th style={{ padding: "8px 0" }}>Provider</th>
                      <th>Nickname (Label)</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenant.credentials.map((cred: any) => (
                      <tr key={cred.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "12px 0", color: "#333" }}>{cred.provider}</td>
                        <td style={{ color: "#555" }}>{cred.label}</td>
                        <td style={{ color: "#888" }}>{new Date(cred.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: "#888", fontSize: 12 }}>No API keys configured.</div>
              )}
            </div>

          </div>
        )}
      </div>
    );
  }

  // List View
  return (
    <div style={{ padding: "24px 0", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#111" }}>User Management</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Manage accounts, passwords, and organizational profiles.</div>
        </div>
        <Btn primary onClick={() => setShowCreateModal(true)}><Plus size={14} /> Create User</Btn>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eaeaea" }}>
        <table style={{ width: "100%", fontSize: 13, textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#666", borderBottom: "1px solid #eaeaea" }}>
              <th style={{ padding: "14px 20px" }}>Name</th>
              <th>Email</th>
              <th>Type</th>
              <th>Joined</th>
              <th style={{ textAlign: "right", paddingRight: 20 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading users...</td></tr>
            ) : users.map(u => {
              const type = u.memberships?.[0]?.tenant?.type || "UNKNOWN";
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#fcfcfc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    onClick={() => fetchUserProfile(u.id)}
                >
                  <td style={{ padding: "14px 20px", color: "#222" }}>{u.name}</td>
                  <td style={{ color: "#666" }}>{u.email}</td>
                  <td><Badge status={type} /></td>
                  <td style={{ color: "#888" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right", paddingRight: 20 }}>
                    <Btn small onClick={(e: any) => { e.stopPropagation(); fetchUserProfile(u.id); }}>View Profile</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24 }}>
        <Btn disabled={meta.page <= 1} onClick={() => fetchUsers(meta.page - 1)}>Prev</Btn>
        <span style={{ fontSize: 12, color: "#666" }}>Page {meta.page} of {meta.totalPages}</span>
        <Btn disabled={meta.page >= meta.totalPages} onClick={() => fetchUsers(meta.page + 1)}>Next</Btn>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal title="Create New User" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Full Name / Org Name</div>
              <input required value={createData.name} onChange={e => setCreateData({ ...createData, name: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Email Address</div>
              <input required type="email" value={createData.email} onChange={e => setCreateData({ ...createData, email: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Initial Password</div>
              <input required type="password" value={createData.password} onChange={e => setCreateData({ ...createData, password: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Account Type</div>
              <select value={createData.type} onChange={e => setCreateData({ ...createData, type: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", background: "#fcfcfc", border: "1px solid #ddd", borderRadius: 4, color: "#111", fontSize: 13 }}>
                <option value="CORPORATION">Corporation</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Btn primary type="submit">Create User</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
