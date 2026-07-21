import React from "react";

// ── ID / time helpers ────────────────────────────────────────────────
// Records, devices and templates are stored in Postgres with uuid primary
// keys, so ids are generated as real uuids on the client.
export const uid = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  // Fallback for older webviews without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};
export const ts  = () => new Date().toISOString();

export const localTs = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
         "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
};

export const fmt = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
};

export const hoursAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : 0;

// ── Storage ──────────────────────────────────────────────────────────
export const load = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
};
export const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

// ── Icons ────────────────────────────────────────────────────────────
export const Ic = ({ d, size = 15, stroke = "currentColor", fill = "none", sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={d} />
  </svg>
);

export const D = {
  logout:   "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  user:     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8",
  plus:     "M12 5v14M5 12h14",
  trash:    "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  search:   "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0",
  archive:  "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  check:    "M20 6L9 17l-5-5",
  arrow:    "M5 12h14M12 5l7 7-7 7",
  arrowL:   "M19 12H5M12 19l-7-7 7-7",
  close:    "M18 6L6 18M6 6l12 12",
  chip:     "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
  users:    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  inbox:    "M22 12h-4l-3 9L9 3l-3 9H2",
  process:  "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  outgoing: "M17 8l4 4-4 4M3 12h18",
  excel:    "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h8",
  pencil:   "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  key:      "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  cog:      "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  clock:    "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-14v4l3 3",
  warn:     "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  barcode:  "M3 5v14M6 5v14M9 5v14M12 5v10M15 5v14M18 5v14M21 5v14",
  camera:   "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8",
  home:     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  list:     "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  wrench:   "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10",
  grid:     "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  hash:     "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  text:     "M4 7V4h16v3M9 20h6M12 4v16",
  gauge:    "M12 22a10 10 0 100-20 10 10 0 000 20z M12 12l4-4",
  copy:     "M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
  play:     "M5 3l14 9-14 9V3z",
  save:     "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8M7 3v5h8",
};

// ── Field type registry for checklist builder ────────────────────────
export const FIELD_TYPES = [
  { id: "pass_fail",     label: "Pass / Fail",           icon: D.check,    color: "var(--green)",  desc: "Two-state result" },
  { id: "pass_fail_na",  label: "Pass / Fail / N/A",     icon: D.check,    color: "var(--blue)",   desc: "Three-state with not-applicable" },
  { id: "text_short",    label: "Short Text",            icon: D.text,     color: "var(--text2)",  desc: "Single-line note" },
  { id: "text_long",     label: "Long Text",             icon: D.list,     color: "var(--text2)",  desc: "Multi-line details" },
  { id: "number",        label: "Number",                icon: D.hash,     color: "var(--gold)",   desc: "Numeric keypad on mobile" },
  { id: "number_range",  label: "Number with Range",     icon: D.gauge,    color: "var(--orange)", desc: "Auto pass/fail against min–max" },
  { id: "select",        label: "Dropdown Choice",       icon: D.grid,     color: "var(--purple)", desc: "Pick from preset options" },
  { id: "date",          label: "Date",                  icon: D.calendar, color: "var(--blue)",   desc: "Date picker" },
];

export const typeMeta = (id) => FIELD_TYPES.find(t => t.id === id) || FIELD_TYPES[0];

// ── Shared small components ──────────────────────────────────────────
export function Modal({ title, children, onClose, footer, wide }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " modal-wide" : "")}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button className="btn-ghost btn-sm" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Ic d={D.close} size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ label, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "52px 20px", color: "var(--text3)" }}>
      <div style={{ fontSize: 36, marginBottom: 10, opacity: .35 }}>◻</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 5, opacity: .8 }}>{sub}</div>}
    </div>
  );
}

export function SH({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

export function SL({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em" }}>{children}</p>;
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="search-wrap" style={{ flex: 1 }}>
      <span className="search-icon"><Ic d={D.search} size={14} /></span>
      <input value={value} onChange={e => onChange(e.target.value)}
             placeholder={placeholder || "Search…"} />
    </div>
  );
}
