import React, { useState } from "react";
import { Ic, D, Modal, fmt, Empty, SL } from "../lib/utils.jsx";
import { friendlyError } from "../lib/supabase.js";
import * as api from "../lib/api.js";

/**
 * Account request flow.
 *
 *  · SignupModal   — shown from the login screen; creates a pending request
 *  · RequestsPanel — admin screen inside User Management; approve or reject
 *
 * The screens are unchanged; the data now lives in Supabase. A request row
 * carries the same fields it always did:
 *   { id, name, username, reason, status, requestedAt,
 *     decidedAt, decidedBy, grantedRole, rejectReason }
 */

export function SignupModal({ onClose, onActivated }) {
  const [f, setF]     = useState({ name: "", username: "", password: "", confirm: "", reason: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim())      { setErr("Full name is required."); return; }
    if (!f.username.trim())  { setErr("Username is required."); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(f.username.trim()))
      { setErr("Username may contain letters, numbers, dot, dash and underscore only."); return; }
    if (!f.password)         { setErr("Password is required."); return; }
    if (f.password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (f.password !== f.confirm) { setErr("The two passwords do not match."); return; }

    setBusy(true);
    try {
      const res = await api.requestAccount(f);
      // The first account in an empty system is an active admin straight away
      if (res.active && res.session) { onActivated?.(res.session); return; }
      setDone(true);
    } catch (e) {
      setErr(friendlyError(e));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="Request Submitted" onClose={onClose}
        footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
        <div style={{ textAlign: "center", padding: "18px 10px" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "var(--green-lt)",
            border: "2px solid var(--green-mid)", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 16px"
          }}>
            <Ic d={D.check} size={28} stroke="var(--green)" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--green3)", marginBottom: 8 }}>
            Your request has been sent
          </div>
          <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
            An administrator will review it. You will be able to sign in with
            <strong style={{ fontFamily: "var(--mono)" }}> @{f.username.trim()} </strong>
            once the request is approved.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Request an Account" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>
          <Ic d={D.arrow} size={13} stroke="#fff" /> Send Request
        </button>
      </>}>

      <p style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 16, lineHeight: 1.55 }}>
        Fill in your details below. The request goes to an HTMS administrator for approval —
        you will not be able to sign in until it is approved.
      </p>

      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

      <div className="field">
        <label>Full Name *</label>
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })}
               placeholder="Your full name" autoFocus />
      </div>
      <div className="field">
        <label>Username *</label>
        <input value={f.username} onChange={e => setF({ ...f, username: e.target.value })}
               placeholder="Choose a username" style={{ fontFamily: "var(--mono)" }} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Password *</label>
          <input type="password" value={f.password}
                 onChange={e => setF({ ...f, password: e.target.value })}
                 placeholder="At least 6 characters" />
        </div>
        <div className="field">
          <label>Confirm Password *</label>
          <input type="password" value={f.confirm}
                 onChange={e => setF({ ...f, confirm: e.target.value })}
                 placeholder="Repeat password"
                 onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Reason / Department <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text3)" }}>(optional)</span></label>
        <textarea value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}
                  placeholder="e.g. Biomedical technician, HTMS workshop"
                  style={{ minHeight: 70, fontSize: 13 }} />
      </div>
    </Modal>
  );
}

// ── Admin panel ────────────────────────────────────────────────────────
export function RequestsPanel({ requests, users, session, reload, onError }) {
  const [reject, setReject] = useState(null);
  const [why, setWhy]       = useState("");

  const pending  = requests.filter(r => r.status === "pending");
  const decided  = requests.filter(r => r.status !== "pending");

  const run = async (fn) => {
    try { await fn(); await reload(); } catch (e) { onError(e); }
  };

  const approve = (req, role) => {
    const account = users.find(u => u.username.toLowerCase() === req.username.toLowerCase());
    if (account && account.isActive) {
      window.alert("A user with that username is already active. Reject this request instead.");
      return;
    }
    run(() => api.decideRequest(req, "approved", { role, actorId: session.id }));
  };

  const doReject = () =>
    run(async () => {
      await api.decideRequest(reject, "rejected", { rejectReason: why.trim(), actorId: session.id });
      setReject(null); setWhy("");
    });

  return (
    <>
      <SL>Pending requests ({pending.length})</SL>

      {pending.length === 0 && (
        <div style={{ marginTop: 10 }}>
          <Empty label="No pending requests" sub="New account requests will appear here" />
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {pending.map(r => (
          <div key={r.id} style={{
            background: "var(--gold-lt)", border: "1px solid var(--gold-mid)",
            borderRadius: 9, padding: "13px 15px", marginBottom: 9
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: "#fff",
                border: "1px solid var(--gold-mid)", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                <Ic d={D.user} size={16} stroke="var(--gold)" />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>@{r.username}</div>
              </div>
              <span className="info-pill">📅 {fmt(r.requestedAt)}</span>
            </div>

            {r.reason && (
              <div style={{
                marginTop: 10, padding: "8px 11px", background: "#fff",
                border: "1px solid var(--gold-mid)", borderRadius: 6,
                fontSize: 12.5, color: "var(--text2)", lineHeight: 1.5
              }}>
                {r.reason}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn-primary btn-sm" onClick={() => approve(r, "user")}>
                <Ic d={D.check} size={12} stroke="#fff" /> Approve as User
              </button>
              <button className="btn-gold btn-sm" onClick={() => approve(r, "admin")}>
                <Ic d={D.shield} size={12} stroke="#fff" /> Approve as Admin
              </button>
              <button className="btn-danger btn-sm" onClick={() => { setReject(r); setWhy(""); }}>
                <Ic d={D.close} size={12} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <div style={{ marginTop: 22 }}><SL>Decision history</SL></div>
          <div style={{ marginTop: 10 }}>
            {decided.map(r => (
              <div key={r.id} style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "9px 12px", marginBottom: 6,
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
              }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)", fontFamily: "var(--mono)" }}>@{r.username}</div>
                </div>
                <span className={"badge " + (r.status === "approved" ? "badge-green" : "badge-red")}>
                  {r.status === "approved" ? `Approved · ${r.grantedRole}` : "Rejected"}
                </span>
                <span className="info-pill">{fmt(r.decidedAt)} · {r.decidedBy}</span>
                <button className="btn-ghost btn-sm"
                        onClick={() => run(() => api.deleteRequest(r.id))}
                        title="Remove from history">
                  <Ic d={D.trash} size={11} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {reject && (
        <Modal title={`Reject request — ${reject.name}`} onClose={() => setReject(null)}
          footer={<>
            <button className="btn-ghost" onClick={() => setReject(null)}>Cancel</button>
            <button className="btn-danger" onClick={doReject}>Reject Request</button>
          </>}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Reason <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text3)" }}>(optional)</span></label>
            <textarea value={why} onChange={e => setWhy(e.target.value)} autoFocus
                      placeholder="Recorded in the decision history"
                      style={{ minHeight: 80, fontSize: 13 }} />
          </div>
        </Modal>
      )}
    </>
  );
}
