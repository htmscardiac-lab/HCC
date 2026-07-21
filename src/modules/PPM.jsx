import React, { useState } from "react";
import { Ic, D, uid, ts, fmt, Modal, Empty, SH, SL, SearchBar } from "../lib/utils.jsx";
import BarcodeInput from "../components/BarcodeScanner.jsx";
import ChecklistRunner from "../components/ChecklistRunner.jsx";
import { modelKey } from "../components/ListsManager.jsx";

/**
 * PPM — Preventive Maintenance
 * Flow: select device type → select model → enter HTM/SN → run checklist → save record
 */
export default function PPM({ records, setRecords, session, deviceTypes, models, templates }) {
  const [tab, setTab] = useState("new");

  const ppmRecords = records.filter(r => r.module === "PPM");

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {[
          { k: "new",     l: "New PPM",  icon: D.plus,    n: null },
          { k: "history", l: "History",  icon: D.archive, n: ppmRecords.length },
        ].map(t => (
          <button key={t.k} className={"tab-btn" + (tab === t.k ? " active" : "")} onClick={() => setTab(t.k)}>
            <Ic d={t.icon} size={13} /> {t.l}
            {t.n !== null && <span className="count-dot">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "new"     && <NewPPM setRecords={setRecords} session={session} deviceTypes={deviceTypes} models={models} templates={templates} onDone={() => setTab("history")} />}
      {tab === "history" && <PPMHistory records={ppmRecords} setRecords={setRecords} session={session} />}
    </div>
  );
}

function NewPPM({ setRecords, session, deviceTypes, models, templates, onDone }) {
  const [stage, setStage]   = useState(1);   // 1 = device info, 2 = checklist
  const [dtype, setDtype]   = useState("");
  const [model, setModel]   = useState("");
  const [htmSn, setHtmSn]   = useState("");
  const [location, setLoc]  = useState("");
  const [err, setErr]       = useState("");
  const [ok, setOk]         = useState("");

  // PPM checklists are bound to a specific MODEL
  const modelList  = models[modelKey("PPM", dtype)] || [];
  const ppmForType = templates.filter(t => t.module === "PPM" && t.deviceType === dtype);
  const forModel   = ppmForType.filter(t => model && t.model === model);
  const [chosenTplId, setChosenTplId] = useState("");
  const autoTpl    = forModel[0] || null;
  const activeTpl  = forModel.find(t => t.id === chosenTplId) || autoTpl;

  const startChecklist = () => {
    setErr("");
    if (!dtype)         { setErr("Select a device type."); return; }
    if (!model)         { setErr("Select a model."); return; }
    if (!htmSn.trim())  { setErr("HTM / SN is required."); return; }
    if (!activeTpl)     { setErr(`No PPM checklist exists for ${dtype} — ${model}. Ask an administrator to create one.`); return; }
    setStage(2);
  };

  const handleSubmit = (result) => {
    const rec = {
      id: uid(), module: "PPM",
      deviceType: dtype, model,
      htmSn: htmSn.trim(), location,
      checklist: result,
      performedBy: session.username,
      performedAt: ts(),
      status: result.summary.overall,
    };
    setRecords(rs => [rec, ...rs]);
    setStage(1); setDtype(""); setModel(""); setHtmSn(""); setLoc(""); setChosenTplId("");
    setOk(`PPM for ${rec.htmSn} recorded — ${result.summary.overall === "pass" ? "PASS" : "FAIL"}.`);
    setTimeout(() => { setOk(""); onDone(); }, 1800);
  };

  return (
    <div>
      <SH title="New Preventive Maintenance" sub="Select the device, then complete the maintenance checklist" />

      {err && <div className="alert alert-error"><Ic d={D.close} size={14} />{err}</div>}
      {ok  && <div className="alert alert-success"><Ic d={D.check} size={14} />{ok}</div>}

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <SL>Device Information</SL>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Device Type *</label>
            <select value={dtype} onChange={e => { setDtype(e.target.value); setModel(""); setChosenTplId(""); }}>
              <option value="">Select type…</option>
              {deviceTypes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Model *</label>
            <select value={model} onChange={e => { setModel(e.target.value); setChosenTplId(""); }} disabled={!dtype}>
              <option value="">{dtype ? (modelList.length ? "Select model…" : "No models defined for this type") : "Select a device type first"}</option>
              {modelList.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {dtype && modelList.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--orange)", marginTop: 5, fontWeight: 600 }}>
                An administrator must add models for “{dtype}” in the Lists screen.
              </p>
            )}
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>HTM / SN *</label>
            <BarcodeInput value={htmSn} onChange={setHtmSn} placeholder="Scan or type HTM / Serial Number" />
          </div>
          <div className="field">
            <label>Location / Ward</label>
            <input value={location} onChange={e => setLoc(e.target.value)} placeholder="e.g. ICU-2" />
          </div>
        </div>
      </div>

      {/* Template resolution */}
      {dtype && model && (
        <div style={{
          background: activeTpl ? "var(--green-lt)" : "var(--orange-lt)",
          border: "1px solid " + (activeTpl ? "var(--green-mid)" : "#f5c6a0"),
          borderRadius: 10, padding: "13px 16px", marginBottom: 16
        }}>
          {activeTpl ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <Ic d={D.check} size={16} stroke="var(--green)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
                  Checklist: {activeTpl.name}
                </span>
                <span className="badge badge-green">{activeTpl.steps.length} steps</span>
                <span className="badge badge-gray">model: {activeTpl.model}</span>
              </div>
              {forModel.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <label>Use a different checklist for this model</label>
                  <select value={chosenTplId} onChange={e => setChosenTplId(e.target.value)}>
                    <option value="">Auto-selected ({autoTpl?.name})</option>
                    {forModel.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Ic d={D.warn} size={16} stroke="var(--orange)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--orange)" }}>
                No PPM checklist exists for “{dtype} — {model}”. An administrator must create one first.
              </span>
            </div>
          )}
        </div>
      )}

      <button className="btn-primary btn-lg" onClick={startChecklist} disabled={!activeTpl}
              style={{ opacity: activeTpl ? 1 : .5 }}>
        <Ic d={D.play} size={15} stroke="#fff" /> Start Checklist
      </button>

      {stage === 2 && activeTpl && (
        <ChecklistRunner
          template={activeTpl}
          context={{
            title: `PPM — ${htmSn}`,
            subtitle: `${dtype} · ${model}${location ? " · " + location : ""}`
          }}
          onSubmit={handleSubmit}
          onCancel={() => setStage(1)}
        />
      )}
    </div>
  );
}

function PPMHistory({ records, setRecords, session }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState(null);

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.htmSn || "").toLowerCase().includes(s)
        || (r.deviceType || "").toLowerCase().includes(s)
        || (r.model || "").toLowerCase().includes(s)
        || (r.location || "").toLowerCase().includes(s);
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="PPM History" sub="All completed preventive maintenance records" />
        {session.role === "admin" && records.length > 0 && (
          <button className="btn-danger btn-sm"
                  onClick={() => { if (window.confirm(`Delete all ${records.length} PPM records? This cannot be undone.`)) setRecords(rs => rs.filter(r => r.module !== "PPM")); }}>
            <Ic d={D.trash} size={13} /> Delete All
          </button>
        )}
      </div>
      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by HTM/SN, type, model, or location…" />
      </div>

      {list.length === 0 && <Empty label="No PPM records yet" />}

      {list.map(r => (
        <div key={r.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--blue)", fontSize: 14 }}>{r.htmSn}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.deviceType}</span>
              {r.model && <span className="badge badge-gray">{r.model}</span>}
              <span className={"badge " + (r.status === "pass" ? "badge-green" : "badge-red")}>
                {r.status === "pass" ? "✓ PASS" : "✗ FAIL"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost btn-sm" onClick={() => setView(r)}>
                <Ic d={D.list} size={12} /> View Checklist
              </button>
              {session.role === "admin" && (
                <button className="btn-danger btn-sm"
                        onClick={() => { if (window.confirm("Delete this PPM record?")) setRecords(rs => rs.filter(x => x.id !== r.id)); }}>
                  <Ic d={D.trash} size={12} />
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            {r.location && <span className="info-pill">📍 {r.location}</span>}
            <span className="info-pill">📅 {fmt(r.performedAt)}</span>
            <span className="info-pill"><Ic d={D.user} size={11} /> {r.performedBy}</span>
            <span className="info-pill">
              {r.checklist?.summary?.passed || 0} pass
              {r.checklist?.summary?.failed ? ` · ${r.checklist.summary.failed} fail` : ""}
            </span>
          </div>
        </div>
      ))}

      {view && <ChecklistViewer record={view} onClose={() => setView(null)} />}
    </div>
  );
}

// Shared read-only checklist viewer (also used by HCC)
export function ChecklistViewer({ record, onClose }) {
  const cl = record.checklist;
  if (!cl) return null;
  const steps = cl.stepsSnapshot || [];

  return (
    <Modal title={`Checklist — ${record.htmSn || ""}`} onClose={onClose} wide
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div style={{
        background: cl.summary.overall === "pass" ? "var(--green-lt)" : "var(--red-lt)",
        border: "1px solid " + (cl.summary.overall === "pass" ? "var(--green-mid)" : "#f0c0bb"),
        borderRadius: 10, padding: "13px 17px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
      }}>
        <Ic d={cl.summary.overall === "pass" ? D.check : D.warn} size={20}
            stroke={cl.summary.overall === "pass" ? "var(--green)" : "var(--red)"} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: cl.summary.overall === "pass" ? "var(--green)" : "var(--red)" }}>
            {cl.templateName}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 2 }}>
            Completed {fmt(cl.completedAt)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className="badge badge-green">{cl.summary.passed} pass</span>
          {cl.summary.failed > 0 && <span className="badge badge-red">{cl.summary.failed} fail</span>}
          {cl.summary.na > 0 && <span className="badge badge-gray">{cl.summary.na} N/A</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => {
          const a = cl.answers[s.id];
          let display = "—", cls = null;
          if (a) {
            if (s.type === "pass_fail" || s.type === "pass_fail_na") {
              display = a.value === "pass" ? "Pass" : a.value === "fail" ? "Fail" : "N/A";
              cls = a.value === "pass" ? "badge-green" : a.value === "fail" ? "badge-red" : "badge-gray";
            } else if (s.type === "number_range") {
              const v = Number(a.value);
              const lo = s.min === "" ? -Infinity : Number(s.min);
              const hi = s.max === "" ?  Infinity : Number(s.max);
              display = String(a.value) + (s.unit ? " " + s.unit : "");
              cls = (!isNaN(v) && v >= lo && v <= hi) ? "badge-green" : "badge-red";
            } else if (s.type === "select" && s.scored) {
              display = String(a.value ?? "—");
              cls = (s.passOptions || []).includes(a.value) ? "badge-green" : "badge-red";
            } else if (s.type === "date" && (s.datePrecision || "month") === "month" && a.value) {
              const [yy, mm] = String(a.value).split("-");
              const nm = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              display = mm ? `${nm[Number(mm) - 1]} ${yy}` : String(a.value);
            } else {
              display = String(a.value ?? "—") + (s.unit ? " " + s.unit : "");
            }
          }
          return (
            <div key={s.id} style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 7, padding: "9px 12px", display: "flex",
              alignItems: "center", gap: 10, flexWrap: "wrap"
            }}>
              <span style={{
                width: 21, height: 21, borderRadius: 5, background: "var(--surface3)",
                color: "var(--text3)", fontSize: 10, fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--mono)"
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</div>
                {a?.note && <div style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic", marginTop: 2 }}>“{a.note}”</div>}
              </div>
              {cls
                ? <span className={"badge " + cls}>{display}</span>
                : <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text2)" }}>{display}</span>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
