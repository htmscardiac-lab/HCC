import React, { useState } from "react";
import { Ic, D, Modal, SL } from "../lib/utils.jsx";
import { friendlyError } from "../lib/supabase.js";
import { MNGHA_LOGO, HTMS_LOGO } from "../lib/logos.js";
import * as V from "../lib/vault.js";
import * as api from "../lib/api.js";

/**
 * Shown after sign-in when patient data is encrypted and this tab does not
 * hold the key yet. Nothing loads until the team passphrase is entered.
 */
export function UnlockScreen({ config, session, onUnlocked, onLogout }) {
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (busy || !p) return;
    setErr(""); setBusy(true);
    try { await V.unlock(p, config); onUnlocked(); }
    catch (e) { setErr(e.message || "Could not unlock."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, width: "min(420px,100%)", boxShadow: "var(--shadow2)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 14 }}>
            <img src={MNGHA_LOGO} alt="MNGHA" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--green-mid)" }} />
            <img src={HTMS_LOGO} alt="HTMS" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", border: "2px solid var(--border2)" }} />
          </div>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", background: "var(--green-lt)", border: "2px solid var(--green-mid)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
          }}>
            <Ic d={D.key} size={21} stroke="var(--green)" />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--green3)", marginBottom: 6 }}>Unlock patient data</h1>
          <p style={{ fontSize: 12.5, color: "var(--text3)", lineHeight: 1.6 }}>
            Signed in as <strong>@{session.username}</strong>. Patient details are encrypted —
            enter the team passphrase to open them on this device.
          </p>
        </div>

        {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
        <div className="field">
          <label>Team passphrase</label>
          <input type="password" value={p} onChange={e => setP(e.target.value)} autoFocus
                 autoComplete="off" onKeyDown={e => e.key === "Enter" && go()} />
        </div>
        <button className="btn-primary btn-lg" onClick={go} disabled={busy}
                style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
          {busy ? "Checking…" : <>Unlock <Ic d={D.arrow} size={15} stroke="#fff" /></>}
        </button>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text3)", textAlign: "center", marginTop: 12, lineHeight: 1.55 }}>
          Don't know it? Ask an HTMS administrator in person.
        </p>
      </div>
    </div>
  );
}

/**
 * Admin: switch encryption on, or change the team passphrase.
 * Every HCC record is re-encrypted in one transaction.
 */
export function VaultModal({ status, onDone, onClose }) {
  const on = status === "ready";
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState("");

  const apply = async () => {
    setErr("");
    const weak = V.passphraseProblem(p1);
    if (weak) { setErr(weak); return; }
    if (p1 !== p2) { setErr("The two passphrases do not match."); return; }
    if (!ack) { setErr("Confirm that the passphrase is written down and stored safely."); return; }
    setBusy(true);
    try {
      const n = await api.applyVault(p1, setProgress);
      setDone(`${on ? "Passphrase changed" : "Encryption switched on"} — ${n} record${n === 1 ? "" : "s"} encrypted.`);
      setP1(""); setP2("");
      onDone?.();
    } catch (e) {
      setErr(friendlyError(e));
    } finally { setBusy(false); setProgress(""); }
  };

  if (status === "missing") {
    return (
      <Modal title="Patient-data encryption" onClose={onClose}
        footer={<button className="btn-primary" onClick={onClose}>OK</button>}>
        <div className="alert alert-warn"><Ic d={D.warn} size={14} />
          The database update is not installed yet. Run schema_security_fix.sql in Supabase → SQL Editor, then reopen this window.
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Patient-data encryption" onClose={busy ? () => {} : onClose} wide
      footer={done
        ? <button className="btn-primary" onClick={onClose}>Done</button>
        : <>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={apply} disabled={busy}>
              <Ic d={D.key} size={13} stroke="#fff" /> {busy ? "Working…" : on ? "Change passphrase" : "Switch on encryption"}
            </button>
          </>}>

      <div className="alert" style={{
        background: on ? "var(--green-lt)" : "var(--gold-lt)",
        border: "1px solid " + (on ? "var(--green-mid)" : "var(--gold-mid)"),
        color: on ? "var(--green)" : "#7A5B08", fontSize: 12.5,
      }}>
        <Ic d={on ? D.shield : D.warn} size={14} />
        {on
          ? "Encryption is ON — patient MRN, name and phone are stored encrypted."
          : "Encryption is OFF — patient MRN, name and phone are stored as plain text."}
      </div>

      {done ? (
        <div className="alert alert-success"><Ic d={D.check} size={14} />{done}</div>
      ) : (<>
        <SL>{on ? "Set a new team passphrase" : "Choose the team passphrase"}</SL>
        <ul style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.7, margin: "8px 0 14px", paddingLeft: 18 }}>
          <li>Everyone enters it once after signing in on a new tab or device.</li>
          <li>Use five or more random words joined by dashes, at least 16 characters.</li>
          <li><strong>If it is lost, encrypted patient details cannot be recovered by anyone.</strong> Keep two written copies in a safe place.</li>
          <li>Share it in person only — never by WhatsApp or email.</li>
          {on && <li>Do this when nobody is entering data; everyone will be asked for the new passphrase.</li>}
        </ul>

        {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
        <div className="grid-2">
          <div className="field"><label>{on ? "New passphrase" : "Passphrase"}</label>
            <input type="password" value={p1} onChange={e => setP1(e.target.value)} autoComplete="new-password" disabled={busy} /></div>
          <div className="field"><label>Repeat it</label>
            <input type="password" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" disabled={busy} /></div>
        </div>
        <label className="checkbox-custom" style={{ fontSize: 12.5 }}>
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} disabled={busy} />
          I have written the passphrase down and stored it safely
        </label>
        {progress && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text2)", fontWeight: 600 }}>{progress}</div>}
      </>)}
    </Modal>
  );
}
