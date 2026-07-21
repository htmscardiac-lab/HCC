import React, { useState, useRef, useEffect } from "react";
import { Ic, D, Modal, typeMeta, ts } from "../lib/utils.jsx";

/**
 * Runs a checklist template one step at a time.
 *
 * Props:
 *   template  — the template object with .steps
 *   context   — { title, subtitle } shown in the header
 *   onSubmit  — (answers, summary) => void
 *   onCancel  — () => void
 *
 * Produces answers as: { [stepId]: { value, pass, note } }
 */
export default function ChecklistRunner({ template, context, onSubmit, onCancel }) {
  const steps = template.steps || [];
  const [idx, setIdx]         = useState(0);
  const [answers, setAnswers] = useState({});
  const [err, setErr]         = useState("");
  const [review, setReview]   = useState(false);
  const inputRef = useRef(null);

  const step  = steps[idx];
  const total = steps.length;
  const pct   = review ? 100 : Math.round((idx / Math.max(total, 1)) * 100);

  useEffect(() => {
    setErr("");
    const t = setTimeout(() => { try { inputRef.current?.focus(); } catch (e) {} }, 80);
    return () => clearTimeout(t);
  }, [idx, review]);

  const setAns = (patch) => {
    setAnswers(a => ({ ...a, [step.id]: { ...(a[step.id] || {}), ...patch } }));
    setErr("");
  };

  const cur = answers[step?.id] || {};

  // ── Validation for the current step ────────────────────────────────
  const validate = () => {
    if (!step) return true;
    if (step.required === false) return true;
    const a = answers[step.id];
    switch (step.type) {
      case "pass_fail":
      case "pass_fail_na":
        if (!a || !a.value) { setErr("Select a result to continue."); return false; }
        return true;
      case "number":
      case "number_range":
        if (!a || a.value === "" || a.value === undefined) { setErr("Enter a value to continue."); return false; }
        if (isNaN(Number(a.value))) { setErr("Enter a valid number."); return false; }
        return true;
      case "select":
        if (!a || !a.value) { setErr("Choose an option to continue."); return false; }
        return true;
      case "date":
        if (!a || !a.value) { setErr("Pick a date to continue."); return false; }
        return true;
      default: // text_short, text_long
        if (!a || !String(a.value || "").trim()) { setErr("This field is required."); return false; }
        return true;
    }
  };

  const next = () => {
    if (!validate()) return;
    if (idx < total - 1) setIdx(idx + 1);
    else setReview(true);
  };
  const back = () => {
    if (review) { setReview(false); return; }
    if (idx > 0) setIdx(idx - 1);
  };

  // ── Compute pass/fail summary ──────────────────────────────────────
  const summarise = () => {
    let passed = 0, failed = 0, na = 0;
    steps.forEach(s => {
      const a = answers[s.id];
      if (!a) return;
      if (s.type === "pass_fail" || s.type === "pass_fail_na") {
        if (a.value === "pass") passed++;
        else if (a.value === "fail") failed++;
        else if (a.value === "na") na++;
      } else if (s.type === "number_range") {
        const v = Number(a.value);
        const lo = s.min === "" ? -Infinity : Number(s.min);
        const hi = s.max === "" ?  Infinity : Number(s.max);
        if (v >= lo && v <= hi) passed++; else failed++;
      } else if (s.type === "select" && s.scored) {
        if ((s.passOptions || []).includes(a.value)) passed++; else failed++;
      }
    });
    return { passed, failed, na, overall: failed > 0 ? "fail" : "pass" };
  };

  const finish = () => {
    const summary = summarise();
    onSubmit({
      templateId: template.id,
      templateName: template.name,
      deviceType: template.deviceType,
      model: template.model || "",
      answers,
      summary,
      completedAt: ts()
    });
  };

  if (total === 0) {
    return (
      <Modal title="Checklist" onClose={onCancel}
        footer={<button className="btn-ghost" onClick={onCancel}>Close</button>}>
        <div className="alert alert-warn">
          <Ic d={D.warn} size={14} />
          This template has no steps defined. Ask an administrator to add steps in the Checklist Builder.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={context?.title || template.name}
      onClose={onCancel}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={idx === 0 && !review ? onCancel : back}>
            {idx === 0 && !review
              ? "Cancel"
              : <><Ic d={D.arrowL} size={13} /> Back</>}
          </button>
          {review
            ? <button className="btn-primary btn-lg" onClick={finish}>
                <Ic d={D.check} size={15} stroke="#fff" /> Submit Checklist
              </button>
            : <button className="btn-primary" onClick={next}>
                {idx === total - 1 ? "Review" : "Next"} <Ic d={D.arrow} size={13} stroke="#fff" />
              </button>}
        </>
      }
    >
      {/* Progress */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>
            {review ? "Review & Submit" : `Step ${idx + 1} of ${total}`}
          </span>
          <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>{pct}%</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
        {context?.subtitle && (
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>{context.subtitle}</div>
        )}
      </div>

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      {review ? (
        <ReviewPane steps={steps} answers={answers} summary={summarise()} onJump={i => { setReview(false); setIdx(i); }} />
      ) : (
        <div className="step-card">
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>
              {step.label}
              {step.required !== false && <span style={{ color: "var(--red)", marginLeft: 4 }}>*</span>}
            </div>
            {step.description && (
              <div style={{
                fontSize: 13, color: "var(--text2)", marginTop: 9, lineHeight: 1.6,
                padding: "10px 13px", background: "var(--surface3)",
                border: "1px solid var(--border)", borderRadius: 7
              }}>{step.description}</div>
            )}
            {step.help && (
              <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 8, lineHeight: 1.5, fontStyle: "italic" }}>
                {step.help}
              </div>
            )}
          </div>
          <StepField step={step} value={cur} onChange={setAns} inputRef={inputRef} onEnterNext={next} />
        </div>
      )}
    </Modal>
  );
}

// ── One field, rendered by type ────────────────────────────────────────
function StepField({ step, value, onChange, inputRef, onEnterNext }) {
  const v = value.value;

  switch (step.type) {
    case "pass_fail":
    case "pass_fail_na": {
      const opts = step.type === "pass_fail"
        ? [["pass", "Pass", "pf-pass"], ["fail", "Fail", "pf-fail"]]
        : [["pass", "Pass", "pf-pass"], ["fail", "Fail", "pf-fail"], ["na", "N/A", "pf-na"]];
      return (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            {opts.map(([val, label, cls]) => (
              <button key={val}
                      className={`pf-btn ${cls} ${v === val ? "active" : ""}`}
                      onClick={() => onChange({ value: val })}>
                {val === "pass" && <Ic d={D.check} size={17} />}
                {val === "fail" && <Ic d={D.close} size={17} />}
                {label}
              </button>
            ))}
          </div>
          <NoteBox value={value.note} onChange={n => onChange({ note: n })} />
        </>
      );
    }

    case "number":
      return (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={v ?? ""}
              onChange={e => onChange({ value: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnterNext(); } }}
              placeholder="Enter value"
              style={{ fontSize: 22, fontFamily: "var(--mono)", textAlign: "center", padding: "14px" }}
            />
            {step.unit && (
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text3)", flexShrink: 0, minWidth: 40 }}>
                {step.unit}
              </span>
            )}
          </div>
          <NoteBox value={value.note} onChange={n => onChange({ note: n })} />
        </>
      );

    case "number_range": {
      const num = Number(v);
      const lo  = step.min === "" ? -Infinity : Number(step.min);
      const hi  = step.max === "" ?  Infinity : Number(step.max);
      const has = v !== "" && v !== undefined && !isNaN(num);
      const ok  = has && num >= lo && num <= hi;
      return (
        <>
          <div style={{
            background: "var(--surface3)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 12,
            fontSize: 12.5, color: "var(--text2)", fontWeight: 600
          }}>
            Acceptable range: <span style={{ fontFamily: "var(--mono)" }}>
              {step.min !== "" ? step.min : "−∞"} – {step.max !== "" ? step.max : "+∞"} {step.unit}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              value={v ?? ""}
              onChange={e => onChange({ value: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnterNext(); } }}
              placeholder="Measured value"
              style={{
                fontSize: 22, fontFamily: "var(--mono)", textAlign: "center", padding: "14px",
                borderColor: has ? (ok ? "var(--green)" : "var(--red)") : undefined,
                background:  has ? (ok ? "var(--green-lt)" : "var(--red-lt)") : undefined
              }}
            />
            {step.unit && (
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text3)", flexShrink: 0, minWidth: 40 }}>
                {step.unit}
              </span>
            )}
          </div>
          {has && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <span className={"badge " + (ok ? "badge-green" : "badge-red")} style={{ fontSize: 12, padding: "4px 14px" }}>
                {ok ? "✓ Within range" : "✗ Out of range"}
              </span>
            </div>
          )}
          <NoteBox value={value.note} onChange={n => onChange({ note: n })} />
        </>
      );
    }

    case "select":
      return (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(step.options || []).map(opt => (
              <button key={opt}
                      onClick={() => onChange({ value: opt })}
                      style={{
                        padding: "13px 16px", borderRadius: 8, textAlign: "left",
                        border: "2px solid " + (v === opt ? "var(--green)" : "var(--border)"),
                        background: v === opt ? "var(--green-lt)" : "var(--surface)",
                        color: v === opt ? "var(--green)" : "var(--text)",
                        fontSize: 14, fontWeight: v === opt ? 700 : 500,
                        justifyContent: "flex-start"
                      }}>
                {v === opt && <Ic d={D.check} size={15} stroke="var(--green)" />}
                {opt}
              </button>
            ))}
          </div>
          <NoteBox value={value.note} onChange={n => onChange({ note: n })} />
        </>
      );

    case "date": {
      const monthOnly = (step.datePrecision || "month") === "month";
      return (
        <>
          <input ref={inputRef} type={monthOnly ? "month" : "date"} value={v ?? ""}
                 onChange={e => onChange({ value: e.target.value })}
                 style={{ fontSize: 16, padding: "13px" }} />
          <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 6 }}>
            {monthOnly ? "Month and year only" : "Full date"}
          </p>
          <NoteBox value={value.note} onChange={n => onChange({ note: n })} />
        </>
      );
    }

    case "text_long":
      return (
        <textarea ref={inputRef} value={v ?? ""}
                  onChange={e => onChange({ value: e.target.value })}
                  placeholder="Enter details…"
                  style={{ minHeight: 150, fontSize: 14 }} />
      );

    default: // text_short
      return (
        <input ref={inputRef} value={v ?? ""}
               onChange={e => onChange({ value: e.target.value })}
               onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnterNext(); } }}
               placeholder="Enter value"
               style={{ fontSize: 16, padding: "13px" }} />
      );
  }
}

function NoteBox({ value, onChange }) {
  const [open, setOpen] = useState(!!value);
  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}
              style={{ marginTop: 14 }}>
        <Ic d={D.plus} size={12} /> Add note
      </button>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <label>Note (optional)</label>
      <textarea value={value || ""} onChange={e => onChange(e.target.value)}
                placeholder="Observation, remark, or deviation…"
                style={{ minHeight: 70, fontSize: 13 }} />
    </div>
  );
}

// ── Review pane ────────────────────────────────────────────────────────
function ReviewPane({ steps, answers, summary, onJump }) {
  const label = (s, a) => {
    if (!a || a.value === "" || a.value === undefined) return "—";
    if (s.type === "pass_fail" || s.type === "pass_fail_na") {
      return a.value === "pass" ? "Pass" : a.value === "fail" ? "Fail" : "N/A";
    }
    if (s.type === "number" || s.type === "number_range") {
      return String(a.value) + (s.unit ? " " + s.unit : "");
    }
    if (s.type === "date" && (s.datePrecision || "month") === "month" && a.value) {
      const [y, m] = String(a.value).split("-");
      const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return m ? `${names[Number(m) - 1]} ${y}` : String(a.value);
    }
    return String(a.value);
  };

  const rowColor = (s, a) => {
    if (!a) return null;
    if (s.type === "pass_fail" || s.type === "pass_fail_na") {
      if (a.value === "pass") return "badge-green";
      if (a.value === "fail") return "badge-red";
      if (a.value === "na")   return "badge-gray";
    }
    if (s.type === "number_range") {
      const v = Number(a.value);
      const lo = s.min === "" ? -Infinity : Number(s.min);
      const hi = s.max === "" ?  Infinity : Number(s.max);
      if (!isNaN(v)) return (v >= lo && v <= hi) ? "badge-green" : "badge-red";
    }
    if (s.type === "select" && s.scored) {
      return (s.passOptions || []).includes(a.value) ? "badge-green" : "badge-red";
    }
    return null;
  };

  return (
    <>
      {/* Summary banner */}
      <div style={{
        background: summary.overall === "pass" ? "var(--green-lt)" : "var(--red-lt)",
        border: "1px solid " + (summary.overall === "pass" ? "var(--green-mid)" : "#f0c0bb"),
        borderRadius: 10, padding: "14px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap"
      }}>
        <Ic d={summary.overall === "pass" ? D.check : D.warn} size={24}
            stroke={summary.overall === "pass" ? "var(--green)" : "var(--red)"} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: summary.overall === "pass" ? "var(--green)" : "var(--red)" }}>
            {summary.overall === "pass" ? "All checks passed" : "Some checks failed"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Review the answers below, then submit.
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <span className="badge badge-green">{summary.passed} pass</span>
          {summary.failed > 0 && <span className="badge badge-red">{summary.failed} fail</span>}
          {summary.na > 0 && <span className="badge badge-gray">{summary.na} N/A</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => {
          const a  = answers[s.id];
          const bc = rowColor(s, a);
          return (
            <div key={s.id} style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 7, padding: "10px 13px", display: "flex",
              alignItems: "center", gap: 11, flexWrap: "wrap"
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 5, background: "var(--surface3)",
                color: "var(--text3)", fontSize: 10.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontFamily: "var(--mono)"
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                {a?.note && (
                  <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 3, fontStyle: "italic" }}>
                    “{a.note}”
                  </div>
                )}
              </div>
              {bc
                ? <span className={"badge " + bc}>{label(s, a)}</span>
                : <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", fontFamily: s.type.startsWith("number") ? "var(--mono)" : undefined }}>
                    {label(s, a)}
                  </span>}
              <button className="btn-ghost btn-sm" onClick={() => onJump(i)} style={{ padding: "3px 8px" }}>
                <Ic d={D.pencil} size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
