"use client";

import React from "react";
import { ShieldCheck, Server, LayoutDashboard, Monitor, Database } from "lucide-react";

type Tab = "admin" | "portal" | "simulator" | "architecture";

interface NavbarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "admin", label: "Control Panel", icon: <Server size={13} /> },
    { id: "portal", label: "Customer Portal", icon: <LayoutDashboard size={13} /> },
    { id: "simulator", label: "App Simulator", icon: <Monitor size={13} /> },
    { id: "architecture", label: "Architecture", icon: <Database size={13} /> },
  ];

  return (
    <header style={{
      borderBottom: "1px solid #1f1f1f",
      background: "#0a0a0a",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 24px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="Novi Logo" width={22} height={22} style={{ borderRadius: 6, objectFit: "contain" }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: "0.05em" }}>
            NOVI
          </span>
          <span style={{
            fontSize: 10,
            color: "#444",
            fontFamily: "monospace",
            marginLeft: 4,
            letterSpacing: "0.05em"
          }}>
            LICENSING CONTROL PLANE
          </span>
        </div>

        {/* Tabs */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 4,
                fontSize: 12.5,
                fontWeight: 500,
                border: "1px solid transparent",
                background: activeTab === tab.id ? "#1a1a1a" : "transparent",
                color: activeTab === tab.id ? "#f5f5f5" : "#555",
                borderColor: activeTab === tab.id ? "#2a2a2a" : "transparent",
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#aaa";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#555";
                }
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* DB status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888", fontFamily: "monospace" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span>Supabase <span style={{ color: "#666" }}>PostgreSQL</span></span>
        </div>
      </div>
    </header>
  );
}
