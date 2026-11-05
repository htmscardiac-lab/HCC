import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Ic, D, Modal, Empty, SH, SL, SearchBar, fmt, ts } from "../lib/utils.jsx";
import { friendlyError } from "../lib/supabase.js";
import * as api from "../lib/api.js";
import { DEFAULT_TEMPLATE, PLACEHOLDERS, withDefaults, findingsFor, reportHtml, printReport } from "../lib/hccReport.js";
import { ChecklistViewer } from "../modules/PPM.jsx";

/**
 * HCC — Defective Review
 *
 * Every device whose inspection comes out DEFECTIVE lands here. Everyone can
 * see the list; only the admin decides:
 *
 *   Owned by the hospital?
 *     yes → optional attachments (PDF / images) → Outgoing
 *     no  → defective-device report: faulty parts + failure types picked from
 *           admin-editable lists, findings text from the template, a
 *           recommendation → preview → save → Outgoing (Report ticked)
 *
 * Only the report DATA is saved; the PDF is produced on request.
 */

// ── Lists + template, shared by the HCC screens ────────────────────────
export function useHccConfig() {
  const [config, setConfig] = useState(null);
  const reload = useCallback(async () => {
    try { setConfig(await api.loadHccConfig()); }
    catch (e) { console.error(e); setConfig(c => c || { error: e }); }
  }, []);
  useEffect(() => {
    reload();
    const stop = api.subscribeHccConfig(reload);
    return stop;
  }, [reload]);
  return { config, reload };
}

const failuresFor = (config, type) => [
  ...((config?.failures?.common) || []),
  ...((config?.failures?.byType?.[type]) || []),
].map(f => f.name);

// ── Report preview (rendered exactly as it prints) ─────────────────────
export function ReportPreview({ record, device, template, report, height = "62vh" }) {
  const html = useMemo(() => reportHtml(record, device, template, report),
    [record, device, template, report]);
  return (
    <iframe title="Report preview" srcDoc={html}
            style={{ width: "100%", height, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} />
  );
}

/** View a saved report, with print / PDF. */
export function ReportViewModal({ record, device, template, onEdit, onClose }) {
  return (
    <Modal title={`Report — ${device.deviceNo || device.htmSn}`} onClose={onClose} wide
      footer={<>
        {onEdit && <button className="btn-ghost" onClick={onEdit}><Ic d={D.pencil} size={13} /> Edit report</button>}
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={() => printReport(record, device, template)}>
          <Ic d={D.copy} size={13} stroke="#fff" /> Print / Save PDF
        </button>
      </>}>
      <ReportPreview record={record} device={device} template={template} />
    </Modal>
  );
}

/** Attachments of a hospital-owned device: open in a new tab. */
export function AttachmentList({ items = [], onRemove }) {
  const [busy, setBusy] = useState("");
  const open = async (a) => {
    setBusy(a.path);
    try { window.open(await api.attachmentUrl(a.path), "_blank", "noopener"); }
    catch (e) { window.alert(friendlyError(e)); }
    finally { setBusy(""); }
  };
  if (!items.length) return <div style={{ fontSize: 12.5, color: "var(--text3)" }}>No attachments.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map(a => (
        <div key={a.path} style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
        }}>
          <Ic d={D.text} size={13} />
          <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
          <span className="badge badge-gray">{Math.max(1, Math.round(a.size / 1024))} KB</span>
          <button className="btn-ghost btn-sm" onClick={() => open(a)} disabled={busy === a.path}>
            {busy === a.path ? "Opening…" : "Open"}
          </button>
          {onRemove && (
            <button className="btn-danger btn-sm" onClick={() => onRemove(a)}><Ic d={D.trash} size={11} /></button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── The admin's decision for one defective device ──────────────────────
/**
 * mode "review" — first decision; saving moves the device to Outgoing.
 * mode "edit"   — change a saved report / attachments; the stage is kept.
 */
export function DefectiveReviewModal({ record, device, session, config, mode = "review", onSave, onClose }) {
  const template = withDefaults(config?.template);
  const partNames = (config?.parts?.[device.deviceType] || []).map(p => p.name);
  const failureNames = failuresFor(config, device.deviceType);
  const recs = (config?.recommendations || []).map(r => r.name);

  // Devices not owned by the hospital need manufacturer and model on the
  // report: typed in when missing, confirmed by the admin when already there.
  const hadDetails = !!(device.manufacturer?.trim() && device.model?.trim());
  const [mfr, setMfr] = useState(device.manufacturer || "");
  const [model, setModel] = useState(device.model || "");
  const [detailsOk, setDetailsOk] = useState(mode === "edit");
  const dev = { ...device, manufacturer: mfr.trim(), model: model.trim() };

  const [owned, setOwned] = useState(device.ownedByHospital);           // null | true | false
  const [attachments, setAttachments] = useState(device.attachments || []);
  const uploadedNow = useRef([]);                                        // removed again on Cancel
  const [uploading, setUploading] = useState(false);

  const prev = device.report || {};
  const [parts, setParts] = useState(() => {
    const m = {};
    (prev.parts || []).forEach(p => { m[p.part] = { on: true, failure: p.failure || "", note: p.note || "" }; });
    return m;
  });
  const [otherParts, setOtherParts] = useState(() =>
    (prev.parts || []).filter(p => !partNames.includes(p.part)).map(p => ({ ...p })));
  const [rec, setRec] = useState(prev.recommendation || "");
  const [recNote, setRecNote] = useState(prev.recommendationNote || "");
  const [findings, setFindings] = useState(prev.findings || "");
  const [findingsEdited, setFindingsEdited] = useState(!!prev.findings);
  const [step, setStep] = useState("form");                              // form | preview
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const chosenParts = useMemo(() => [
    ...partNames.filter(n => parts[n]?.on).map(n => ({ part: n, failure: parts[n].failure, note: parts[n].note })),
    ...otherParts.filter(p => p.part?.trim()).map(p => ({ part: p.part.trim(), failure: p.failure, note: p.note })),
  ], [parts, otherParts, partNames]);

  // Findings follow the parts until the admin edits the text by hand
  useEffect(() => {
    if (!findingsEdited) setFindings(findingsFor(template, dev, chosenParts));
  }, [chosenParts, mfr, model]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = {
    parts: chosenParts,
    recommendation: rec,
    recommendationNote: recNote.trim(),
    findings: findings.trim(),
    issuedBy: session.name,
    issuedByUsername: session.username,
    issuedAt: mode === "edit" && prev.issuedAt ? prev.issuedAt : ts(),
    ...(mode === "edit" && prev.issuedAt ? { editedAt: ts(), editedBy: session.username } : {}),
  };

  const togglePart = (n) => setParts(p => ({ ...p, [n]: { failure: "", note: "", ...p[n], on: !p[n]?.on } }));
  const setPart = (n, k, v) => setParts(p => ({ ...p, [n]: { ...p[n], [k]: v } }));

  const upload = async (files) => {
    setErr(""); setUploading(true);
    try {
      for (const f of files) {
        const meta = await api.uploadAttachment(f, record.id, device.id, session.username);
        uploadedNow.current.push(meta.path);
        setAttachments(a => [...a, meta]);
      }
    } catch (e) { setErr(friendlyError(e)); }
    finally { setUploading(false); }
  };
  const removeAttachment = async (a) => {
    if (!window.confirm(`Remove ${a.name}?`)) return;
    try {
      await api.deleteAttachmentFile(a.path);
      setAttachments(list => list.filter(x => x.path !== a.path));
    } catch (e) { setErr(friendlyError(e)); }
  };

  const cancel = async () => {
    // Files uploaded in this session but not saved would be orphaned
    for (const p of uploadedNow.current) { try { await api.deleteAttachmentFile(p); } catch {} }
    onClose();
  };

  const detailsProblem = () => {
    if (!mfr.trim() || !model.trim()) return "Enter the manufacturer and model.";
    if (hadDetails && !detailsOk) return "Confirm that the manufacturer and model are correct.";
    return "";
  };

  const validateReport = () => {
    const d = detailsProblem(); if (d) return d;
    if (!chosenParts.length) return "Select at least one faulty part.";
    if (chosenParts.some(p => !p.failure)) return "Choose a failure type for every selected part.";
    if (!draft.findings) return "Findings cannot be empty.";
    if (template.showRecommendation && !rec) return "Choose a recommendation.";
    return "";
  };

  const save = async () => {
    setErr("");
    if (owned === null || owned === undefined) { setErr("Answer whether the device is owned by the hospital."); return; }
    let patch;
    if (owned) {
      patch = { ownedByHospital: true, attachments, report: null };
    } else {
      const problem = validateReport();
      if (problem) { setErr(problem); setStep("form"); return; }
      patch = { ownedByHospital: false, report: draft, reportChecked: true,
                manufacturer: mfr.trim(), model: model.trim() };
    }
    if (mode === "review") patch = { ...patch, stage: "outgoing", outgoingAt: ts() };
    setSaving(true);
    try { await onSave(patch); onClose(); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const previewDevice = { ...dev, report: draft };
  const title = `${mode === "edit" ? "Edit" : "Review"} — ${device.deviceNo || device.htmSn} · ${device.deviceType}`;

  return (
    <Modal title={title} onClose={cancel} wide
      footer={<>
        <button className="btn-ghost" onClick={cancel} disabled={saving}>Cancel</button>
        {owned === false && step === "form" && (
          <button className="btn-blue" onClick={() => { const p = validateReport(); if (p) setErr(p); else { setErr(""); setStep("preview"); } }}>
            <Ic d={D.list} size={13} stroke="#fff" /> Preview report
          </button>
        )}
        {owned === false && step === "preview" && (
          <button className="btn-ghost" onClick={() => setStep("form")}><Ic d={D.arrowL} size={13} /> Back to edit</button>
        )}
        {(owned === true || (owned === false && step === "preview")) && (
          <button className="btn-primary" onClick={save} disabled={saving || uploading}>
            <Ic d={D.check} size={13} stroke="#fff" />
            {saving ? "Saving…" : mode === "review" ? "Save & move to Outgoing" : "Save changes"}
          </button>
        )}
      </>}>

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      {/* Device summary */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="info-pill">MRN {record.mrn}</span>
        <span className="info-pill">{device.deviceType}{model.trim() ? " · " + model.trim() : ""}</span>
        <span className="info-pill" style={{ fontFamily: "var(--mono)" }}>{device.htmSn}</span>
        <span className="badge badge-red">✗ Defective</span>
      </div>

      {step === "form" && (<>
        <SL>Is this device owned by the hospital (MNGHA Health Affairs)?</SL>
        <div style={{ display: "flex", gap: 10, margin: "10px 0 18px" }}>
          {[[true, "Yes — hospital owned"], [false, "No — not owned by the hospital"]].map(([v, l]) => (
            <button key={String(v)} onClick={() => { setOwned(v); setErr(""); }}
                    className={owned === v ? "btn-primary" : "btn-ghost"} style={{ flex: 1, justifyContent: "center" }}>
              {owned === v && <Ic d={D.check} size={13} stroke="#fff" />} {l}
            </button>
          ))}
        </div>

        {owned === true && (<>
          <SL>Attachments (optional) — PDF, JPG, PNG or WEBP, up to 5 MB each</SL>
          <div style={{ margin: "10px 0" }}>
            <AttachmentList items={attachments} onRemove={removeAttachment} />
          </div>
          <label className="btn-ghost btn-sm" style={{ display: "inline-flex", cursor: "pointer" }}>
            <Ic d={D.plus} size={12} /> {uploading ? "Uploading…" : "Attach files"}
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: "none" }}
                   disabled={uploading}
                   onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} />
          </label>
        </>)}

        {owned === false && (<>
        <SL>Device details {hadDetails ? "— confirm" : "— required"}</SL>
        <div className="grid-2" style={{ margin: "10px 0 6px" }}>
          <div className="field"><label>Manufacturer *</label>
            <input value={mfr} maxLength={80} onChange={e => { setMfr(e.target.value); setErr(""); }}
                   style={!mfr.trim() ? { borderColor: "var(--red)" } : undefined} /></div>
          <div className="field"><label>Model *</label>
            <input value={model} maxLength={80} onChange={e => { setModel(e.target.value); setErr(""); }}
                   style={!model.trim() ? { borderColor: "var(--red)" } : undefined} /></div>
        </div>
        {hadDetails && (
          <label className="checkbox-custom" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, marginBottom: 18 }}>
            <input type="checkbox" checked={detailsOk} onChange={e => { setDetailsOk(e.target.checked); setErr(""); }} />
            I confirm the manufacturer and model are correct
          </label>
        )}
        {!hadDetails && <div style={{ marginBottom: 18 }} />}

          <SL>Faulty parts — {device.deviceType}</SL>
          {partNames.length === 0 && (
            <div className="alert alert-warn" style={{ marginTop: 8 }}>
              <Ic d={D.warn} size={13} /> No parts are listed for {device.deviceType}. Add them in Fault Lists, or use "Other part" below.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
            {partNames.map(n => {
              const p = parts[n] || {};
              return (
                <div key={n} style={{
                  background: p.on ? "var(--red-lt)" : "var(--surface2)",
                  border: "1px solid " + (p.on ? "#f0c0bb" : "var(--border)"),
                  borderRadius: 8, padding: "8px 11px",
                }}>
                  <label className="checkbox-custom" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0 }}>
                    <input type="checkbox" checked={!!p.on} onChange={() => togglePart(n)} /> {n}
                  </label>
                  {p.on && (
                    <div className="grid-2" style={{ marginTop: 8 }}>
                      <select value={p.failure || ""} onChange={e => setPart(n, "failure", e.target.value)}>
                        <option value="">Failure type…</option>
                        {failureNames.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <input value={p.note || ""} maxLength={200} placeholder="Note (optional)"
                             onChange={e => setPart(n, "note", e.target.value)} />
                    </div>
                  )}
                </div>
              );
            })}
            {otherParts.map((p, i) => (
              <div key={i} style={{ background: "var(--red-lt)", border: "1px solid #f0c0bb", borderRadius: 8, padding: "8px 11px" }}>
                <div className="grid-3">
                  <input value={p.part || ""} maxLength={120} placeholder="Other part"
                         onChange={e => setOtherParts(o => o.map((x, j) => j === i ? { ...x, part: e.target.value } : x))} />
                  <select value={p.failure || ""}
                          onChange={e => setOtherParts(o => o.map((x, j) => j === i ? { ...x, failure: e.target.value } : x))}>
                    <option value="">Failure type…</option>
                    {failureNames.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={p.note || ""} maxLength={200} placeholder="Note (optional)"
                           onChange={e => setOtherParts(o => o.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
                    <button className="btn-danger btn-sm" onClick={() => setOtherParts(o => o.filter((_, j) => j !== i))}>
                      <Ic d={D.trash} size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
                    onClick={() => setOtherParts(o => [...o, { part: "", failure: "", note: "" }])}>
              <Ic d={D.plus} size={12} /> Other part
            </button>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Findings</span>
              {findingsEdited && (
                <button className="btn-ghost btn-sm" onClick={() => { setFindingsEdited(false); setFindings(findingsFor(template, dev, chosenParts)); }}>
                  Rewrite from template
                </button>
              )}
            </label>
            <textarea value={findings} maxLength={2000} style={{ minHeight: 90, lineHeight: 1.55 }}
                      onChange={e => { setFindings(e.target.value); setFindingsEdited(true); }} />
          </div>

          {template.showRecommendation && (
            <div className="grid-2">
              <div className="field"><label>Recommendation</label>
                <select value={rec} onChange={e => setRec(e.target.value)}>
                  <option value="">Choose…</option>
                  {recs.map(r => <option key={r} value={r}>{r}</option>)}
                </select></div>
              <div className="field"><label>Recommendation note (optional)</label>
                <input value={recNote} maxLength={200} onChange={e => setRecNote(e.target.value)} /></div>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text3)" }}>
            Issued by <strong>{session.name}</strong>. Only the report details are saved — the PDF is produced when you print it.
          </p>
        </>)}
      </>)}

      {step === "preview" && owned === false && (
        <ReportPreview record={record} device={previewDevice} template={config?.template} report={draft} />
      )}
    </Modal>
  );
}

// ── Admin: fault lists ─────────────────────────────────────────────────
export function FaultListsModal({ config, deviceTypes = [], onChanged, onClose }) {
  const [tab, setTab] = useState("part");
  const [type, setType] = useState(deviceTypes[0] || "");
  const [scope, setScope] = useState("common");           // failures: common | <deviceType>
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const items =
    tab === "part" ? (config?.parts?.[type] || []) :
    tab === "failure" ? (scope === "common" ? (config?.failures?.common || []) : (config?.failures?.byType?.[scope] || [])) :
    (config?.recommendations || []);

  const typeFor = tab === "part" ? type : tab === "failure" && scope !== "common" ? scope : null;

  const run = async (fn) => {
    setErr("");
    try { await fn(); await onChanged(); } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Modal title="Fault Lists" onClose={onClose} wide
      footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="tab-bar" style={{ marginBottom: 14 }}>
        {[["part", "Parts"], ["failure", "Failure types"], ["recommendation", "Recommendations"]].map(([k, l]) => (
          <button key={k} className={"tab-btn" + (tab === k ? " active" : "")} onClick={() => { setTab(k); setErr(""); }}>{l}</button>
        ))}
      </div>

      {tab === "part" && (
        <div className="field"><label>Device type</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
      )}
      {tab === "failure" && (
        <div className="field"><label>List</label>
          <select value={scope} onChange={e => setScope(e.target.value)}>
            <option value="common">Common — every device type</option>
            {deviceTypes.map(t => <option key={t} value={t}>Only {t}</option>)}
          </select></div>
      )}
      {tab === "failure" && scope !== "common" && (
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: -6 }}>
          These are offered for {scope} in addition to the common list.
        </p>
      )}

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={name} maxLength={120} placeholder="New item"
               onKeyDown={e => { if (e.key === "Enter" && name.trim()) run(async () => { await api.addHccOption(tab, typeFor, name); setName(""); }); }}
               onChange={e => setName(e.target.value)} />
        <button className="btn-primary btn-sm" disabled={!name.trim() || (tab === "part" && !type)}
                onClick={() => run(async () => { await api.addHccOption(tab, typeFor, name); setName(""); })}>
          <Ic d={D.plus} size={12} stroke="#fff" /> Add
        </button>
      </div>

      {items.length === 0 && <Empty label="The list is empty" />}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(it => (
          <div key={it.id} style={{
            display: "flex", alignItems: "center", gap: 8, background: "var(--surface2)",
            border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
          }}>
            <span style={{ flex: 1, fontSize: 13 }}>{it.name}</span>
            <button className="btn-ghost btn-sm" onClick={() => {
              const n = window.prompt("Rename", it.name);
              if (n && n.trim() && n.trim() !== it.name) run(() => api.renameHccOption(it.id, n));
            }}><Ic d={D.pencil} size={11} /></button>
            <button className="btn-danger btn-sm" onClick={() => {
              if (window.confirm(`Remove "${it.name}"? Reports already issued keep their text.`)) run(() => api.deleteHccOption(it.id));
            }}><Ic d={D.trash} size={11} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Admin: report template ─────────────────────────────────────────────
const SAMPLE_RECORD = {
  mrn: "123456", patientName: "Sample Patient", patientType: "outpatient", ward: "", phone: "05XXXXXXXX",
  entryDate: new Date().toISOString(),
};
const SAMPLE_DEVICE = {
  deviceNo: "HCC-2026-0001", deviceType: "CPAP & BIPAP", manufacturer: "ResMed", model: "AirSense 10",
  htmSn: "SN-0000000", inspectionDate: new Date().toISOString(), checklist: null,
};

export function TemplateModal({ config, session, onSaved, onClose }) {
  const [t, setT] = useState(() => withDefaults(config?.template));
  const [view, setView] = useState("edit");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setT(x => ({ ...x, [k]: v }));

  const sampleParts = [{ part: "Blower Motor", failure: "Does not power on", note: "" }];
  const sampleReport = {
    parts: sampleParts, findings: findingsFor(t, SAMPLE_DEVICE, sampleParts),
    recommendation: (config?.recommendations || [])[0]?.name || "Return to the supplier / vendor for repair",
    issuedBy: session.name, issuedAt: new Date().toISOString(),
  };

  const save = async () => {
    setErr(""); setSaving(true);
    try { await api.saveReportTemplate(t, session.id); await onSaved(); onClose(); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const text = (k, label, area) => (
    <div className="field"><label>{label}</label>
      {area
        ? <textarea value={t[k]} maxLength={1000} onChange={e => set(k, e.target.value)} style={{ minHeight: 80, lineHeight: 1.5 }} />
        : <input value={t[k]} maxLength={200} onChange={e => set(k, e.target.value)} />}
    </div>
  );

  return (
    <Modal title="Report Template" onClose={onClose} wide
      footer={<>
        <button className="btn-ghost" onClick={() => { if (window.confirm("Reset every field to the default wording?")) setT({ ...DEFAULT_TEMPLATE }); }}>Reset to default</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}><Ic d={D.save} size={13} stroke="#fff" /> {saving ? "Saving…" : "Save template"}</button>
      </>}>
      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
      <div className="tab-bar" style={{ marginBottom: 14 }}>
        <button className={"tab-btn" + (view === "edit" ? " active" : "")} onClick={() => setView("edit")}>Wording</button>
        <button className={"tab-btn" + (view === "preview" ? " active" : "")} onClick={() => setView("preview")}>Preview</button>
      </div>

      {view === "edit" && (<>
        {text("title", "Report title")}
        <div className="grid-2">{text("headerAr", "Header — Arabic line")}{text("headerEn", "Header — English line")}</div>
        {text("headerSub", "Header — third line")}
        {text("ownershipNote", "Ownership note (next to DEFECTIVE)")}
        {text("findingsTemplate", "Findings wording", true)}
        <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: -6, marginBottom: 12 }}>
          Filled in automatically: {PLACEHOLDERS.join("  ")}
        </p>
        {text("footerNote", "Footer note")}
        <SL>Sections</SL>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {[["showPatient", "Patient information"], ["showChecklist", "Inspection results"], ["showRecommendation", "Recommendation"]].map(([k, l]) => (
            <label key={k} className="checkbox-custom" style={{ fontSize: 12.5 }}>
              <input type="checkbox" checked={!!t[k]} onChange={e => set(k, e.target.checked)} /> {l}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 12 }}>
          Changes apply to every report printed from now on, including reports issued earlier.
        </p>
      </>)}

      {view === "preview" && (
        <ReportPreview record={SAMPLE_RECORD} device={{ ...SAMPLE_DEVICE, report: sampleReport }} template={t} report={sampleReport} />
      )}
    </Modal>
  );
}

// ── The Defective Review tab ───────────────────────────────────────────
export default function DefectiveSection({ records, stageOf, session, config, reloadConfig, deviceTypes, updateDevice }) {
  const isAdmin = session.role === "admin";
  const [q, setQ] = useState("");
  const [viewCl, setViewCl] = useState(null);
  const [review, setReview] = useState(null);            // { record, device }
  const [lists, setLists] = useState(false);
  const [tpl, setTpl] = useState(false);

  const list = records.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.mrn || "").toLowerCase().includes(s) || (r.patientName || "").toLowerCase().includes(s)
        || r.devices.some(d => (d.htmSn || "").toLowerCase().includes(s) || (d.deviceNo || "").toLowerCase().includes(s));
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="Defective Review" sub={isAdmin
          ? "Decide on each defective device: hospital-owned (attach files) or not (issue a report)"
          : "Defective devices waiting for the administrator's decision"} />
        {isAdmin && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => setLists(true)} disabled={!config || config.missing}>
              <Ic d={D.list} size={13} /> Fault Lists
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setTpl(true)} disabled={!config || config.missing}>
              <Ic d={D.text} size={13} /> Report Template
            </button>
          </div>
        )}
      </div>

      {config?.missing && (
        <div className="alert alert-warn"><Ic d={D.warn} size={14} />
          Run schema_hcc_v2.sql in Supabase → SQL Editor to enable reports and attachments.
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search by MRN, name, HTM/SN or device no…" />
      </div>

      {list.length === 0 && <Empty label="No defective devices waiting" />}

      {list.map(r => (
        <div key={r.id} className="card">
          <div className="cardhead" style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--green)", fontSize: 14 }}>{r.mrn}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{r.patientName || "—"}</span>
            <span className="info-pill">📅 {fmt(r.entryDate)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {r.devices.filter(d => stageOf(r, d) === "defective_review").map(d => (
              <div key={d.id} className="device-row">
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>
                    {d.htmSn} {d.deviceNo && <span className="badge badge-gray" style={{ marginLeft: 4 }}>{d.deviceNo}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>{d.deviceType}{d.model ? " · " + d.model : ""}</div>
                </div>
                <span className="badge badge-red">✗ Defective</span>
                {d.checklist && (
                  <button className="btn-ghost btn-sm" onClick={() => setViewCl(d)}><Ic d={D.list} size={12} /> Checklist</button>
                )}
                <span className="info-pill">{fmt(d.inspectionDate)} · {d.inspectedBy}</span>
                {isAdmin ? (
                  <button className="btn-primary btn-sm" disabled={!config || config.missing}
                          onClick={() => setReview({ record: r, device: d })}>
                    <Ic d={D.pencil} size={12} stroke="#fff" /> Review
                  </button>
                ) : (
                  <span className="badge badge-gold">Awaiting admin</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {viewCl && <ChecklistViewer record={viewCl} onClose={() => setViewCl(null)} />}
      {review && (
        <DefectiveReviewModal record={review.record} device={review.device} session={session} config={config}
                              onSave={(patch) => updateDevice(review.record.id, review.device.id, patch)}
                              onClose={() => setReview(null)} />
      )}
      {lists && <FaultListsModal config={config} deviceTypes={deviceTypes} onChanged={reloadConfig} onClose={() => setLists(false)} />}
      {tpl && <TemplateModal config={config} session={session} onSaved={reloadConfig} onClose={() => setTpl(false)} />}
    </div>
  );
}
