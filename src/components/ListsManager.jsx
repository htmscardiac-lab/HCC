import React, { useState } from "react";
import { Ic, D, Modal, Empty, SL } from "../lib/utils.jsx";

/**
 * Central admin screen for every editable dropdown in the platform.
 *
 *  · Device Types — kept SEPARATELY per module (HCC / PPM / CM)
 *  · Models       — keyed by "MODULE::Device Type", used by PPM and CM
 *  · CM Actions   — the "Action Taken" list in Corrective Maintenance
 *
 * deviceTypes is { HCC: [...], PPM: [...], CM: [...] }
 * models      is { "PPM::Ventilator": ["Servo-i", ...], ... }
 */

export const modelKey = (module, type) => `${module}::${type}`;

const MODULES = [
  { id: "HCC", label: "HCC", full: "Home Care Control",      color: "var(--green)",  tint: "var(--green-lt)" },
  { id: "PPM", label: "PPM", full: "Preventive Maintenance", color: "var(--blue)",   tint: "var(--blue-lt)" },
  { id: "CM",  label: "CM",  full: "Corrective Maintenance", color: "var(--orange)", tint: "var(--orange-lt)" },
];

export default function ListsManager({
  deviceTypes, setDeviceTypes,
  models, setModels,
  cmActions, setCmActions,
  onClose
}) {
  const [tab, setTab] = useState("types");

  return (
    <Modal title="Dropdown Lists" onClose={onClose} wide
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

      <div className="tab-bar" style={{ marginBottom: 18 }}>
        {[
          { k: "types",   l: "Device Types", icon: D.chip },
          { k: "models",  l: "Models",       icon: D.grid },
          { k: "actions", l: "CM Actions",   icon: D.wrench },
        ].map(t => (
          <button key={t.k} className={"tab-btn" + (tab === t.k ? " active" : "")} onClick={() => setTab(t.k)}>
            <Ic d={t.icon} size={13} /> {t.l}
          </button>
        ))}
      </div>

      {tab === "types"   && <TypesPanel   deviceTypes={deviceTypes} setDeviceTypes={setDeviceTypes} models={models} setModels={setModels} />}
      {tab === "models"  && <ModelsPanel  deviceTypes={deviceTypes} models={models} setModels={setModels} />}
      {tab === "actions" && <ActionsPanel actions={cmActions} setActions={setCmActions} />}
    </Modal>
  );
}

// ── Module selector strip ──────────────────────────────────────────────
function ModulePicker({ value, onChange, counts }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {MODULES.map(m => {
        const on = value === m.id;
        return (
          <button key={m.id} onClick={() => onChange(m.id)}
            style={{
              flex: "1 1 150px", padding: "10px 13px", borderRadius: 9, textAlign: "left",
              border: "2px solid " + (on ? m.color : "var(--border)"),
              background: on ? m.tint : "var(--surface)",
              display: "block", cursor: "pointer"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
              <span style={{
                fontFamily: "var(--mono)", fontSize: 12, fontWeight: 800,
                color: on ? m.color : "var(--text3)", letterSpacing: ".06em"
              }}>{m.label}</span>
              {counts && (
                <span className="badge" style={{
                  background: on ? "#fff" : "var(--surface3)",
                  color: on ? m.color : "var(--text3)",
                  border: "1px solid " + (on ? m.color + "44" : "var(--border)"),
                  fontSize: 10
                }}>{counts[m.id] ?? 0}</span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: on ? "var(--text2)" : "var(--text3)", fontWeight: 500 }}>
              {m.full}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Device types, per module ───────────────────────────────────────────
function TypesPanel({ deviceTypes, setDeviceTypes, models, setModels }) {
  const [mod, setMod] = useState("HCC");
  const [nw, setNw]   = useState("");
  const [err, setErr] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);

  const list = deviceTypes[mod] || [];
  const counts = {
    HCC: (deviceTypes.HCC || []).length,
    PPM: (deviceTypes.PPM || []).length,
    CM:  (deviceTypes.CM  || []).length
  };

  const add = () => {
    const v = nw.trim();
    setErr("");
    if (!v) return;
    if (list.some(t => t.toLowerCase() === v.toLowerCase())) {
      setErr(`"${v}" already exists in ${mod}.`); return;
    }
    setDeviceTypes(d => ({ ...d, [mod]: [...(d[mod] || []), v] }));
    setNw("");
  };

  const rename = (oldName, newName) => {
    const v = newName.trim();
    if (!v || v === oldName) return;
    setDeviceTypes(d => ({ ...d, [mod]: (d[mod] || []).map(t => t === oldName ? v : t) }));
    setModels(m => {
      const next = { ...m };
      const oldK = modelKey(mod, oldName), newK = modelKey(mod, v);
      if (next[oldK]) { next[newK] = next[oldK]; delete next[oldK]; }
      return next;
    });
  };

  const remove = (name) => {
    const k = modelKey(mod, name);
    const n = (models[k] || []).length;
    const msg = n > 0
      ? `Delete "${name}" from ${mod} and its ${n} model${n === 1 ? "" : "s"}?`
      : `Delete "${name}" from ${mod}?`;
    if (!window.confirm(msg)) return;
    setDeviceTypes(d => ({ ...d, [mod]: (d[mod] || []).filter(t => t !== name) }));
    setModels(m => { const next = { ...m }; delete next[k]; return next; });
  };

  return (
    <>
      <SL>Each module keeps its own device type list</SL>
      <div style={{ fontSize: 12, color: "var(--text3)", margin: "6px 0 14px", lineHeight: 1.5 }}>
        A type added here appears only in the selected module. The same name can exist in more
        than one module with completely different models and checklists.
      </div>

      <ModulePicker value={mod} onChange={m => { setMod(m); setErr(""); }} counts={counts} />

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={nw} onChange={e => setNw(e.target.value)}
               placeholder={`New device type for ${mod}…`}
               style={{ minWidth: 180 }}
               onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={add}>
          <Ic d={D.plus} size={13} stroke="#fff" /> Add
        </button>
        <button className="btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => setCopyOpen(true)}
                title="Copy types from another module">
          <Ic d={D.copy} size={13} /> Copy from…
        </button>
      </div>

      {list.length === 0 && <Empty label={`No device types in ${mod}`} sub="Add one above, or copy from another module" />}

      {list.map(t => {
        const n = (models[modelKey(mod, t)] || []).length;
        return (
          <EditableRow key={t} value={t}
            meta={mod === "HCC" ? null : `${n} model${n === 1 ? "" : "s"}`}
            onRename={v => rename(t, v)} onDelete={() => remove(t)} />
        );
      })}

      {copyOpen && (
        <CopyTypesModal
          target={mod}
          deviceTypes={deviceTypes}
          onClose={() => setCopyOpen(false)}
          onCopy={(picked) => {
            setDeviceTypes(d => {
              const cur = d[mod] || [];
              const lower = cur.map(x => x.toLowerCase());
              const toAdd = picked.filter(p => !lower.includes(p.toLowerCase()));
              return { ...d, [mod]: [...cur, ...toAdd] };
            });
            setCopyOpen(false);
          }}
        />
      )}
    </>
  );
}

function CopyTypesModal({ target, deviceTypes, onClose, onCopy }) {
  const sources = MODULES.filter(m => m.id !== target);
  const [from, setFrom]     = useState(sources[0].id);
  const [picked, setPicked] = useState([]);

  const srcList  = deviceTypes[from] || [];
  const existing = (deviceTypes[target] || []).map(x => x.toLowerCase());
  const available = srcList.filter(t => !existing.includes(t.toLowerCase()));

  const toggle = (t) => setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  return (
    <Modal title={`Copy device types into ${target}`} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={picked.length === 0}
                style={{ opacity: picked.length ? 1 : .45 }}
                onClick={() => onCopy(picked)}>
          Copy {picked.length} type{picked.length === 1 ? "" : "s"}
        </button>
      </>}>

      <div className="field">
        <label>Copy from</label>
        <select value={from} onChange={e => { setFrom(e.target.value); setPicked([]); }}>
          {sources.map(m => <option key={m.id} value={m.id}>{m.id} — {m.full}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 9px" }}>
        <SL>Select types</SL>
        {available.length > 0 && (
          <button className="btn-ghost btn-sm"
                  onClick={() => setPicked(picked.length === available.length ? [] : [...available])}>
            {picked.length === available.length ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {srcList.length === 0 && <Empty label={`${from} has no device types`} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {srcList.map(t => {
          const dup = existing.includes(t.toLowerCase());
          const on  = picked.includes(t);
          return (
            <label key={t} className="checkbox-custom" style={{
              background: on ? "var(--green-lt)" : "var(--surface2)",
              border: "1px solid " + (on ? "var(--green-mid)" : "var(--border)"),
              borderRadius: 7, padding: "9px 12px", opacity: dup ? .5 : 1
            }}>
              <input type="checkbox" checked={on} disabled={dup} onChange={() => toggle(t)} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t}</span>
              {dup && <span className="badge badge-gray">already in {target}</span>}
            </label>
          );
        })}
      </div>

      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 12, lineHeight: 1.5 }}>
        Only the type names are copied. Models and checklists stay with their original module.
      </p>
    </Modal>
  );
}

// ── Models, keyed by module + type ─────────────────────────────────────
function ModelsPanel({ deviceTypes, models, setModels }) {
  const [mod, setMod] = useState("PPM");
  const [sel, setSel] = useState("");
  const [nw, setNw]   = useState("");
  const [err, setErr] = useState("");

  const types = deviceTypes[mod] || [];
  const key   = sel ? modelKey(mod, sel) : "";
  const list  = key ? (models[key] || []) : [];

  const counts = MODULES.reduce((acc, m) => {
    acc[m.id] = (deviceTypes[m.id] || []).reduce((n, t) => n + (models[modelKey(m.id, t)] || []).length, 0);
    return acc;
  }, {});

  const add = () => {
    const v = nw.trim();
    setErr("");
    if (!v || !key) return;
    if (list.some(m => m.toLowerCase() === v.toLowerCase())) {
      setErr("That model already exists for this type."); return;
    }
    setModels(m => ({ ...m, [key]: [...(m[key] || []), v] }));
    setNw("");
  };

  return (
    <>
      <SL>PPM checklists are bound to a specific model</SL>
      <div style={{ fontSize: 12, color: "var(--text3)", margin: "6px 0 14px", lineHeight: 1.5 }}>
        Models belong to a device type inside one module. HCC does not use this list —
        model and manufacturer are typed manually there.
      </div>

      <ModulePicker value={mod} onChange={m => { setMod(m); setSel(""); setErr(""); }} counts={counts} />

      {mod === "HCC" && (
        <div className="alert alert-warn"><Ic d={D.warn} size={14} />
          HCC does not use a model list — engineers type the model and manufacturer manually on the Incoming form.
        </div>
      )}

      <div className="field" style={{ marginBottom: 14, maxWidth: 360 }}>
        <label>Device Type in {mod}</label>
        <select value={sel} onChange={e => { setSel(e.target.value); setErr(""); }}>
          <option value="">Select a device type…</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {types.length === 0 && <Empty label={`${mod} has no device types`} sub="Add them in the Device Types tab first" />}
      {types.length > 0 && !sel && <Empty label="Select a device type" sub="Then add the models that belong to it" />}

      {sel && (
        <>
          {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input value={nw} onChange={e => setNw(e.target.value)}
                   placeholder={`New model for ${sel}…`}
                   style={{ fontFamily: "var(--mono)" }}
                   onKeyDown={e => e.key === "Enter" && add()} />
            <button className="btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={add}>
              <Ic d={D.plus} size={13} stroke="#fff" /> Add
            </button>
          </div>

          {list.length === 0 && <Empty label={`No models for ${sel}`} sub="Add one above" />}

          {list.map(m => (
            <EditableRow key={m} value={m} mono
              onRename={v => setModels(all => ({ ...all, [key]: (all[key] || []).map(x => x === m ? v.trim() : x) }))}
              onDelete={() => { if (window.confirm(`Delete model "${m}"?`)) setModels(all => ({ ...all, [key]: (all[key] || []).filter(x => x !== m) })); }} />
          ))}
        </>
      )}
    </>
  );
}

// ── CM action list ─────────────────────────────────────────────────────
function ActionsPanel({ actions, setActions }) {
  const [nw, setNw]   = useState("");
  const [err, setErr] = useState("");

  const add = () => {
    const v = nw.trim();
    setErr("");
    if (!v) return;
    if (actions.some(a => a.toLowerCase() === v.toLowerCase())) { setErr("That action already exists."); return; }
    setActions(a => [...a, v]);
    setNw("");
  };

  return (
    <>
      <SL>The “Action Taken” dropdown in Corrective Maintenance</SL>
      {err && <div className="alert alert-error" style={{ marginTop: 10 }}><Ic d={D.close} size={13} />{err}</div>}

      <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
        <input value={nw} onChange={e => setNw(e.target.value)}
               placeholder="New action…"
               onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={add}>
          <Ic d={D.plus} size={13} stroke="#fff" /> Add
        </button>
      </div>

      {actions.length === 0 && <Empty label="No actions yet" />}

      {actions.map(a => (
        <EditableRow key={a} value={a}
          onRename={v => setActions(list => list.map(x => x === a ? v.trim() : x))}
          onDelete={() => { if (window.confirm(`Delete action "${a}"?`)) setActions(list => list.filter(x => x !== a)); }} />
      ))}
    </>
  );
}

// ── Shared editable row ────────────────────────────────────────────────
function EditableRow({ value, meta, mono, onRename, onDelete }) {
  const [edit, setEdit] = useState(false);
  const [v, setV]       = useState(value);

  if (edit) {
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "center" }}>
        <input value={v} onChange={e => setV(e.target.value)} autoFocus
               style={mono ? { fontFamily: "var(--mono)" } : undefined}
               onKeyDown={e => {
                 if (e.key === "Enter")  { onRename(v); setEdit(false); }
                 if (e.key === "Escape") { setV(value); setEdit(false); }
               }} />
        <button className="btn-primary btn-sm" style={{ flexShrink: 0 }}
                onClick={() => { onRename(v); setEdit(false); }}>
          <Ic d={D.check} size={12} stroke="#fff" />
        </button>
        <button className="btn-ghost btn-sm" style={{ flexShrink: 0 }}
                onClick={() => { setV(value); setEdit(false); }}>
          <Ic d={D.close} size={12} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7,
      padding: "9px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10
    }}>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, fontFamily: mono ? "var(--mono)" : undefined }}>
        {value}
      </span>
      {meta && <span className="badge badge-gray">{meta}</span>}
      <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>
        <Ic d={D.pencil} size={12} /> Rename
      </button>
      <button className="btn-danger btn-sm" onClick={onDelete}>
        <Ic d={D.trash} size={12} />
      </button>
    </div>
  );
}
