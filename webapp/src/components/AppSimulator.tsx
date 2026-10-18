"use client";

import React, { useState } from "react";
import { RefreshCw, Shield, Terminal, Monitor, CheckCircle } from "lucide-react";

export function AppSimulator() {
  const [licenseKey, setLicenseKey] = useState("NVI-7K4M-PX29-QRT8-DM73");
  const [deviceName, setDeviceName] = useState("Aalok-Workstation-PC");
  const [activation, setActivation] = useState<any>(null);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const log = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}]  ${msg}`, ...p]);

  const presets = [
    { label: "Aalok Personal (Active)", key: "NVI-7K4M-PX29-QRT8-DM73", device: "Aalok-Workstation-PC" },
    { label: "Dallas Division (Active)", key: "NVI-9X82-WPL4-MN10-ACME", device: "Dallas-Corp-PC-01" },
    { label: "Austin Division (Grace)", key: "NVI-11AA-22BB-33CC-AUST", device: "Austin-Laptop-02" },
    { label: "Expired Key (Will Fail)", key: "NVI-44DD-55EE-66FF-EXPR", device: "Expired-Test-PC" },
  ];

  const activate = async () => {
    setLoading(true);
    log(`POST /api/v1/licenses/activate  key=${licenseKey}`);
    try {
      const res = await fetch("/api/v1/licenses/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: licenseKey.trim(),
          device: {
            fingerprint: `fp_sim_${deviceName.toLowerCase().replace(/\s/g, "_")}_7712`,
            deviceName,
            platform: "win32",
            appVersion: "1.4.0",
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActivation(data.data);
        log(`✓  Activated  |  token=${data.data.deviceToken.slice(0, 16)}…`);
        await sendHeartbeat(data.data.deviceToken);
        await syncCredentials(data.data.tenant.id);
      } else {
        log(`✗  ${data.error}`);
      }
    } catch (e: any) {
      log(`✗  Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendHeartbeat = async (tokenOverride?: string) => {
    const token = tokenOverride || activation?.deviceToken;
    if (!token) return;
    log(`POST /api/v1/devices/heartbeat`);
    const res = await fetch("/api/v1/devices/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceToken: token, appVersion: "1.4.0" }),
    });
    const data = await res.json();
    if (data.success) {
      setHeartbeat(data.data);
      log(`✓  Heartbeat  |  status=${data.data.licenseStatus}  next=${data.data.nextCheckIn}s`);
    } else {
      log(`⚠  ${data.error}`);
    }
  };

  const syncCredentials = async (tenantId: string) => {
    log(`GET /api/v1/credentials?tenantId=${tenantId}&reveal=true`);
    const res = await fetch(`/api/v1/credentials?tenantId=${tenantId}&reveal=true`);
    const data = await res.json();
    if (data.success) {
      setCredentials(data.data);
      log(`✓  Synced ${data.data.length} API key(s)`);
    }
  };

  const reset = () => {
    setActivation(null);
    setHeartbeat(null);
    setCredentials([]);
    log(`Session cleared`);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "24px 0", minHeight: "calc(100vh - 52px)" }}>
      {/* Left: virtual Electron window */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5" }}>App Simulator</div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Simulate Electron client license activation & heartbeat</div>
        </div>

        {/* Electron frame */}
        <div style={{ border: "1px solid #222", borderRadius: 6, overflow: "hidden" }}>
          {/* Title bar */}
          <div style={{ background: "#0f0f0f", borderBottom: "1px solid #1a1a1a", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#333" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#333" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#333" }} />
            <span style={{ fontSize: 11, color: "#444", marginLeft: 8, fontFamily: "monospace" }}>
              Novi Desktop v1.4.0
            </span>
          </div>

          <div style={{ background: "#111", padding: "20px" }}>
            {!activation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em", marginBottom: 8 }}>PRESET KEYS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {presets.map(p => (
                      <button
                        key={p.key}
                        onClick={() => { setLicenseKey(p.key); setDeviceName(p.device); }}
                        style={{
                          textAlign: "left", background: licenseKey === p.key ? "#1a1a1a" : "transparent",
                          border: "1px solid", borderColor: licenseKey === p.key ? "#2a2a2a" : "#1a1a1a",
                          borderRadius: 4, padding: "7px 12px", cursor: "pointer",
                          color: licenseKey === p.key ? "#ccc" : "#444", fontSize: 11.5,
                          fontFamily: "monospace", transition: "all 0.1s",
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em", marginBottom: 6 }}>LICENSE KEY</div>
                  <input
                    value={licenseKey}
                    onChange={e => setLicenseKey(e.target.value)}
                    style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: "0.05em" }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em", marginBottom: 6 }}>DEVICE NAME</div>
                  <input value={deviceName} onChange={e => setDeviceName(e.target.value)} />
                </div>

                <button
                  onClick={activate}
                  disabled={loading}
                  style={{
                    padding: "9px", background: "#fff", color: "#000", border: "1px solid #fff",
                    borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {loading ? <RefreshCw size={13} /> : <Shield size={13} />}
                  {loading ? "Activating…" : "Activate License"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Status banner */}
                <div style={{ border: "1px solid #2a2a2a", borderRadius: 4, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#f5f5f5", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
                      App Active
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: heartbeat?.licenseStatus === "ACTIVE" ? "#ccc" : "#777",
                      background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "2px 8px", borderRadius: 3 }}>
                      {heartbeat?.licenseStatus || "ACTIVE"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                    <div>
                      <div style={{ color: "#444" }}>Organization</div>
                      <div style={{ color: "#ccc", marginTop: 2 }}>{activation.tenant?.name || activation.organization?.name}</div>
                    </div>
                    <div>
                      <div style={{ color: "#444" }}>License</div>
                      <div style={{ color: "#888", fontFamily: "monospace", marginTop: 2 }}>
                        {activation.license?.keyMasked}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#444" }}>Expires</div>
                      <div style={{ color: "#555", fontFamily: "monospace", marginTop: 2 }}>
                        {new Date(activation.license?.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#444" }}>Token</div>
                      <div style={{ color: "#333", fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>
                        {activation.deviceToken.slice(0, 14)}…
                      </div>
                    </div>
                  </div>
                </div>

                {/* Heartbeat */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em" }}>4-HOUR HEARTBEAT</div>
                    <button onClick={() => sendHeartbeat()} style={{
                      background: "none", border: "1px solid #222", borderRadius: 3, color: "#555",
                      fontSize: 11, cursor: "pointer", padding: "2px 10px", display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <RefreshCw size={10} /> Trigger
                    </button>
                  </div>
                  {heartbeat && (
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 4, padding: "10px 12px" }}>
                      <div>status: <span style={{ color: "#ccc" }}>{heartbeat.licenseStatus}</span></div>
                      <div>expires: {new Date(heartbeat.expiresAt).toLocaleDateString()}</div>
                      <div>nextCheckIn: {heartbeat.nextCheckIn}s</div>
                    </div>
                  )}
                </div>

                {/* Synced credentials */}
                {credentials.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em", marginBottom: 8 }}>
                      SYNCED API KEYS ({credentials.length})
                    </div>
                    {credentials.map(c => (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "7px 10px", borderBottom: "1px solid #141414",
                        fontFamily: "monospace", fontSize: 11,
                      }}>
                        <span style={{ color: "#888" }}>[{c.provider}] {c.label}</span>
                        <span style={{ color: "#444" }}>{c.secret.slice(0, 12)}…</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={reset}
                  style={{ padding: "7px", background: "transparent", color: "#444", border: "1px solid #1a1a1a", borderRadius: 4, fontSize: 12, cursor: "pointer" }}
                >
                  Logout / Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: terminal log */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", display: "flex", alignItems: "center", gap: 6 }}>
            <Terminal size={13} /> Network Log
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Live HTTPS request inspector</div>
        </div>

        <div style={{
          background: "#0a0a0a",
          border: "1px solid #1a1a1a",
          borderRadius: 6,
          padding: "14px 16px",
          fontFamily: "monospace",
          fontSize: 11,
          color: "#555",
          height: 480,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {logs.length === 0 ? (
            <span style={{ color: "#222" }}>Waiting for requests…</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} style={{ color: l.startsWith("[") && l.includes("✓") ? "#666" : l.includes("✗") ? "#444" : "#555" }}>
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
