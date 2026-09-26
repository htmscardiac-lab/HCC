import React, { useState, useEffect, useRef } from "react";
import { Ic, D, uid, ts, localTs, fmt, hoursAgo, Modal, Empty, SH, SL, SearchBar } from "../lib/utils.jsx";
import BarcodeInput from "../components/BarcodeScanner.jsx";
import ChecklistRunner from "../components/ChecklistRunner.jsx";
import { ChecklistViewer } from "./PPM.jsx";
import { exportHCCList } from "../lib/exportRecords.js";
import { printStickers, STICKER_SIZES, getStickerSize, setStickerSize } from "../lib/sticker.js";

const OVERDUE_H = 2;           // In Process: warn after two hours
const OUTGOING_OVERDUE_H = 24; // Outgoing: warn after one day

/** Hours a record has been sitting in Outgoing (falls back to entry time). */
const outgoingHours = (r) => hoursAgo(r.outgoingAt || r.entryDate);
const isOutgoingOverdue = (r) => outgoingHours(r) > OUTGOING_OVERDUE_H;

/**
 * Move a record back to an earlier stage (admin only).
 *
 * Nothing is erased: inspection results, checklists and notes all stay. An
 * automatic note records who sent it back and when, so the history stays
 * honest. Stamps that no longer apply to the new stage are cleared, otherwise
 * the "waiting since" and "archived at" times would be wrong.
 */
function sendBack(setRecords, record, target, session) {
  setRecords(rs => rs.map(r => {
    if (r.id !== record.id) return r;
    const from = r.status === "archived" ? "Archive"
               : r.status === "outgoing" ? "Outgoing" : "In Process";
    const to   = target === "in_process" ? "In Process" : "Outgoing";

    const next = {
      ...r,
      status: target,
      notes: [...(r.notes || []), {
        id: uid(),
        text: `Returned from ${from} to ${to}.`,
        by: session.username,
        at: ts(),
        system: true,
      }],
    };
    // Leaving Archive means it is no longer completed
    if (target !== "archived") { next.exitDate = ""; next.exitBy = ""; }
    // Going back to In Process means it is no longer waiting for collection
    if (target === "in_process") next.outgoingAt = "";
    // Arriving in Outgoing restarts the collection clock
    if (target === "outgoing") next.outgoingAt = ts();
    return next;
  }));
}

/**
 * Replace a device's checklist while keeping every earlier result.
 *
 * The previous version is pushed onto a revisions list inside the checklist
 * itself, and the new one is stamped with who edited it. Nothing is deleted,
 * so the original readings remain auditable.
 */
function reviseChecklist(prevChecklist, result, template, session) {
  const revisions = prevChecklist
    ? [...(prevChecklist.revisions || []), { ...prevChecklist, revisions: undefined }]
    : [];
  return {
    ...result,
    stepsSnapshot: result.stepsSnapshot || template?.steps || [],
    revisions,
    ...(prevChecklist ? { editedBy: session.username, editedAt: ts() } : {}),
  };
}

/** Human "2h 15m" / "1d 3h" from a number of hours. */
const durationText = (h) => {
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rem = Math.floor(h % 24);
    return `${d}d${rem ? " " + rem + "h" : ""}`;
  }
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
};

/**
 * Edit an existing HCC record — patient details and the device list.
 *
 * Used from every stage. In "In Process" it is open to everyone; in Outgoing
 * and Archive it is admin-only (the caller decides whether to render the button).
 * Devices that already carry an inspection result keep it; only their
 * identifying fields (HTM/SN, type, model, manufacturer) are editable here.
 */
function EditRecordModal({ record, deviceTypes = [], onSave, onClose }) {
  const [mrn, setMrn]     = useState(record.mrn || "");
  const [name, setName]   = useState(record.patientName || "");
  const [ptype, setPtype] = useState(record.patientType || "outpatient");
  const [ward, setWard]   = useState(record.ward || "");
  const [phone, setPhone] = useState(record.phone || "");
  const [devs, setDevs]   = useState(() =>
    (record.devices || []).map(d => ({ ...d })).concat(
      { id: uid(), htmSn: "", deviceType: "", model: "", manufacturer: "", _new: true }
    )
  );
  const [err, setErr] = useState("");

  const updDev = (id, k, v) => {
    setDevs(ds => {
      const next = ds.map(d => d.id === id ? { ...d, [k]: v } : d);
      const last = next[next.length - 1];
      if (last.htmSn.trim() && last.deviceType) {
        next.push({ id: uid(), htmSn: "", deviceType: "", model: "", manufacturer: "", _new: true });
      }
      return next;
    });
  };
  const removeDev = (id) => setDevs(ds => ds.filter(d => d.id !== id));

  const save = () => {
    setErr("");
    if (!mrn.trim())   { setErr("MRN is required."); return; }
    if (!name.trim())  { setErr("Patient Name is required."); return; }
    if (!phone.trim()) { setErr("Phone / Extension is required."); return; }
    if (ptype === "inpatient" && !ward.trim()) { setErr("Ward Number is required for Inpatient."); return; }

    const filled = devs.filter(d => d.htmSn.trim() || d.deviceType);
    if (!filled.length) { setErr("Keep at least one device."); return; }
    if (filled.some(d => !d.htmSn.trim() || !d.deviceType)) {
      setErr("Every device row needs an HTM/SN and a Device Type."); return;
    }

    onSave({
      ...record,
      mrn: mrn.trim(), patientName: name.trim(), patientType: ptype,
      ward: ptype === "inpatient" ? ward.trim() : "", phone: phone.trim(),
      devices: filled.map(({ _new, ...d }) => d),
    });
    onClose();
  };

  return (
    <Modal title={`Edit Record — ${record.mrn || ""}`} onClose={onClose} wide
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}>
          <Ic d={D.save} size={13} stroke="#fff" /> Save Changes
        </button>
      </>}>

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      <SL>Patient Information</SL>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <div className="field"><label>MRN *</label>
          <input value={mrn} onChange={e => setMrn(e.target.value)} /></div>
        <div className="field"><label>Patient Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>Patient Type *</label>
          <select value={ptype} onChange={e => setPtype(e.target.value)}>
            <option value="outpatient">Outpatient</option>
            <option value="inpatient">Inpatient</option>
          </select></div>
      </div>
      <div className="grid-3">
        {ptype === "inpatient" && (
          <div className="field"><label>Ward Number *</label>
            <input value={ward} onChange={e => setWard(e.target.value)} placeholder="W-3A" /></div>
        )}
        <div className="field"><label>Phone / Extension *</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} /></div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0 16px" }} />
      <SL>Devices — a new row is added automatically</SL>
      <div style={{ marginTop: 12 }}>
        {devs.map((d, i) => (
          <div key={d.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 13, marginBottom: 9 }}>
            <div className="grid-2" style={{ marginBottom: 9 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>HTM / SN {d.condition && <span className="badge badge-gray" style={{ marginLeft: 6 }}>inspected</span>}</label>
                <BarcodeInput value={d.htmSn} onChange={v => updDev(d.id, "htmSn", v)}
                              placeholder={d._new ? "(next device…)" : "Scan or type"} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Device Type</label>
                <select value={d.deviceType} onChange={e => updDev(d.id, "deviceType", e.target.value)}>
                  <option value="">Select type…</option>
                  {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  {/* keep an unknown existing value selectable */}
                  {d.deviceType && !deviceTypes.includes(d.deviceType) && <option value={d.deviceType}>{d.deviceType}</option>}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Model</label>
                <input value={d.model || ""} onChange={e => updDev(d.id, "model", e.target.value)} style={{ fontFamily: "var(--mono)" }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Manufacturer</label>
                <input value={d.manufacturer || ""} onChange={e => updDev(d.id, "manufacturer", e.target.value)} />
              </div>
            </div>
            {!d._new && devs.filter(x => !x._new).length > 1 && (
              <button className="btn-danger btn-sm" style={{ marginTop: 9 }} onClick={() => removeDev(d.id)}>
                <Ic d={D.trash} size={11} /> Remove device
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Shared small row components ────────────────────────────────────────
function RH({ r, children, archived }) {
  return (
    <div className="cardhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--green)", fontSize: 14 }}>{r.mrn}</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.patientName || "—"}</span>
        <span className={"badge " + (r.patientType === "inpatient" ? "badge-gold" : "badge-blue")}>{r.patientType}</span>
        {r.patientType === "inpatient" && r.ward && <span className="badge badge-gray">Ward {r.ward}</span>}
        {archived && <span className="badge badge-green">Archived</span>}
      </div>
      {children && <div className="card-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

function RM({ r }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      {r.phone && <span className="info-pill">📞 {r.phone}</span>}
      <span className="info-pill">📅 {fmt(r.entryDate)}</span>
      <span className="info-pill"><Ic d={D.user} size={11} /> {r.createdBy}</span>
    </div>
  );
}

function DI({ d }) {
  return (
    <div style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>{d.htmSn}</div>
      <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>
        {d.deviceType}
        {d.model && <span style={{ fontFamily: "var(--mono)" }}> · {d.model}</span>}
      </div>
    </div>
  );
}

function CB({ c }) {
  return <span className={"badge " + (c === "working" ? "badge-green" : "badge-red")}>
    {c === "working" ? "✓ Working" : "✗ Defective"}
  </span>;
}

function LiveClock({ onTick, manualRef }) {
  useEffect(() => {
    const timer = setInterval(() => { if (!manualRef.current) onTick(localTs()); }, 1000);
    return () => clearInterval(timer);
  }, []);
  return null;
}

/**
 * Append-only notes for an HCC record (used in Outgoing).
 *
 * Anyone may add a note; it is stamped with the author and the exact time and
 * can never be edited. Notes are shown in the order they were written. Only an
 * admin may delete a note.
 */
function NotesModal({ record, session, onAdd, onDelete, onClose }) {
  const [text, setText] = useState("");
  const notes = record?.notes || [];

  const add = () => {
    if (!text.trim()) return;
    onAdd(record.id, text.trim());
    setText("");
  };

  return (
    <Modal title={`Notes — ${record?.mrn || ""}`} onClose={onClose} wide
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

      <SL>Notes are permanent — they can be added but never edited</SL>

      <div style={{ marginTop: 12, marginBottom: 18 }}>
        {notes.length === 0 && <Empty label="No notes yet" sub="Add the first note below" />}

        {notes.map((n, i) => (
          <div key={n.id} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 9, padding: "11px 14px", marginBottom: 9
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: "var(--green-lt)",
                color: "var(--green)", fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>{i + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{n.by}</span>
              <span className="info-pill">🕒 {fmt(n.at)}</span>
              {session.role === "admin" && (
                <button className="btn-danger btn-sm" style={{ marginLeft: "auto" }}
                        onClick={() => { if (window.confirm("Delete this note permanently?")) onDelete(record.id, n.id); }}>
                  <Ic d={D.trash} size={11} /> Delete
                </button>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--text2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {n.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <label>Add a note</label>
        <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                  placeholder="Type your note…" style={{ minHeight: 90, fontSize: 13 }} />
        <button className="btn-primary" style={{ marginTop: 10 }} onClick={add} disabled={!text.trim()}>
          <Ic d={D.plus} size={13} stroke="#fff" /> Add Note
        </button>
      </div>
    </Modal>
  );
}

// ── HCC root ───────────────────────────────────────────────────────────
export default function HCC({ records, setRecords, session, deviceTypes, templates }) {
  const [tab, setTab] = useState("incoming");

  const hcc       = records.filter(r => r.module === "HCC");
  const incoming  = hcc.filter(r => !r.status || r.status === "incoming");
  const inProcess = hcc.filter(r => r.status === "in_process");
  const outgoing  = hcc.filter(r => r.status === "outgoing");
  const archived  = hcc.filter(r => r.status === "archived");
  const overdue   = inProcess.filter(r => hoursAgo(r.entryDate) > OVERDUE_H).length;
  const outOverdue = outgoing.filter(r =>
    hoursAgo(r.outgoingAt || r.entryDate) > OUTGOING_OVERDUE_H).length;

  const stats = [
    { label: "Incoming",   value: inProcess.length + outgoing.length, color: "var(--blue)" },
    { label: "In Process", value: inProcess.length, color: overdue > 0 ? "var(--orange)" : "var(--gold)", warn: overdue },
    { label: "Outgoing",   value: outgoing.length,  color: outOverdue > 0 ? "var(--orange)" : "var(--green)", warn: outOverdue },
    { label: "Archived",   value: archived.length,  color: "var(--text2)" },
  ];

  const tabs = [
    { key: "incoming",   label: "Incoming",   count: 0,                icon: D.inbox },
    { key: "in_process", label: "In Process", count: inProcess.length, icon: D.process, dot: overdue > 0 },
    { key: "outgoing",   label: "Outgoing",   count: outgoing.length,  icon: D.outgoing, dot: outOverdue > 0 },
    { key: "archive",    label: "Archive",    count: archived.length,  icon: D.archive },
  ];

  return (
    <div>
      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {stats.map(s => (
          <div key={s.label} className="stat-card" style={{ "--sbar": s.color }}>
            <div className="stat-value" style={{ color: s.color }}>
              {s.value}
              {s.warn > 0 && <span style={{ fontSize: 13, marginLeft: 7, color: "var(--orange)" }}>⚠{s.warn}</span>}
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} className={"tab-btn" + (tab === t.key ? " active" : "")} onClick={() => setTab(t.key)}>
            <Ic d={t.icon} size={13} /> {t.label}
            {t.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--orange)" }} />}
            {t.count > 0 && <span className="count-dot">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "incoming"   && <IncomingSection   setRecords={setRecords} session={session} deviceTypes={deviceTypes} />}
      {tab === "in_process" && <InProcessSection  records={inProcess} setRecords={setRecords} session={session} templates={templates} deviceTypes={deviceTypes} />}
      {tab === "outgoing"   && <OutgoingSection   records={outgoing}  setRecords={setRecords} session={session} deviceTypes={deviceTypes} templates={templates} />}
      {tab === "archive"    && <ArchiveSection    records={archived}  setRecords={setRecords} session={session} deviceTypes={deviceTypes} />}
    </div>
  );
}

// ── Incoming ───────────────────────────────────────────────────────────
function IncomingSection({ setRecords, session, deviceTypes }) {
  const blank = () => ({ id: uid(), htmSn: "", deviceType: "", model: "", manufacturer: "" });
  const [mrn, setMrn]     = useState("");
  const [name, setName]   = useState("");
  const [ptype, setPtype] = useState("outpatient");
  const [ward, setWard]   = useState("");
  const [phone, setPhone] = useState("");
  const [edate, setEdate] = useState(() => localTs());
  const edateManualRef    = useRef(false);
  const [devs, setDevs]   = useState([blank()]);
  const [err, setErr]     = useState("");
  const [ok, setOk]       = useState("");

  const updDev = (id, k, v) => {
    setDevs(ds => {
      const next = ds.map(d => d.id === id ? { ...d, [k]: v } : d);
      const last = next[next.length - 1];
      if (last.htmSn.trim() && last.deviceType) next.push(blank());
      return next;
    });
  };

  const submit = () => {
    setErr("");
    if (!mrn.trim())   { setErr("MRN is required."); return; }
    if (!name.trim())  { setErr("Patient Name is required."); return; }
    if (!phone.trim()) { setErr("Phone / Extension is required."); return; }
    if (ptype === "inpatient" && !ward.trim()) { setErr("Ward Number is required for Inpatient."); return; }
    if (!edate)        { setErr("Entry Date & Time is required."); return; }

    const filled = devs.filter(d => d.htmSn.trim() || d.deviceType);
    if (!filled.length) { setErr("Add at least one device."); return; }
    if (filled.some(d => !d.htmSn.trim() || !d.deviceType)) {
      setErr("All device rows must have HTM/SN and Device Type."); return;
    }

    const rec = {
      id: uid(), module: "HCC",
      mrn: mrn.trim(), patientName: name, patientType: ptype,
      ward: ptype === "inpatient" ? ward : "", phone,
      // The picker returns a naive local string; store a true instant so it can
      // never be misread as UTC and appear later than the exit time.
      entryDate: edate ? new Date(edate).toISOString() : ts(),
      status: "in_process",
      createdBy: session.username, createdAt: ts(),
      devices: filled.map(d => ({
        ...d, condition: "", checklist: null,
        returnChecked: false, reportChecked: false,
        inspectionDate: "", inspectedBy: ""
      }))
    };
    setRecords(rs => [rec, ...rs]);
    setMrn(""); setName(""); setPtype("outpatient"); setWard(""); setPhone("");
    setDevs([blank()]); setEdate(localTs()); edateManualRef.current = false;
    setOk("MRN " + rec.mrn + " submitted → In Process.");
    setTimeout(() => setOk(""), 4000);
  };

  return (
    <div>
      <LiveClock onTick={setEdate} manualRef={edateManualRef} />
      <SH title="Register Incoming Device" sub="Register devices entering the workshop for processing" />

      {err && <div className="alert alert-error"><Ic d={D.close} size={14} />{err}</div>}
      {ok  && <div className="alert alert-success"><Ic d={D.check} size={14} />{ok}</div>}

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 14 }}>
        <SL>Patient Information</SL>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="field"><label>MRN *</label>
            <input value={mrn} onChange={e => setMrn(e.target.value)} placeholder="MRN-12345" /></div>
          <div className="field"><label>Patient Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></div>
          <div className="field"><label>Patient Type *</label>
            <select value={ptype} onChange={e => setPtype(e.target.value)}>
              <option value="outpatient">Outpatient</option>
              <option value="inpatient">Inpatient</option>
            </select></div>
        </div>
        <div className="grid-3">
          {ptype === "inpatient" && (
            <div className="field"><label>Ward Number *</label>
              <input value={ward} onChange={e => setWard(e.target.value)} placeholder="W-3A" /></div>
          )}
          <div className="field"><label>Phone / Extension *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xxxxxxxx" /></div>
          <div className="field"><label>Entry Date & Time *</label>
            <input type="datetime-local" value={edate} step="1"
                   onChange={e => { setEdate(e.target.value); edateManualRef.current = true; }} /></div>
        </div>
      </div>

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <SL>Devices — new row adds automatically</SL>
        </div>

        {devs.map((d, i) => (
          <div key={d.id} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 13, marginBottom: 9
          }}>
            <div className="grid-2" style={{ marginBottom: 9 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>HTM / SN {i === 0 && "*"}</label>
                <BarcodeInput value={d.htmSn} onChange={v => updDev(d.id, "htmSn", v)}
                              placeholder={i === devs.length - 1 ? "(next device…)" : "Scan or type"} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Device Type {i === 0 && "*"}</label>
                <select value={d.deviceType} onChange={e => updDev(d.id, "deviceType", e.target.value)}>
                  <option value="">Select type…</option>
                  {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Model <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text3)" }}>(optional)</span></label>
                <input value={d.model} onChange={e => updDev(d.id, "model", e.target.value)}
                       placeholder="e.g. Servo-i" style={{ fontFamily: "var(--mono)" }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Manufacturer <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text3)" }}>(optional)</span></label>
                <input value={d.manufacturer} onChange={e => updDev(d.id, "manufacturer", e.target.value)}
                       placeholder="e.g. Getinge" />
              </div>
            </div>
            {devs.length > 1 && i < devs.length - 1 && (
              <button className="btn-danger btn-sm" style={{ marginTop: 9 }}
                      onClick={() => setDevs(ds => ds.filter(x => x.id !== d.id))}>
                <Ic d={D.trash} size={11} /> Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="btn-primary btn-lg" onClick={submit}>
        <Ic d={D.arrow} size={15} stroke="#fff" /> Submit & Send to In Process
      </button>

    </div>
  );
}

// ── In Process — with checklist ────────────────────────────────────────
function InProcessSection({ records, setRecords, session, templates, deviceTypes }) {
  const [q, setQ] = useState("");
  const [runner, setRunner] = useState(null); // { recordId, device, template }
  const [viewCl, setViewCl] = useState(null);
  const [edit, setEdit] = useState(null);

  const saveEdit = (updated) =>
    setRecords(rs => rs.map(r => r.id === updated.id ? updated : r));

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return r.mrn.toLowerCase().includes(s)
        || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => d.htmSn.toLowerCase().includes(s) || d.deviceType.toLowerCase().includes(s));
  });

  // Resolve HCC checklist template by device TYPE only (per requirement)
  const findTemplate = (deviceType) =>
    templates.find(t => t.module === "HCC" && t.deviceType === deviceType) || null;

  const startChecklist = (recordId, device) => {
    const tpl = findTemplate(device.deviceType);
    if (!tpl) {
      window.alert(
        `لا توجد قائمة فحص لنوع الجهاز "${device.deviceType}".\n` +
        `No checklist template exists for device type "${device.deviceType}".\n\n` +
        `An administrator can create one in Checklist Builder.`
      );
      return;
    }
    setRunner({ recordId, device, template: tpl });
  };

  // Checklist result → automatic Working / Defective
  const handleChecklistSubmit = (result) => {
    const { recordId, device, template } = runner;
    const condition = result.summary.overall === "pass" ? "working" : "defective";

    setRecords(rs => rs.map(r => {
      if (r.id !== recordId) return r;
      return {
        ...r,
        devices: r.devices.map(d => d.id !== device.id ? d : {
          ...d,
          condition,
          // Re-running keeps the earlier result as a revision
          checklist: reviseChecklist(d.checklist, result, template, session),
          inspectionDate: ts(),
          inspectedBy: session.username
        })
      };
    }));
    setRunner(null);
  };

  // Manual override (admin only) — in case no template exists
  const setCondition = (rid, did, condition) => {
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r,
      devices: r.devices.map(d => d.id !== did ? d : {
        ...d, condition,
        inspectionDate: condition ? ts() : "",
        inspectedBy: condition ? session.username : ""
      })
    }));
  };

  const moveChecked = (rid) => {
    setRecords(rs => {
      const rec = rs.find(r => r.id === rid);
      if (!rec) return rs;
      const done    = rec.devices.filter(d => d.condition);
      const pending = rec.devices.filter(d => !d.condition);
      if (done.length === 0) return rs;

      if (pending.length === 0) {
        return rs.map(r => r.id !== rid ? r : { ...r, status: "outgoing", outgoingAt: ts() });
      }
      const moved = { ...rec, id: uid(), status: "outgoing", outgoingAt: ts(), devices: done };
      return rs.map(r => r.id !== rid ? r : { ...r, devices: pending }).concat([moved]);
    });
  };

  const delRec = (rid) => {
    if (window.confirm("Delete this record permanently?")) setRecords(rs => rs.filter(r => r.id !== rid));
  };

  return (
    <div>
      <SH title="In Process" sub="Run the inspection checklist for each device — the result sets its condition automatically" />
      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by MRN, name, HTM/SN, or device type…" />
      </div>

      {list.length === 0 && <Empty label="Nothing in process" />}

      {list.map(r => {
        const h = hoursAgo(r.entryDate);
        const isOverdue = h > OVERDUE_H;
        const doneCount = r.devices.filter(d => d.condition).length;

        return (
          <div key={r.id} className={"card" + (isOverdue ? " card-overdue" : "")}>
            {isOverdue && (
              <div className="overdue-banner">
                <Ic d={D.warn} size={13} />
                Overdue — in process for {Math.floor(h)}h {Math.round((h % 1) * 60)}m (limit: {OVERDUE_H}h)
              </div>
            )}

            <RH r={r}>
              <button className="btn-ghost btn-sm" onClick={() => setEdit(r)}>
                <Ic d={D.pencil} size={13} /> Edit
              </button>
              {session.role === "admin" && (
                <button className="btn-danger btn-sm" onClick={() => delRec(r.id)}>
                  <Ic d={D.trash} size={13} /> Delete
                </button>
              )}
              <button className="btn-outline btn-sm" onClick={() => moveChecked(r.id)}
                      style={{ opacity: doneCount ? 1 : .5 }}>
                Move Inspected ({doneCount}) → Outgoing <Ic d={D.arrow} size={13} stroke="var(--green)" />
              </button>
            </RH>
            <RM r={r} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {r.devices.map(d => (
                <div key={d.id} className="device-row">
                  <DI d={d} />

                  {d.condition ? (
                    <>
                      <CB c={d.condition} />
                      {d.checklist?.editedBy && (
                        <span className="badge badge-purple" title={`Edited by ${d.checklist.editedBy}`}>Edited</span>
                      )}
                      {d.checklist && (
                        <button className="btn-ghost btn-sm" onClick={() => setViewCl({ ...d, htmSn: d.htmSn })}>
                          <Ic d={D.list} size={12} /> View Checklist
                        </button>
                      )}
                      <span className="info-pill">
                        {fmt(d.inspectionDate)} · {d.inspectedBy}
                      </span>
                      <button className="btn-ghost btn-sm" onClick={() => startChecklist(r.id, d)}>
                        <Ic d={D.pencil} size={12} /> Re-run
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => startChecklist(r.id, d)}>
                        <Ic d={D.play} size={12} stroke="#fff" /> Run Checklist
                      </button>
                      {session.role === "admin" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn-ghost btn-sm" onClick={() => setCondition(r.id, d.id, "working")}
                                  title="Manual override — mark working without checklist">
                            ✓ Working
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => setCondition(r.id, d.id, "defective")}
                                  title="Manual override — mark defective without checklist">
                            ✗ Defective
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {runner && (
        <ChecklistRunner
          template={runner.template}
          context={{
            title: `Inspection — ${runner.device.htmSn}`,
            subtitle: `${runner.device.deviceType}${runner.device.model ? " · " + runner.device.model : ""}${runner.device.manufacturer ? " · " + runner.device.manufacturer : ""}`
          }}
          onSubmit={handleChecklistSubmit}
          onCancel={() => setRunner(null)}
        />
      )}

      {viewCl && <ChecklistViewer record={viewCl} onClose={() => setViewCl(null)} />}
      {edit && (
        <EditRecordModal record={edit} deviceTypes={deviceTypes}
                         onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

// ── Outgoing ───────────────────────────────────────────────────────────
function OutgoingSection({ records, setRecords, session, deviceTypes, templates }) {
  const [q, setQ] = useState("");
  const [viewCl, setViewCl] = useState(null);
  const [edit, setEdit] = useState(null);
  const [notesId, setNotesId] = useState(null);
  const [runner, setRunner] = useState(null);   // admin re-running a checklist
  const [size, setSize] = useState(getStickerSize);
  const isAdmin = session.role === "admin";

  const changeSize = (k) => { setStickerSize(k); setSize(k); };

  /** Only inspected devices carry a status worth putting on a sticker. */
  const printable = (r) => (r.devices || []).filter(d => d.condition);

  const findTemplate = (deviceType) =>
    templates.find(t => t.module === "HCC" && t.deviceType === deviceType) || null;

  const startChecklist = (recordId, device) => {
    const tpl = findTemplate(device.deviceType);
    if (!tpl) {
      window.alert(`No checklist template exists for "${device.deviceType}".`);
      return;
    }
    setRunner({ recordId, device, template: tpl });
  };

  const handleChecklistSubmit = (result) => {
    const { recordId, device, template } = runner;
    const condition = result.summary.overall === "pass" ? "working" : "defective";
    setRecords(rs => rs.map(r => r.id !== recordId ? r : {
      ...r,
      devices: r.devices.map(d => d.id !== device.id ? d : {
        ...d,
        condition,
        checklist: reviseChecklist(d.checklist, result, template, session),
        inspectionDate: ts(),
        inspectedBy: session.username,
      })
    }));
    setRunner(null);
  };
  const saveEdit = (updated) =>
    setRecords(rs => rs.map(r => r.id === updated.id ? updated : r));

  const addNote = (rid, text) =>
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, notes: [...(r.notes || []), { id: uid(), text, by: session.username, at: ts() }]
    }));
  const deleteNote = (rid, nid) =>
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, notes: (r.notes || []).filter(n => n.id !== nid)
    }));

  const noteRec = records.find(r => r.id === notesId);

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return r.mrn.toLowerCase().includes(s) || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => d.htmSn.toLowerCase().includes(s));
  })
  // Longest waiting first, so anything overdue for collection is at the top.
  .slice().sort((a, b) =>
    new Date(a.outgoingAt || a.entryDate || 0) - new Date(b.outgoingAt || b.entryDate || 0));

  const toggle = (rid, did, field) => {
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, devices: r.devices.map(d => d.id !== did ? d : { ...d, [field]: !d[field] })
    }));
  };

  const complete = (rid) => {
    const rec = records.find(r => r.id === rid);
    if (!rec) return;
    const pending = rec.devices.filter(d => !d.returnChecked && !d.reportChecked);
    if (pending.length > 0) {
      window.alert(
        "يجب تحديد Return أو Report لكل جهاز قبل الإكمال.\n" +
        "Please select Return or Report for all devices before completing.\n\n" +
        "Devices pending: " + pending.map(d => d.htmSn).join(", ")
      );
      return;
    }
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, status: "archived", exitDate: ts(), exitBy: session.username
    }));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="Outgoing" sub="Mark Return and Report for every device before archiving" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text3)", fontWeight: 600, whiteSpace: "nowrap" }}>
            Sticker size
          </span>
          <select value={size} onChange={e => changeSize(e.target.value)}
                  title="Saved on this computer — each workstation can use its own printer"
                  style={{ width: "auto", minWidth: 210, fontSize: 12.5, padding: "6px 9px" }}>
            {Object.entries(STICKER_SIZES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by MRN, name, or HTM/SN…" />
      </div>

      {list.length === 0 && <Empty label="Nothing outgoing" />}

      {list.map(r => {
        const pending = r.devices.filter(d => !d.returnChecked && !d.reportChecked).length;
        // Waiting time starts when the record reached Outgoing; older records
        // saved before that stamp existed fall back to their entry date.
        const waited = hoursAgo(r.outgoingAt || r.entryDate);
        const isOverdue = waited > OUTGOING_OVERDUE_H;
        return (
          <div key={r.id} className={"card" + (isOverdue ? " card-overdue" : "")}>
            {isOverdue && (
              <div className="overdue-banner">
                <Ic d={D.warn} size={13} />
                Awaiting collection for {durationText(waited)} (limit: 1 day)
              </div>
            )}
            <RH r={r}>
              <button className="btn-ghost btn-sm" onClick={() => setNotesId(r.id)}>
                <Ic d={D.text} size={13} /> Notes
                {(r.notes || []).length > 0 && <span className="count-dot">{r.notes.length}</span>}
              </button>
              <button className="btn-blue btn-sm"
                      onClick={() => printStickers(r, printable(r), size)}
                      disabled={printable(r).length === 0}
                      style={{ opacity: printable(r).length ? 1 : .5 }}
                      title="Print one sticker for every inspected device on this record">
                <Ic d={D.copy} size={13} stroke="#fff" /> Print Stickers
                {printable(r).length > 0 && (
                  <span className="count-dot" style={{ background: "rgba(255,255,255,.2)", color: "#fff", borderColor: "rgba(255,255,255,.35)" }}>
                    {printable(r).length}
                  </span>
                )}
              </button>
              {isAdmin && (
                <button className="btn-ghost btn-sm" onClick={() => setEdit(r)}>
                  <Ic d={D.pencil} size={13} /> Edit
                </button>
              )}
              {isAdmin && (
                <button className="btn-ghost btn-sm" title="Send back so the engineer can correct it"
                        onClick={() => { if (window.confirm("Send this record back to In Process?")) sendBack(setRecords, r, "in_process", session); }}>
                  <Ic d={D.arrowL} size={13} /> Back to In Process
                </button>
              )}
              {isAdmin && (
                <button className="btn-danger btn-sm"
                        onClick={() => { if (window.confirm("Delete this record?")) setRecords(rs => rs.filter(x => x.id !== r.id)); }}>
                  <Ic d={D.trash} size={13} /> Delete
                </button>
              )}
              <button className="btn-outline btn-sm" onClick={() => complete(r.id)}
                      style={{ opacity: pending > 0 ? .55 : 1 }}>
                <Ic d={D.check} size={13} stroke="var(--green)" /> Complete & Archive
                {pending > 0 && (
                  <span style={{ background: "var(--orange)", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 2 }}>
                    {pending} pending
                  </span>
                )}
              </button>
            </RH>
            <RM r={r} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {r.devices.map(d => (
                <div key={d.id} className="device-row">
                  <DI d={d} />
                  {d.condition && <CB c={d.condition} />}
                  {d.checklist?.editedBy && <span className="badge badge-purple" title={`Edited by ${d.checklist.editedBy}`}>Edited</span>}
                  {d.checklist && (
                    <button className="btn-ghost btn-sm" onClick={() => setViewCl(d)}>
                      <Ic d={D.list} size={12} /> Checklist
                    </button>
                  )}
                  {d.condition && (
                    <button className="btn-blue btn-sm" title="Print a sticker for this device"
                            onClick={() => printStickers(r, [d], size)}>
                      <Ic d={D.copy} size={12} stroke="#fff" /> Print
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn-ghost btn-sm" title="Correct the readings — the previous result is kept"
                            onClick={() => startChecklist(r.id, d)}>
                      <Ic d={D.pencil} size={12} /> Edit Checklist
                    </button>
                  )}
                  <label className="checkbox-custom">
                    <input type="checkbox" checked={d.returnChecked} onChange={() => toggle(r.id, d.id, "returnChecked")} />
                    Return
                  </label>
                  <label className="checkbox-custom">
                    <input type="checkbox" checked={d.reportChecked} onChange={() => toggle(r.id, d.id, "reportChecked")} />
                    Report
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {runner && (
        <ChecklistRunner
          template={runner.template}
          context={{
            title: `Edit Inspection — ${runner.device.htmSn}`,
            subtitle: `${runner.device.deviceType}${runner.device.model ? " · " + runner.device.model : ""} — the previous result is kept as a revision`
          }}
          onSubmit={handleChecklistSubmit}
          onCancel={() => setRunner(null)}
        />
      )}

      {viewCl && <ChecklistViewer record={viewCl} onClose={() => setViewCl(null)} />}
      {edit && (
        <EditRecordModal record={edit} deviceTypes={deviceTypes}
                         onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
      {noteRec && (
        <NotesModal record={noteRec} session={session}
                    onAdd={addNote} onDelete={deleteNote}
                    onClose={() => setNotesId(null)} />
      )}
    </div>
  );
}

// ── Archive ────────────────────────────────────────────────────────────
function ArchiveSection({ records, setRecords, session, deviceTypes }) {
  const [q, setQ] = useState("");
  const [cond, setCond] = useState("all");
  const [viewCl, setViewCl] = useState(null);
  const [edit, setEdit] = useState(null);
  const [notesId, setNotesId] = useState(null);
  const saveEdit = (updated) =>
    setRecords(rs => rs.map(r => r.id === updated.id ? updated : r));

  const addNote = (rid, text) =>
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, notes: [...(r.notes || []), { id: uid(), text, by: session.username, at: ts() }]
    }));
  const deleteNote = (rid, nid) =>
    setRecords(rs => rs.map(r => r.id !== rid ? r : {
      ...r, notes: (r.notes || []).filter(n => n.id !== nid)
    }));
  const noteRec = records.find(r => r.id === notesId);

  const list = records.filter(r => {
    if (cond !== "all" && !r.devices.some(d => d.condition === cond)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.mrn.toLowerCase().includes(s) || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => d.htmSn.toLowerCase().includes(s) || d.deviceType.toLowerCase().includes(s));
  })
  // Most recently archived first — a record archived today belongs at the top
  // even if it was registered weeks ago.
  .slice().sort((a, b) =>
    new Date(b.exitDate || b.entryDate || 0) - new Date(a.exitDate || a.entryDate || 0));


  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="Archive" sub="Permanent history of all completed device records" />
        <div style={{ display: "flex", gap: 8 }}>
          {session.role === "admin" && records.length > 0 && (
            <button className="btn-danger btn-sm"
                    onClick={() => { if (window.confirm(`Delete all ${records.length} archived records? This cannot be undone.`)) setRecords(rs => rs.filter(r => !(r.module === "HCC" && r.status === "archived"))); }}>
              <Ic d={D.trash} size={13} /> Delete All
            </button>
          )}
          {session.role === "admin" && (
            <button className="btn-gold btn-sm" onClick={() => exportHCCList(list, "HCC_Archive")}
                    disabled={list.length === 0}>
              <Ic d={D.excel} size={13} stroke="#fff" /> Export to Excel
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by MRN, name, HTM/SN, or device type…" />
        <select value={cond} onChange={e => setCond(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">All Conditions</option>
          <option value="working">Working only</option>
          <option value="defective">Defective only</option>
        </select>
      </div>

      {list.length === 0 && <Empty label="Archive is empty" />}

      {list.map(r => (
        <div key={r.id} className="card">
          <RH r={r} archived>
            <button className="btn-ghost btn-sm" onClick={() => setNotesId(r.id)}>
              <Ic d={D.text} size={13} /> Notes
              {(r.notes || []).length > 0 && <span className="count-dot">{r.notes.length}</span>}
            </button>
            {session.role === "admin" && (
              <button className="btn-ghost btn-sm" onClick={() => setEdit(r)}>
                <Ic d={D.pencil} size={13} /> Edit
              </button>
            )}
            {session.role === "admin" && (
              <button className="btn-ghost btn-sm" title="Reopen for correction"
                      onClick={() => { if (window.confirm("Send this record back to Outgoing?")) sendBack(setRecords, r, "outgoing", session); }}>
                <Ic d={D.arrowL} size={13} /> To Outgoing
              </button>
            )}
            {session.role === "admin" && (
              <button className="btn-ghost btn-sm" title="Reopen for re-inspection"
                      onClick={() => { if (window.confirm("Send this record back to In Process?")) sendBack(setRecords, r, "in_process", session); }}>
                <Ic d={D.arrowL} size={13} /> To In Process
              </button>
            )}
            {session.role === "admin" && (
              <button className="btn-danger btn-sm"
                      onClick={() => { if (window.confirm("Delete this record?")) setRecords(rs => rs.filter(x => x.id !== r.id)); }}>
                <Ic d={D.trash} size={13} /> Delete
              </button>
            )}
          </RH>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {r.phone && <span className="info-pill">📞 {r.phone}</span>}
            <span className="info-pill">📅 Entry: {fmt(r.entryDate)}</span>
            <span className="info-pill">🏁 Exit: {fmt(r.exitDate)}</span>
            <span className="info-pill"><Ic d={D.user} size={11} /> Created: {r.createdBy}</span>
            <span className="info-pill"><Ic d={D.check} size={11} /> Done: {r.exitBy}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {r.devices.map(d => (
              <div key={d.id} className="device-row">
                <DI d={d} />
                {d.condition && <CB c={d.condition} />}
                {d.checklist && (
                  <button className="btn-ghost btn-sm" onClick={() => setViewCl(d)}>
                    <Ic d={D.list} size={12} /> Checklist
                  </button>
                )}
                {d.returnChecked && <span className="badge badge-blue">Return ✓</span>}
                {d.reportChecked && <span className="badge badge-gold">Report ✓</span>}
                <span className="info-pill">Insp: {fmt(d.inspectionDate)} · {d.inspectedBy}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {viewCl && <ChecklistViewer record={viewCl} onClose={() => setViewCl(null)} />}
      {edit && (
        <EditRecordModal record={edit} deviceTypes={deviceTypes}
                         onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
      {noteRec && (
        <NotesModal record={noteRec} session={session}
                    onAdd={addNote} onDelete={deleteNote}
                    onClose={() => setNotesId(null)} />
      )}
    </div>
  );
}
