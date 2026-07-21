import React, { useState } from "react";
import { Ic, D, uid, ts, fmt, Modal, Empty, SH, SL, SearchBar } from "../lib/utils.jsx";
import BarcodeInput from "../components/BarcodeScanner.jsx";
import { modelKey } from "../components/ListsManager.jsx";

/**
 * CM — Corrective Maintenance
 * Single form, complete on submit:
 *   HTM No · reported problem · found problem · inspection details · parts used
 */
export default function CM({ records, setRecords, session, deviceTypes, models, cmActions }) {
  const [tab, setTab] = useState("new");
  const cmRecords = records.filter(r => r.module === "CM");

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {[
          { k: "new",     l: "New Work Order", icon: D.plus,    n: null },
          { k: "history", l: "History",        icon: D.archive, n: cmRecords.length },
        ].map(t => (
          <button key={t.k} className={"tab-btn" + (tab === t.k ? " active" : "")} onClick={() => setTab(t.k)}>
            <Ic d={t.icon} size={13} /> {t.l}
            {t.n !== null && <span className="count-dot">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "new"     && <NewCM setRecords={setRecords} session={session} deviceTypes={deviceTypes} models={models} cmActions={cmActions} onDone={() => setTab("history")} />}
      {tab === "history" && <CMHistory records={cmRecords} setRecords={setRecords} session={session} />}
    </div>
  );
}

const blankPart = () => ({ id: uid(), partNo: "", description: "", qty: "" });

function NewCM({ setRecords, session, deviceTypes, models, cmActions, onDone }) {
  const [htmNo, setHtmNo]       = useState("");
  const [dtype, setDtype]       = useState("");
  const [model, setModel]       = useState("");
  const [maker, setMaker]       = useState("");
  const [location, setLoc]      = useState("");
  const [reported, setReported] = useState("");
  const [found, setFound]       = useState("");
  const [details, setDetails]   = useState("");
  const [action, setAction]     = useState(cmActions[0] || "");
  const [parts, setParts]       = useState([blankPart()]);
  const [err, setErr]           = useState("");
  const [ok, setOk]             = useState("");

  // Auto-add a new blank parts row when the last one is filled
  const updPart = (id, k, v) => {
    setParts(ps => {
      const next = ps.map(p => p.id === id ? { ...p, [k]: v } : p);
      const last = next[next.length - 1];
      if (last.partNo.trim() || last.description.trim() || String(last.qty).trim()) {
        next.push(blankPart());
      }
      return next;
    });
  };

  const removePart = (id) => {
    setParts(ps => {
      const next = ps.filter(p => p.id !== id);
      return next.length ? next : [blankPart()];
    });
  };

  const submit = () => {
    setErr("");
    if (!htmNo.trim())     { setErr("HTM No is required."); return; }
    if (!reported.trim())  { setErr("User-reported problem is required."); return; }
    if (!found.trim())     { setErr("Problem found is required."); return; }
    if (!details.trim())   { setErr("Inspection details are required."); return; }

    const usedParts = parts.filter(p => p.partNo.trim() || p.description.trim() || String(p.qty).trim());
    if (usedParts.some(p => !p.partNo.trim() || !p.description.trim() || !String(p.qty).trim())) {
      setErr("Every parts row must have a part number, description, and quantity — or be left completely empty.");
      return;
    }

    const rec = {
      id: uid(), module: "CM",
      htmSn: htmNo.trim(),
      deviceType: dtype, model, manufacturer: maker, location,
      reportedProblem: reported.trim(),
      foundProblem: found.trim(),
      inspectionDetails: details.trim(),
      actionTaken: action,
      parts: usedParts.map(p => ({ ...p, qty: String(p.qty).trim() })),
      performedBy: session.username,
      performedAt: ts(),
    };
    setRecords(rs => [rec, ...rs]);

    setHtmNo(""); setDtype(""); setModel(""); setMaker(""); setLoc("");
    setReported(""); setFound(""); setDetails(""); setAction(cmActions[0] || "");
    setParts([blankPart()]);
    setOk(`Work order for ${rec.htmSn} recorded.`);
    setTimeout(() => { setOk(""); onDone(); }, 1700);
  };

  return (
    <div>
      <SH title="New Corrective Maintenance" sub="Record the fault, the findings, the work performed, and the parts consumed" />

      {err && <div className="alert alert-error"><Ic d={D.close} size={14} />{err}</div>}
      {ok  && <div className="alert alert-success"><Ic d={D.check} size={14} />{ok}</div>}

      {/* Device */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 14 }}>
        <SL>Device Identification</SL>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>HTM No / Serial *</label>
            <BarcodeInput value={htmNo} onChange={setHtmNo} placeholder="Scan or type HTM No" autoFocus />
          </div>
          <div className="field">
            <label>Device Type</label>
            <select value={dtype} onChange={e => { setDtype(e.target.value); setModel(""); }}>
              <option value="">Select type…</option>
              {deviceTypes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-3">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)} disabled={!dtype}>
              <option value="">{dtype ? "Select model…" : "Select a device type first"}</option>
              {(models[modelKey("CM", dtype)] || []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Manufacturer</label>
            <input value={maker} onChange={e => setMaker(e.target.value)} placeholder="e.g. Getinge" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Location / Ward</label>
            <input value={location} onChange={e => setLoc(e.target.value)} placeholder="e.g. ICU-2" />
          </div>
        </div>
      </div>

      {/* Problem */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 14 }}>
        <SL>Problem Description</SL>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Problem Reported by User *</label>
            <textarea value={reported} onChange={e => setReported(e.target.value)}
                      placeholder="What the department or user reported…"
                      style={{ minHeight: 100 }} />
          </div>
          <div className="field">
            <label>Problem Found by Engineer *</label>
            <textarea value={found} onChange={e => setFound(e.target.value)}
                      placeholder="The actual fault identified during inspection…"
                      style={{ minHeight: 100 }} />
          </div>
        </div>
      </div>

      {/* Inspection */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 14 }}>
        <SL>Inspection & Repair Details</SL>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Full Details *</label>
          <textarea value={details} onChange={e => setDetails(e.target.value)}
                    placeholder="Describe the inspection performed, tests carried out, root cause, corrective action taken, calibration results, and any recommendations…"
                    style={{ minHeight: 190, lineHeight: 1.6 }} />
        </div>
        <div className="field" style={{ marginBottom: 0, maxWidth: 320 }}>
          <label>Action Taken</label>
          <select value={action} onChange={e => setAction(e.target.value)}>
            {cmActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Parts */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 18 }}>
        <SL>Spare Parts Used</SL>
        <p style={{ fontSize: 12, color: "var(--text3)", margin: "6px 0 12px" }}>
          Leave empty if no parts were consumed. A new row is added automatically as you type.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="parts-table">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>Part Number</th>
                <th style={{ width: "50%" }}>Description</th>
                <th style={{ width: "14%" }}>Qty</th>
                <th style={{ width: "8%" }}></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <input value={p.partNo} onChange={e => updPart(p.id, "partNo", e.target.value)}
                           placeholder="Part No" style={{ fontFamily: "var(--mono)" }} />
                  </td>
                  <td>
                    <input value={p.description} onChange={e => updPart(p.id, "description", e.target.value)}
                           placeholder="Description" />
                  </td>
                  <td>
                    <input value={p.qty} onChange={e => updPart(p.id, "qty", e.target.value)}
                           type="number" inputMode="numeric" min="0" placeholder="0"
                           style={{ fontFamily: "var(--mono)", textAlign: "center" }} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {parts.length > 1 && i < parts.length - 1 && (
                      <button className="btn-danger btn-sm" onClick={() => removePart(p.id)} style={{ padding: "4px 8px" }}>
                        <Ic d={D.trash} size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn-primary btn-lg" onClick={submit}>
        <Ic d={D.check} size={15} stroke="#fff" /> Submit Work Order
      </button>
    </div>
  );
}

function CMHistory({ records, setRecords, session }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState(null);

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.htmSn || "").toLowerCase().includes(s)
        || (r.deviceType || "").toLowerCase().includes(s)
        || (r.reportedProblem || "").toLowerCase().includes(s)
        || (r.foundProblem || "").toLowerCase().includes(s)
        || (r.location || "").toLowerCase().includes(s);
  });

  const exportCsv = () => {
    const head = ["HTM No", "Device Type", "Model", "Manufacturer", "Location",
                  "Reported Problem", "Found Problem", "Inspection Details", "Action",
                  "Parts", "Performed By", "Performed At"];
    const rows = list.map(r => [
      r.htmSn, r.deviceType, r.model, r.manufacturer, r.location,
      r.reportedProblem, r.foundProblem, r.inspectionDetails,
      r.actionTaken,
      (r.parts || []).map(p => `${p.partNo} x${p.qty}`).join(" | "),
      r.performedBy, fmt(r.performedAt)
    ]);
    const csv = [head, ...rows]
      .map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `CM_WorkOrders_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="Work Order History" sub="All corrective maintenance records" />
        <div style={{ display: "flex", gap: 8 }}>
          {session.role === "admin" && records.length > 0 && (
            <button className="btn-danger btn-sm"
                    onClick={() => { if (window.confirm(`Delete all ${records.length} work orders? This cannot be undone.`)) setRecords(rs => rs.filter(r => r.module !== "CM")); }}>
              <Ic d={D.trash} size={13} /> Delete All
            </button>
          )}
          <button className="btn-gold btn-sm" onClick={exportCsv} disabled={list.length === 0}>
            <Ic d={D.excel} size={13} stroke="#fff" /> Export to Excel
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by HTM No, type, problem, or location…" />
      </div>

      {list.length === 0 && <Empty label="No work orders yet" />}

      {list.map(r => (
        <div key={r.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--orange)", fontSize: 14 }}>{r.htmSn}</span>
              {r.deviceType && <span style={{ fontWeight: 600, fontSize: 14 }}>{r.deviceType}</span>}
              {r.model && <span className="badge badge-gray">{r.model}</span>}
              <span className="badge badge-orange">{r.actionTaken}</span>
              {(r.parts || []).length > 0 && (
                <span className="badge badge-blue">{r.parts.length} part{r.parts.length === 1 ? "" : "s"}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost btn-sm" onClick={() => setView(r)}>
                <Ic d={D.list} size={12} /> View Details
              </button>
              {session.role === "admin" && (
                <button className="btn-danger btn-sm"
                        onClick={() => { if (window.confirm("Delete this work order?")) setRecords(rs => rs.filter(x => x.id !== r.id)); }}>
                  <Ic d={D.trash} size={12} />
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 9, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text3)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em" }}>Reported: </strong>
            {r.reportedProblem.length > 110 ? r.reportedProblem.slice(0, 110) + "…" : r.reportedProblem}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            {r.location && <span className="info-pill">📍 {r.location}</span>}
            <span className="info-pill">📅 {fmt(r.performedAt)}</span>
            <span className="info-pill"><Ic d={D.user} size={11} /> {r.performedBy}</span>
          </div>
        </div>
      ))}

      {view && <CMViewer record={view} onClose={() => setView(null)} />}
    </div>
  );
}

function CMViewer({ record: r, onClose }) {
  const Section = ({ label, children }) => (
    <div style={{ marginBottom: 16 }}>
      <SL>{label}</SL>
      <div style={{
        background: "var(--surface2)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "11px 14px", marginTop: 7,
        fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--text2)"
      }}>{children}</div>
    </div>
  );

  return (
    <Modal title={`Work Order — ${r.htmSn}`} onClose={onClose} wide
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {r.deviceType && <span className="badge badge-green">{r.deviceType}</span>}
        {r.model && <span className="badge badge-gray">{r.model}</span>}
        {r.manufacturer && <span className="badge badge-gray">{r.manufacturer}</span>}
        {r.location && <span className="badge badge-blue">📍 {r.location}</span>}
        <span className="badge badge-orange">{r.actionTaken}</span>
      </div>

      <Section label="Problem Reported by User">{r.reportedProblem}</Section>
      <Section label="Problem Found by Engineer">{r.foundProblem}</Section>
      <Section label="Inspection & Repair Details">{r.inspectionDetails}</Section>

      {(r.parts || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SL>Spare Parts Used</SL>
          <div style={{ overflowX: "auto", marginTop: 7 }}>
            <table className="parts-table">
              <thead>
                <tr><th>Part Number</th><th>Description</th><th style={{ width: 70 }}>Qty</th></tr>
              </thead>
              <tbody>
                {r.parts.map(p => (
                  <tr key={p.id}>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 13 }}>{p.partNo}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13 }}>{p.description}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 13, textAlign: "center" }}>{p.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <span className="info-pill"><Ic d={D.user} size={11} /> {r.performedBy}</span>
        <span className="info-pill">📅 {fmt(r.performedAt)}</span>
      </div>
    </Modal>
  );
}
