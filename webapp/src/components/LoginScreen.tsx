"use client";

import React, { useState } from "react";
import { ShieldCheck, Eye, EyeOff, Lock, User } from "lucide-react";

interface LoginProps {
  onLogin: (userData: any) => void;
}

const SAMPLE_ACCOUNTS = [
  { label: "Admin", username: "admin", password: "admin123", role: "ADMIN", color: "#6366f1" },
  { label: "Corporation", username: "acmecorp", password: "corp123", role: "CORP", color: "#0ea5e9" },
  { label: "Sub-Corp", username: "acme_west", password: "subcorp123", role: "CORP", color: "#0ea5e9" },
  { label: "Individual", username: "johndoe", password: "indv123", role: "INDIVIDUAL", color: "#10b981" },
];

export function LoginScreen({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("astra_token", data.token);
        localStorage.setItem("astra_user", JSON.stringify(data.user));
        onLogin(data.user);
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Connection failed. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (account: typeof SAMPLE_ACCOUNTS[0]) => {
    setUsername(account.username);
    setPassword(account.password);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <img
            src="/logo.svg"
            alt="Novi Logo"
            width={64}
            height={64}
            style={{
              borderRadius: 16,
              marginBottom: 16,
              boxShadow: "0 0 35px rgba(255,255,255,0.15)",
              display: "inline-block",
              objectFit: "contain",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: "0.06em" }}>
            NOVI
          </div>
          <div style={{ fontSize: 12, color: "#6366f1", fontFamily: "monospace", marginTop: 4, letterSpacing: "0.1em" }}>
            LICENSE CONTROL PLANE
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: "32px 28px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 24 }}>
            Sign in to your account
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
                USERNAME OR EMAIL
              </label>
              <div style={{ position: "relative" }}>
                <User size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="admin, acmecorp, johndoe..."
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "10px 40px 10px 36px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 0, display: "flex",
                  }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                fontSize: 12, color: "#f87171",
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "10px 14px",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-submit-btn"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: "11px 16px",
                background: loading ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                width: "100%",
                transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.4)",
              }}
            >
              {loading ? "Authenticating..." : "Sign In →"}
            </button>
          </form>
        </div>

        {/* Sample accounts */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginBottom: 12, letterSpacing: "0.06em" }}>
            SAMPLE ACCOUNTS · CLICK TO FILL
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {SAMPLE_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                id={`quick-login-${acc.username}`}
                onClick={() => quickLogin(acc)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor = acc.color + "66"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: acc.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: acc.color, letterSpacing: "0.06em" }}>{acc.label.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace" }}>{acc.username}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{acc.password}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
