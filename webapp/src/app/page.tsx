"use client";

import React, { useState, useEffect } from "react";
import { LoginScreen } from "@/components/LoginScreen";
import { ControlPanel } from "@/components/ControlPanel";
import { UserManagement } from "@/components/UserManagement";
import { CustomerPortal } from "@/components/CustomerPortal";

type Tab = "admin" | "users" | "portal";

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("admin");

  useEffect(() => {
    const token = localStorage.getItem("astra_token");
    if (token === "local_admin_token_astra_2026") setAuthed(true);
    setChecking(false);
  }, []);

  if (checking) return null;

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fcfcfc", color: "#111" }}>
      <AppNavbar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => {
        localStorage.removeItem("astra_token");
        setAuthed(false);
      }} />

      <div style={{ padding: "0 28px" }}>
        {activeTab === "admin" && <ControlPanel />}
        {activeTab === "users" && <UserManagement />}
        {activeTab === "portal" && <CustomerPortal />}
      </div>
    </div>
  );
}

function AppNavbar({ activeTab, setActiveTab, onLogout }: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onLogout: () => void;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "admin", label: "Control Panel" },
    { id: "users", label: "User Management" },
    { id: "portal", label: "Customer Portal" },
  ];

  return (
    <header style={{
      borderBottom: "1px solid #eaeaea",
      background: "#ffffff",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        padding: "0 28px",
        height: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#111", letterSpacing: "0.1em" }}>ASTRA</span>
          <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace", letterSpacing: "0.06em", borderLeft: "1px solid #eaeaea", paddingLeft: 10 }}>
            LICENSING CONTROL PLANE
          </span>
        </div>

        {/* Tabs */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, justifyContent: "center" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 4,
                fontSize: 12.5,
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
                background: activeTab === tab.id ? "#f5f5f5" : "transparent",
                color: activeTab === tab.id ? "#111" : "#666",
                borderColor: activeTab === tab.id ? "#e0e0e0" : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#ccc", marginRight: 5, verticalAlign: "middle" }} />
            SQLite dev.db
          </span>
          <button
            onClick={onLogout}
            style={{
              background: "none", border: "1px solid #eaeaea",
              borderRadius: 4, color: "#666", fontSize: 11.5,
              cursor: "pointer", padding: "4px 10px",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
