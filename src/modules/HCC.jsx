import React, { useState, useEffect, useRef } from "react";
import { Ic, D, uid, ts, localTs, fmt, hoursAgo, Modal, Empty, SH, SL, SearchBar } from "../lib/utils.jsx";
import BarcodeInput from "../components/BarcodeScanner.jsx";
import ChecklistRunner from "../components/ChecklistRunner.jsx";
import { ChecklistViewer } from "./PPM.jsx";

const OVERDUE_H = 2;

// ── Shared small row components ────────────────────────────────────────
function RH({ r, children, archived }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--green)", fontSize: 14 }}>{r.mrn}</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.patientName || "—"}</span>
        <span className={"badge " + (r.patientType === "inpatient" ? "badge-gold" : "badge-blue")}>{r.patientType}</span>
        {r.patientType === "inpatient" && r.ward && <span className="badge badge-gray">Ward {r.ward}</span>}
        {archived && <span className="badge badge-green">Archived</span>}
      </div>
      {children && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>}
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

// ── HCC root ───────────────────────────────────────────────────────────
export default function HCC({ records, setRecords, session, deviceTypes, templates }) {
  const [tab, setTab] = useState("incoming");

  const hcc       = records.filter(r => r.module === "HCC");
  const incoming  = hcc.filter(r => !r.status || r.status === "incoming");
  const inProcess = hcc.filter(r => r.status === "in_process");
  const outgoing  = hcc.filter(r => r.status === "outgoing");
  const archived  = hcc.filter(r => r.status === "archived");
  const overdue   = inProcess.filter(r => hoursAgo(r.entryDate) > OVERDUE_H).length;

  const stats = [
    { label: "Incoming",   value: inProcess.length + outgoing.length, color: "var(--blue)" },
    { label: "In Process", value: inProcess.length, color: overdue > 0 ? "var(--orange)" : "var(--gold)", warn: overdue },
    { label: "Outgoing",   value: outgoing.length,  color: "var(--green)" },
    { label: "Archived",   value: archived.length,  color: "var(--text2)" },
  ];

  const tabs = [
    { key: "incoming",   label: "Incoming",   count: 0,                icon: D.inbox },
    { key: "in_process", label: "In Process", count: inProcess.length, icon: D.process, dot: overdue > 0 },
    { key: "outgoing",   label: "Outgoing",   count: outgoing.length,  icon: D.outgoing },
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
      {tab === "in_process" && <InProcessSection  records={inProcess} setRecords={setRecords} session={session} templates={templates} />}
      {tab === "outgoing"   && <OutgoingSection   records={outgoing}  setRecords={setRecords} session={session} />}
      {tab === "archive"    && <ArchiveSection    records={archived}  setRecords={setRecords} session={session} />}
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
      entryDate: edate || ts(), status: "in_process",
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
function InProcessSection({ records, setRecords, session, templates }) {
  const [q, setQ] = useState("");
  const [runner, setRunner] = useState(null); // { recordId, device, template }
  const [viewCl, setViewCl] = useState(null);

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
          checklist: { ...result, stepsSnapshot: template.steps },
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
        return rs.map(r => r.id !== rid ? r : { ...r, status: "outgoing" });
      }
      const moved = { ...rec, id: uid(), status: "outgoing", devices: done };
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
    </div>
  );
}

// ── Outgoing ───────────────────────────────────────────────────────────
function OutgoingSection({ records, setRecords, session }) {
  const [q, setQ] = useState("");
  const [viewCl, setViewCl] = useState(null);

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return r.mrn.toLowerCase().includes(s) || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => d.htmSn.toLowerCase().includes(s));
  });

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
      <SH title="Outgoing" sub="Mark Return and Report for every device before archiving" />
      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by MRN, name, or HTM/SN…" />
      </div>

      {list.length === 0 && <Empty label="Nothing outgoing" />}

      {list.map(r => {
        const pending = r.devices.filter(d => !d.returnChecked && !d.reportChecked).length;
        return (
          <div key={r.id} className="card">
            <RH r={r}>
              {session.role === "admin" && (
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
                  {d.checklist && (
                    <button className="btn-ghost btn-sm" onClick={() => setViewCl(d)}>
                      <Ic d={D.list} size={12} /> Checklist
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

      {viewCl && <ChecklistViewer record={viewCl} onClose={() => setViewCl(null)} />}
    </div>
  );
}

// ── Archive ────────────────────────────────────────────────────────────
function ArchiveSection({ records, setRecords, session }) {
  const [q, setQ] = useState("");
  const [cond, setCond] = useState("all");
  const [viewCl, setViewCl] = useState(null);

  const list = records.filter(r => {
    if (cond !== "all" && !r.devices.some(d => d.condition === cond)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.mrn.toLowerCase().includes(s) || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => d.htmSn.toLowerCase().includes(s) || d.deviceType.toLowerCase().includes(s));
  });

  const exportCsv = () => {
    const head = ["MRN", "Patient Name", "Type", "Ward", "Phone", "Entry Date", "Exit Date",
                  "HTM/SN", "Device Type", "Model", "Manufacturer", "Condition",
                  "Checklist", "Pass", "Fail", "Return", "Report",
                  "Created By", "Inspected By", "Inspection Date", "Completed By"];
    const rows = [];
    list.forEach(r => r.devices.forEach(d => rows.push([
      r.mrn, r.patientName, r.patientType, r.ward, r.phone, fmt(r.entryDate), fmt(r.exitDate),
      d.htmSn, d.deviceType, d.model || "", d.manufacturer || "", d.condition,
      d.checklist?.templateName || "", d.checklist?.summary?.passed ?? "", d.checklist?.summary?.failed ?? "",
      d.returnChecked ? "Yes" : "No", d.reportChecked ? "Yes" : "No",
      r.createdBy, d.inspectedBy, fmt(d.inspectionDate), r.exitBy
    ])));
    const csv = [head, ...rows]
      .map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HCC_Archive_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

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
          <button className="btn-gold btn-sm" onClick={exportCsv} disabled={list.length === 0}>
            <Ic d={D.excel} size={13} stroke="#fff" /> Export to Excel
          </button>
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
    </div>
  );
}
