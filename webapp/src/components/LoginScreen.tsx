"use client";

import React, { useState } from "react";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
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
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("astra_token", data.token);
        onLogin();
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fcfcfc",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ width: 360 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 36,
            height: 36,
            border: "1px solid #eaeaea",
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            background: "#fff",
          }}>
            <ShieldCheck size={16} color="#111" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111", letterSpacing: "0.08em" }}>
            ASTRA
          </div>
          <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", marginTop: 4, letterSpacing: "0.06em" }}>
            LICENSING CONTROL PLANE
          </div>
        </div>

        {/* Form */}
        <div style={{
          background: "#fff",
          border: "1px solid #eaeaea",
          borderRadius: 8,
          padding: "28px 24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.05)"
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 20 }}>
            Administrator Sign In
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 6, letterSpacing: "0.04em" }}>
                USERNAME
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 6, letterSpacing: "0.04em" }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#555",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                fontSize: 12,
                color: "#d00",
                background: "#ffe5e5",
                border: "1px solid #ffcccc",
                borderRadius: 4,
                padding: "8px 12px",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: "9px 16px",
                background: loading ? "#f5f5f5" : "#111",
                color: loading ? "#888" : "#fff",
                border: "1px solid #111",
                borderRadius: 4,
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: 16, fontSize: 11, color: "#888", textAlign: "center", fontFamily: "monospace" }}>
            Default: admin / admin
          </div>
        </div>
      </div>
    </div>
  );
}
