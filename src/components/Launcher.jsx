import React from "react";
import { Ic, D } from "../lib/utils.jsx";
import { MNGHA_LOGO, HTMS_LOGO } from "../lib/logos.js";

const MODULES = [
  {
    id: "HCC",
    code: "HCC",
    name: "Home Care Control",
    ar: "أجهزة الرعاية المنزلية",
    desc: "Register, inspect, and archive home care devices through a four-stage workflow.",
    color: "#1a6b3c",
    tint: "#e8f4ed",
    icon: D.home,
  },
  {
    id: "PPM",
    code: "PPM",
    name: "Preventive Maintenance",
    ar: "الصيانة الوقائية",
    desc: "Run scheduled preventive maintenance checklists by device type and model.",
    color: "#1a4f8a",
    tint: "#e8f0fa",
    icon: D.cog,
  },
  {
    id: "CM",
    code: "CM",
    name: "Corrective Maintenance",
    ar: "الصيانة التصحيحية",
    desc: "Log faults, findings, repair details, and the spare parts consumed.",
    color: "#d35400",
    tint: "#fef5ec",
    icon: D.wrench,
  },
];

export default function Launcher({ session, onPick, onLogout, stats }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{
        background: "var(--green3)", borderBottom: "3px solid var(--gold)",
        padding: "0 20px", height: 64, display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, boxShadow: "0 2px 12px rgba(0,0,0,.18)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={MNGHA_LOGO} alt="MNGHA" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)", background: "#fff", flexShrink: 0 }} />
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>وزارة الحرس الوطني — الشؤون الصحية</div>
            <div style={{ color: "var(--gold-mid)", fontSize: 12, fontWeight: 700 }}>Ministry of National Guard Health Affairs</div>
          </div>
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,.2)", margin: "0 8px" }} />
          <img src={HTMS_LOGO} alt="HTMS" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,.2)", flexShrink: 0 }} />
          <div>
            <div style={{ color: "rgba(255,255,255,.9)", fontWeight: 700, fontSize: 13 }}>HTMS — Healthcare Technology Management Services</div>
            <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11, letterSpacing: ".04em" }}>Unified Maintenance Platform</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{session.name}</div>
            <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11 }}>@{session.username}</div>
          </div>
          <span className={"badge " + (session.role === "admin" ? "badge-gold" : "badge-green")} style={{ fontSize: 10 }}>
            {session.role.toUpperCase()}
          </span>
          <button onClick={onLogout} style={{
            background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 6, padding: "6px 13px", fontSize: 12, fontFamily: "var(--sans)",
            fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}>
            <Ic d={D.logout} size={13} stroke="#fff" /> Sign Out
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 1000 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1 style={{ fontSize: 27, fontWeight: 800, color: "var(--green3)", marginBottom: 7 }}>
              Select a Module
            </h1>
            <p style={{ fontSize: 14, color: "var(--text3)", fontWeight: 500 }}>
              Choose the maintenance workflow you want to work in
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 18 }}>
            {MODULES.map(m => (
              <div key={m.id} className="module-card" style={{ "--mcolor": m.color }}
                   onClick={() => onPick(m.id)}>
                <div className="module-icon" style={{ background: m.tint, border: "1px solid " + m.color + "33" }}>
                  <Ic d={m.icon} size={30} stroke={m.color} sw={1.8} />
                </div>
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                  color: m.color, letterSpacing: ".1em", marginBottom: 5
                }}>{m.code}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", marginBottom: 3 }}>{m.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text3)", fontWeight: 600, marginBottom: 11 }}>{m.ar}</div>
                <div style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.55, marginBottom: 15 }}>{m.desc}</div>

                {stats && stats[m.id] !== undefined && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: m.tint, border: "1px solid " + m.color + "33",
                    borderRadius: 20, padding: "4px 13px"
                  }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: m.color }}>
                      {stats[m.id]}
                    </span>
                    <span style={{ fontSize: 11, color: m.color, fontWeight: 600 }}>records</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer style={{ padding: "16px 24px", textAlign: "center", fontSize: 11.5, color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
        HTMS Unified Maintenance Platform · v2.0.0 · Ministry of National Guard Health Affairs
      </footer>
    </div>
  );
}
