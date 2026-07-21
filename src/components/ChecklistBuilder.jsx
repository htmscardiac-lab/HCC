import React, { useState } from "react";
import { Ic, D, Modal, uid, FIELD_TYPES, typeMeta, SL, Empty } from "../lib/utils.jsx";
import ChecklistImport from "./ChecklistImport.jsx";
import { modelKey } from "./ListsManager.jsx";
import { exportTemplateToExcel } from "../lib/checklistIO.js";

/**
 * Admin-facing builder for checklist templates.
 *
 * A template is:
 *   { id, module, deviceType, model, name, steps: [ ...items ] }
 *
 * module     — "HCC" | "PPM"   (Corrective uses a fixed form, not a template)
 * deviceType — required
 * model      — optional; empty string means "applies to all models"
 *
 * A step item is:
 *   { id, type, label, required, help,
 *     options:[],            // select
 *     min, max, unit,        // number_range
 *     defaultValue }
 */

export default function ChecklistBuilder({ templates, setTemplates, deviceTypes, models, session, onClose }) {
  const [editing, setEditing] = useState(null);   // template being edited
  const [filter,  setFilter]  = useState("");

  const list = templates.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (t.name || "").toLowerCase().includes(q)
        || (t.deviceType || "").toLowerCase().includes(q)
        || (t.model || "").toLowerCase().includes(q)
        || (t.module || "").toLowerCase().includes(q);
  });

  const blank = () => ({
    id: uid(), module: "HCC", deviceType: "", model: "", name: "",
    steps: [], createdBy: session.username, createdAt: new Date().toISOString()
  });

  const saveTemplate = (tpl) => {
    setTemplates(ts => {
      const exists = ts.find(t => t.id === tpl.id);
      return exists ? ts.map(t => t.id === tpl.id ? tpl : t) : [...ts, tpl];
    });
    setEditing(null);
  };

  const duplicate = (tpl) => {
    setTemplates(ts => [...ts, {
      ...tpl, id: uid(), name: tpl.name + " (copy)",
      steps: tpl.steps.map(s => ({ ...s, id: uid() }))
    }]);
  };

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        deviceTypes={deviceTypes}
        models={models}
        onSave={saveTemplate}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Modal title="Checklist Templates" onClose={onClose} wide
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <span className="search-icon"><Ic d={D.search} size={14} /></span>
          <input value={filter} onChange={e => setFilter(e.target.value)}
                 placeholder="Search by name, module, device type, or model…" />
        </div>
        <button className="btn-primary btn-sm" style={{ flexShrink: 0 }}
                onClick={() => setEditing(blank())}>
          <Ic d={D.plus} size={13} stroke="#fff" /> New Template
        </button>
      </div>

      {list.length === 0 && (
        <Empty label="No checklist templates yet"
               sub="Create one to define the inspection steps for a device type" />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map(t => (
          <div key={t.id} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 14px", display: "flex",
            alignItems: "center", gap: 12, flexWrap: "wrap"
          }}>
            <span className={"badge " + (t.module === "PPM" ? "badge-blue" : "badge-green")}>
              {t.module}
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name || "(untitled)"}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                {t.deviceType || "—"}
                {t.model ? <> · <span style={{ fontFamily: "var(--mono)" }}>{t.model}</span></> : (t.module === "PPM" ? <> · all models</> : null)}
                {" · "}{t.steps.length} step{t.steps.length === 1 ? "" : "s"}
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(t)}>
              <Ic d={D.pencil} size={12} /> Edit
            </button>
            <button className="btn-ghost btn-sm" onClick={() => duplicate(t)} title="Duplicate">
              <Ic d={D.copy} size={12} />
            </button>
            <button className="btn-danger btn-sm"
                    onClick={() => { if (window.confirm("Delete this template?")) setTemplates(ts => ts.filter(x => x.id !== t.id)); }}>
              <Ic d={D.trash} size={12} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Template editor ────────────────────────────────────────────────────
function TemplateEditor({ template, deviceTypes, models, onSave, onCancel }) {
  const [tpl, setTpl]       = useState({ ...template, steps: template.steps.map(s => ({ ...s })) });
  const [err, setErr]       = useState("");
  const [openStep, setOpen] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const upd  = (k, v) => setTpl(t => ({ ...t, [k]: v }));
  const updStep = (id, k, v) => setTpl(t => ({ ...t, steps: t.steps.map(s => s.id === id ? { ...s, [k]: v } : s) }));

  const addStep = (type) => {
    const s = {
      id: uid(), type, label: "", required: true, help: "",
      options: type === "select" ? ["Option 1", "Option 2"] : [],
      min: "", max: "", unit: "", defaultValue: "",
      scored: false, passOptions: [], datePrecision: "month"
    };
    setTpl(t => ({ ...t, steps: [...t.steps, s] }));
    setOpen(s.id);
  };

  const move = (idx, dir) => {
    setTpl(t => {
      const arr = [...t.steps];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return t;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...t, steps: arr };
    });
  };

  const submit = () => {
    setErr("");
    if (!tpl.name.trim())       { setErr("Template name is required."); return; }
    if (!tpl.deviceType)        { setErr("Device type is required."); return; }
    if (tpl.module === "PPM" && !tpl.model) { setErr("PPM checklists must be bound to a model."); return; }
    if (tpl.module === "HCC" && tpl.model)  { tpl.model = ""; }
    if (tpl.steps.length === 0) { setErr("Add at least one step."); return; }
    if (tpl.steps.some(s => !s.label.trim())) { setErr("Every step needs a label."); return; }
    const badRange = tpl.steps.find(s => s.type === "number_range" && s.min === "" && s.max === "");
    if (badRange) { setErr(`Step "${badRange.label}" needs at least a minimum or a maximum value.`); return; }
    onSave(tpl);
  };

  return (
    <Modal title={template.name ? "Edit Template" : "New Checklist Template"} onClose={onCancel} wide
      footer={<>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}>
          <Ic d={D.save} size={13} stroke="#fff" /> Save Template
        </button>
      </>}>

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      {/* Template meta */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <SL>Template Details</SL>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Template Name *</label>
            <input value={tpl.name} onChange={e => upd("name", e.target.value)}
                   placeholder="e.g. Ventilator Annual PPM" />
          </div>
          <div className="field">
            <label>Module *</label>
            <select value={tpl.module} onChange={e => { setTpl(t => ({ ...t, module: e.target.value, deviceType: "", model: "" })); }}>
              <option value="HCC">HCC — Home Care inspection</option>
              <option value="PPM">PPM — Preventive maintenance</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Device Type * <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text3)" }}>(from the {tpl.module} list)</span></label>
            <select value={tpl.deviceType} onChange={e => { upd("deviceType", e.target.value); upd("model", ""); }}>
              <option value="">Select device type…</option>
              {(deviceTypes[tpl.module] || []).map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
            {(deviceTypes[tpl.module] || []).length === 0 && (
              <p style={{ fontSize: 11, color: "var(--orange)", marginTop: 5, fontWeight: 600 }}>
                {tpl.module} has no device types yet — add them in the Lists screen.
              </p>
            )}
          </div>
          {tpl.module === "PPM" ? (
            <div className="field">
              <label>Model *</label>
              <select value={tpl.model} onChange={e => upd("model", e.target.value)} disabled={!tpl.deviceType}>
                <option value="">{tpl.deviceType ? "Select model…" : "Select a device type first"}</option>
                {(models[modelKey("PPM", tpl.deviceType)] || []).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                PPM checklists are bound to a specific model. Manage the model list from the Dropdown Lists screen.
              </p>
            </div>
          ) : (
            <div className="field">
              <label>Model</label>
              <input value="" disabled placeholder="Not used — HCC checklists match by device type only"
                     style={{ opacity: .55 }} />
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                HCC checklists apply to every model of the selected device type.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <SL>Checklist Steps ({tpl.steps.length})</SL>
        <div style={{ display: "flex", gap: 7 }}>
          <button className="btn-outline btn-sm" onClick={() => setShowImport(true)}>
            <Ic d={D.excel} size={12} stroke="var(--green)" /> Import from Excel
          </button>
          {tpl.steps.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => exportTemplateToExcel(tpl)}>
              <Ic d={D.save} size={12} /> Export to Excel
            </button>
          )}
        </div>
      </div>

      {/* Add step palette */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 7, marginBottom: 16 }}>
        {FIELD_TYPES.map(ft => (
          <button key={ft.id} className="btn-ghost btn-sm"
                  onClick={() => addStep(ft.id)}
                  style={{ justifyContent: "flex-start", padding: "8px 10px", textAlign: "left" }}
                  title={ft.desc}>
            <Ic d={ft.icon} size={13} stroke={ft.color} />
            <span style={{ fontSize: 11.5 }}>{ft.label}</span>
          </button>
        ))}
      </div>

      {tpl.steps.length === 0 && (
        <Empty label="No steps yet" sub="Click a field type above to add the first step" />
      )}

      {tpl.steps.map((s, i) => {
        const meta = typeMeta(s.type);
        const isOpen = openStep === s.id;
        return (
          <div key={s.id} className="builder-item">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{
                width: 24, height: 24, borderRadius: 6, background: "var(--green3)",
                color: "#fff", fontSize: 11, fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                fontFamily: "var(--mono)"
              }}>{i + 1}</span>

              <span className="type-chip" style={{ background: meta.color + "1a", color: meta.color, border: "1px solid " + meta.color + "33" }}>
                {meta.label}
              </span>

              <input
                value={s.label}
                onChange={e => updStep(s.id, "label", e.target.value)}
                placeholder="Step label — what the engineer sees"
                style={{ flex: 1, minWidth: 120, padding: "6px 10px", fontSize: 13 }}
              />

              <button className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0}
                      style={{ padding: "4px 7px", opacity: i === 0 ? .3 : 1 }} title="Move up">▲</button>
              <button className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === tpl.steps.length - 1}
                      style={{ padding: "4px 7px", opacity: i === tpl.steps.length - 1 ? .3 : 1 }} title="Move down">▼</button>
              <button className="btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : s.id)}
                      style={{ padding: "4px 8px" }} title="Options">
                <Ic d={D.cog} size={12} />
              </button>
              <button className="btn-danger btn-sm"
                      onClick={() => setTpl(t => ({ ...t, steps: t.steps.filter(x => x.id !== s.id) }))}
                      style={{ padding: "4px 8px" }}>
                <Ic d={D.trash} size={12} />
              </button>
            </div>

            {s.description && !isOpen && (
              <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 7, paddingLeft: 33, lineHeight: 1.45 }}>
                {s.description.length > 130 ? s.description.slice(0, 130) + "…" : s.description}
              </div>
            )}

            {/* Always-visible settings that decide pass/fail automatically */}
            {(s.type === "number_range" || s.type === "number" || s.type === "select") && (
              <div style={{
                marginTop: 10, padding: "11px 12px", borderRadius: 7,
                background: s.type === "number_range" ? "var(--orange-lt)" : "var(--surface3)",
                border: "1px solid " + (s.type === "number_range" ? "#f5c6a0" : "var(--border)")
              }}>
                {s.type === "number_range" && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--orange)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 9 }}>
                      Acceptable limits — a reading outside this range marks the device Defective automatically
                    </div>
                    <div className="grid-3">
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Minimum *</label>
                        <input type="number" inputMode="decimal" value={s.min}
                               onChange={e => updStep(s.id, "min", e.target.value)}
                               placeholder="e.g. 210" style={{ fontFamily: "var(--mono)" }} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Maximum *</label>
                        <input type="number" inputMode="decimal" value={s.max}
                               onChange={e => updStep(s.id, "max", e.target.value)}
                               placeholder="e.g. 230" style={{ fontFamily: "var(--mono)" }} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Unit</label>
                        <input value={s.unit} onChange={e => updStep(s.id, "unit", e.target.value)} placeholder="e.g. V" />
                      </div>
                    </div>
                    {(s.min !== "" || s.max !== "") && (
                      <div style={{ fontSize: 11.5, color: "var(--text2)", marginTop: 8, fontFamily: "var(--mono)" }}>
                        Pass when value is between {s.min !== "" ? s.min : "−∞"} and {s.max !== "" ? s.max : "+∞"} {s.unit}
                      </div>
                    )}
                  </>
                )}

                {s.type === "number" && (
                  <div className="field" style={{ marginBottom: 0, maxWidth: 240 }}>
                    <label>Unit (optional)</label>
                    <input value={s.unit} onChange={e => updStep(s.id, "unit", e.target.value)} placeholder="e.g. mmHg" />
                    <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                      Plain number — not scored. Use “Number with Range” for automatic pass/fail.
                    </p>
                  </div>
                )}

                {s.type === "select" && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Options — one per line</label>
                    <textarea
                      value={(s.options || []).join("\n")}
                      onChange={e => updStep(s.id, "options", e.target.value.split("\n").filter(x => x.trim() !== ""))}
                      placeholder={"Good\nAcceptable\nPoor"}
                      style={{ minHeight: 84, fontSize: 13 }}
                    />
                    <label className="checkbox-custom" style={{ marginTop: 9 }}>
                      <input type="checkbox" checked={!!s.scored}
                             onChange={e => updStep(s.id, "scored", e.target.checked)} />
                      Score this step — mark which options count as a pass
                    </label>
                    {s.scored && (
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(s.options || []).map(opt => {
                          const on = (s.passOptions || []).includes(opt);
                          return (
                            <button key={opt} type="button"
                              onClick={() => updStep(s.id, "passOptions",
                                on ? (s.passOptions || []).filter(x => x !== opt) : [...(s.passOptions || []), opt])}
                              className={"badge " + (on ? "badge-green" : "badge-gray")}
                              style={{ cursor: "pointer", border: "1px solid " + (on ? "var(--green-mid)" : "var(--border)") }}>
                              {on ? "✓ " : ""}{opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {s.type === "date" && (
              <div style={{ marginTop: 10, padding: "11px 12px", borderRadius: 7, background: "var(--surface3)", border: "1px solid var(--border)" }}>
                <div className="field" style={{ marginBottom: 0, maxWidth: 260 }}>
                  <label>Date precision</label>
                  <select value={s.datePrecision || "month"} onChange={e => updStep(s.id, "datePrecision", e.target.value)}>
                    <option value="month">Month & Year only</option>
                    <option value="day">Full date (day, month, year)</option>
                  </select>
                </div>
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Description (optional)</label>
                  <textarea value={s.description || ""} onChange={e => updStep(s.id, "description", e.target.value)}
                            placeholder="Full explanation of what the engineer should do in this step"
                            style={{ minHeight: 70, fontSize: 13 }} />
                </div>
                <div className="grid-2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Help text (optional)</label>
                    <input value={s.help || ""} onChange={e => updStep(s.id, "help", e.target.value)}
                           placeholder="Guidance shown under the label" style={{ fontSize: 13 }} />
                  </div>
                  <div className="field" style={{ marginBottom: 0, display: "flex", alignItems: "flex-end" }}>
                    <label className="checkbox-custom" style={{ marginBottom: 8 }}>
                      <input type="checkbox" checked={s.required !== false}
                             onChange={e => updStep(s.id, "required", e.target.checked)} />
                      Required — engineer cannot skip this step
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {showImport && (
        <ChecklistImport
          existingCount={tpl.steps.length}
          onClose={() => setShowImport(false)}
          onImport={(steps, mode) => {
            setTpl(t => ({ ...t, steps: mode === "replace" ? steps : [...t.steps, ...steps] }));
            setShowImport(false);
            setErr("");
          }}
        />
      )}
    </Modal>
  );
}
