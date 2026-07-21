import React, { useState, useRef } from "react";
import { Ic, D, Modal, typeMeta, Empty } from "../lib/utils.jsx";
import { parseChecklistFile, downloadTemplate, COLUMNS } from "../lib/checklistIO.js";

/**
 * Import checklist steps from .xlsx / .csv with a preview before committing.
 *
 * onImport(steps, mode) — mode is "replace" or "append"
 */
export default function ChecklistImport({ existingCount, onImport, onClose }) {
  const [parsed, setParsed] = useState(null);   // { steps, errors, warnings }
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState(existingCount > 0 ? "append" : "replace");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const res = parseChecklistFile(new Uint8Array(buf), file.name);
      setParsed(res);
    } catch (e) {
      setParsed({ steps: [], errors: [{ row: 0, msg: "Could not read the file." }], warnings: [] });
    }
    setBusy(false);
  };

  const canImport = parsed && parsed.steps.length > 0 && parsed.errors.length === 0;

  return (
    <Modal title="Import Checklist from Excel" onClose={onClose} wide
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!canImport}
                style={{ opacity: canImport ? 1 : .45 }}
                onClick={() => canImport && onImport(parsed.steps, mode)}>
          <Ic d={D.check} size={13} stroke="#fff" />
          Import {parsed?.steps.length || 0} step{parsed?.steps.length === 1 ? "" : "s"}
        </button>
      </>}>

      {/* Template download */}
      <div style={{
        background: "var(--green-lt)", border: "1px solid var(--green-mid)",
        borderRadius: 9, padding: "13px 15px", marginBottom: 16
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>
          Need the correct format?
        </div>
        <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.5, marginBottom: 10 }}>
          Download a template with the exact column headers. The example file also includes a
          filled-in ventilator PPM checklist and a Reference sheet explaining every column.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-outline btn-sm" onClick={() => downloadTemplate(true)}>
            <Ic d={D.excel} size={12} stroke="var(--green)" /> Template with example
          </button>
          <button className="btn-ghost btn-sm" onClick={() => downloadTemplate(false)}>
            <Ic d={D.excel} size={12} /> Blank template
          </button>
        </div>
      </div>

      {/* Column reference */}
      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "var(--text2)", padding: "6px 0" }}>
          Column order reference
        </summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="parts-table" style={{ fontSize: 11.5 }}>
            <thead>
              <tr><th style={{ width: 34 }}>Col</th><th>Name</th><th>Required</th><th>Applies to</th></tr>
            </thead>
            <tbody>
              {[
                ["A", "label",         "Yes",         "All types"],
                ["B", "description",   "No",          "All types"],
                ["C", "type",          "Yes",         "All types"],
                ["D", "required",      "No",          "yes / no"],
                ["E", "help",          "No",          "All types"],
                ["F", "min",           "Conditional", "number_range"],
                ["G", "max",           "Conditional", "number_range"],
                ["H", "unit",          "No",          "number, number_range"],
                ["I", "options",       "Conditional", "select — separated by |"],
                ["J", "passOptions",   "No",          "select — separated by |"],
                ["K", "datePrecision", "No",          "date — month / day"],
              ].map(r => (
                <tr key={r[0]}>
                  <td style={{ padding: "5px 9px", fontFamily: "var(--mono)", fontWeight: 700, color: "var(--green)" }}>{r[0]}</td>
                  <td style={{ padding: "5px 9px", fontFamily: "var(--mono)" }}>{r[1]}</td>
                  <td style={{ padding: "5px 9px" }}>{r[2]}</td>
                  <td style={{ padding: "5px 9px", color: "var(--text3)" }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* File picker */}
      <div
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed " + (parsed ? "var(--border2)" : "var(--green-mid)"),
          borderRadius: 10, padding: "26px 20px", textAlign: "center",
          cursor: "pointer", background: "var(--surface2)", marginBottom: 16
        }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
               onChange={e => handleFile(e.target.files?.[0])} />
        <Ic d={D.excel} size={30} stroke="var(--green)" />
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10, color: "var(--text)" }}>
          {busy ? "Reading file…" : fileName || "Click to choose a file, or drag it here"}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>
          Accepts .xlsx, .xls and .csv
        </div>
      </div>

      {/* Errors */}
      {parsed?.errors.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="alert alert-error" style={{ alignItems: "flex-start" }}>
            <Ic d={D.warn} size={14} />
            <div>
              <strong>{parsed.errors.length} error{parsed.errors.length === 1 ? "" : "s"} — nothing will be imported until these are fixed:</strong>
              <ul style={{ margin: "7px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                {parsed.errors.slice(0, 12).map((e, i) => (
                  <li key={i} style={{ fontSize: 12.5 }}>
                    {e.row > 0 && <strong>Row {e.row}: </strong>}{e.msg}
                  </li>
                ))}
                {parsed.errors.length > 12 && (
                  <li style={{ fontSize: 12.5, opacity: .8 }}>…and {parsed.errors.length - 12} more</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {parsed?.warnings.length > 0 && (
        <div className="alert alert-warn" style={{ alignItems: "flex-start", marginBottom: 14 }}>
          <Ic d={D.warn} size={14} />
          <div>
            <strong>{parsed.warnings.length} warning{parsed.warnings.length === 1 ? "" : "s"} — import can still proceed:</strong>
            <ul style={{ margin: "7px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
              {parsed.warnings.slice(0, 6).map((w, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>
                  {w.row > 0 && <strong>Row {w.row}: </strong>}{w.msg}
                </li>
              ))}
              {parsed.warnings.length > 6 && (
                <li style={{ fontSize: 12.5, opacity: .8 }}>…and {parsed.warnings.length - 6} more</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Preview */}
      {parsed?.steps.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Preview — {parsed.steps.length} step{parsed.steps.length === 1 ? "" : "s"}
            </span>
            <span className="badge badge-green">
              {parsed.steps.filter(s => s.type === "pass_fail" || s.type === "pass_fail_na"
                                     || s.type === "number_range" || (s.type === "select" && s.scored)).length} auto-scored
            </span>
          </div>

          {existingCount > 0 && (
            <div style={{
              background: "var(--surface3)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "11px 13px", marginBottom: 12
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>
                This template already has {existingCount} step{existingCount === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <label className="checkbox-custom">
                  <input type="radio" name="mode" checked={mode === "append"}
                         onChange={() => setMode("append")} style={{ width: 15, height: 15, accentColor: "var(--green)" }} />
                  Add to the existing steps
                </label>
                <label className="checkbox-custom">
                  <input type="radio" name="mode" checked={mode === "replace"}
                         onChange={() => setMode("replace")} style={{ width: 15, height: 15, accentColor: "var(--red)" }} />
                  Replace all existing steps
                </label>
              </div>
            </div>
          )}

          <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {parsed.steps.map((s, i) => {
              const meta = typeMeta(s.type);
              const scored = s.type === "pass_fail" || s.type === "pass_fail_na"
                          || s.type === "number_range" || (s.type === "select" && s.scored);
              return (
                <div key={s.id} style={{
                  background: "var(--surface2)", border: "1px solid var(--border)",
                  borderRadius: 7, padding: "10px 12px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 5, background: "var(--green3)",
                      color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--mono)"
                    }}>{i + 1}</span>
                    <span className="type-chip" style={{
                      background: meta.color + "1a", color: meta.color,
                      border: "1px solid " + meta.color + "33"
                    }}>{meta.label}</span>
                    <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                    {s.required === false && <span className="badge badge-gray">optional</span>}
                    {scored && <span className="badge badge-green">scored</span>}
                  </div>

                  {s.description && (
                    <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 6, lineHeight: 1.5, paddingLeft: 31 }}>
                      {s.description.length > 150 ? s.description.slice(0, 150) + "…" : s.description}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7, paddingLeft: 31 }}>
                    {s.type === "number_range" && (
                      <span className="info-pill" style={{ fontFamily: "var(--mono)" }}>
                        {s.min !== "" ? s.min : "−∞"} – {s.max !== "" ? s.max : "+∞"} {s.unit}
                      </span>
                    )}
                    {s.type === "number" && s.unit && <span className="info-pill">{s.unit}</span>}
                    {s.type === "select" && s.options.map(o => (
                      <span key={o} className={"badge " + (s.passOptions.includes(o) ? "badge-green" : "badge-gray")}>
                        {s.passOptions.includes(o) ? "✓ " : ""}{o}
                      </span>
                    ))}
                    {s.type === "date" && (
                      <span className="info-pill">{s.datePrecision === "day" ? "Full date" : "Month & year"}</span>
                    )}
                    {s.help && <span className="info-pill">💡 {s.help}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {parsed && parsed.steps.length === 0 && parsed.errors.length === 0 && (
        <Empty label="No steps found in that file" />
      )}
    </Modal>
  );
}
