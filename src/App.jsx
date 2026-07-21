import React, { useState, useEffect, useCallback, useRef } from "react";
import { STYLE } from "./lib/theme.js";
import { MNGHA_LOGO, HTMS_LOGO } from "./lib/logos.js";
import { Ic, D, uid, Modal, SL } from "./lib/utils.jsx";
import { friendlyError } from "./lib/supabase.js";
import { useSynced } from "./lib/useSynced.js";
import * as api from "./lib/api.js";
import Launcher from "./components/Launcher.jsx";
import ChecklistBuilder from "./components/ChecklistBuilder.jsx";
import ListsManager from "./components/ListsManager.jsx";
import { SignupModal, RequestsPanel } from "./components/SignupRequest.jsx";
import HCC from "./modules/HCC.jsx";
import PPM from "./modules/PPM.jsx";
import CM  from "./modules/CM.jsx";

const VERSION = "2.0.0";

const MODULE_META = {
  HCC: { name: "Home Care Control",       color: "#1a6b3c", icon: D.home },
  PPM: { name: "Preventive Maintenance",  color: "#1a4f8a", icon: D.cog },
  CM:  { name: "Corrective Maintenance",  color: "#d35400", icon: D.wrench },
};

// Global fix: restore input focus when Electron loses it
if (typeof window !== "undefined") {
  window.addEventListener("mousedown", (e) => {
    const el = e.target;
    if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) {
      setTimeout(() => { try { el.focus(); } catch (err) {} }, 10);
    }
  }, true);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [error,   setError]   = useState("");

  const onError = useCallback((err) => {
    console.error(err);
    setError(friendlyError(err));
  }, []);

  // Shared data — the setters keep the same signature the screens already use,
  // but every change is diffed and pushed to Supabase instead of localStorage.
  const [users,     setUsersState] = useState([]);
  const [requests,  setRequests]   = useState([]);
  const [records,   setRecords,   resetRecords]   = useSynced([], api.syncRecords,   onError);
  const [templates, setTemplates, resetTemplates] = useSynced([], api.syncTemplates, onError);
  const [dtypes,    setDtypes,    resetDtypes]    = useSynced({ HCC: [], PPM: [], CM: [] }, api.syncDeviceTypes, onError);
  const [models,    setModels,    resetModels]    = useSynced({}, api.syncModels,    onError);
  const [cmActions, setCmActions, resetActions]   = useSynced([], api.syncCmActions, onError);

  const [module,    setModule]    = useState(null);
  const [showUsers,   setShowUsers]   = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showLists,   setShowLists]   = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const reload = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      setUsersState(await api.loadUsers());
      const [lists, tpls, recs, reqs] = await Promise.all([
        api.loadLists(), api.loadTemplates(), api.loadRecords(), api.loadRequests(),
      ]);
      resetDtypes(lists.dtypes);
      resetModels(lists.models);
      resetActions(lists.cmActions);
      resetTemplates(tpls);
      resetRecords(recs);
      setRequests(reqs);
      setError("");
    } catch (err) { onError(err); }
  }, [onError, resetDtypes, resetModels, resetActions, resetTemplates, resetRecords]);

  // Restore an existing sign-in on start-up
  useEffect(() => {
    (async () => {
      try {
        const s = await api.restoreSession();
        if (s) setSession(s);
      } catch (err) { console.error(err); }
      setBooting(false);
    })();
  }, []);

  // Load once signed in, then stay live
  useEffect(() => {
    if (!session) return;
    let stop = () => {};
    (async () => { await reload(); stop = api.subscribeAll(reload); })();
    return () => stop();
  }, [session, reload]);

  const logout = async () => {
    try { await api.signOut(); } catch {}
    setSession(null); setModule(null);
    resetRecords([]); resetTemplates([]); setUsersState([]); setRequests([]);
  };

  // ── Render ───────────────────────────────────────────────────────────
  if (booting) return <><style>{STYLE}</style></>;

  if (!session) {
    return <><style>{STYLE}</style><Login onLogin={setSession} /></>;
  }

  if (!module) {
    const stats = {
      HCC: records.filter(r => r.module === "HCC").length,
      PPM: records.filter(r => r.module === "PPM").length,
      CM:  records.filter(r => r.module === "CM").length,
    };
    return (
      <>
        <style>{STYLE}</style>
        {error && <ErrorBar message={error} onClose={() => setError("")} />}
        <Launcher session={session} onPick={setModule} onLogout={logout} stats={stats} />
      </>
    );
  }

  const meta = MODULE_META[module];

  return (
    <>
      <style>{STYLE}</style>
      {error && <ErrorBar message={error} onClose={() => setError("")} />}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <AppHeader
          session={session}
          module={module}
          meta={meta}
          onBack={() => setModule(null)}
          onLogout={logout}
          onUsers={() => setShowUsers(true)}
          onBuilder={() => setShowBuilder(true)}
          onLists={() => setShowLists(true)}
          pendingCount={requests.filter(r => r.status === "pending").length}
        />

        <main style={{ flex: 1, padding: "20px 24px 40px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          {module === "HCC" && (
            <HCC records={records} setRecords={setRecords} session={session}
                 deviceTypes={dtypes.HCC} templates={templates} />
          )}
          {module === "PPM" && (
            <PPM records={records} setRecords={setRecords} session={session}
                 deviceTypes={dtypes.PPM} models={models} templates={templates} />
          )}
          {module === "CM" && (
            <CM records={records} setRecords={setRecords} session={session}
                deviceTypes={dtypes.CM} models={models} cmActions={cmActions} />
          )}
        </main>

        <footer style={{ padding: "14px 24px", textAlign: "center", fontSize: 11, color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
          HTMS Unified Maintenance Platform · v{VERSION} · MNGHA
        </footer>
      </div>

      {showUsers && (
        <UsersModal users={users} session={session} reload={reload} onError={onError}
                    requests={requests} onClose={() => setShowUsers(false)} />
      )}
      {showBuilder && (
        <ChecklistBuilder templates={templates} setTemplates={setTemplates}
                          deviceTypes={dtypes} models={models}
                          session={session} onClose={() => setShowBuilder(false)} />
      )}
      {showLists && (
        <ListsManager deviceTypes={dtypes} setDeviceTypes={setDtypes}
                      models={models} setModels={setModels}
                      cmActions={cmActions} setCmActions={setCmActions}
                      onClose={() => setShowLists(false)} />
      )}
    </>
  );
}

/** Thin red strip shown only when the server rejects something. */
function ErrorBar({ message, onClose }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9000,
      background: "#b3261e", color: "#fff", padding: "9px 16px",
      display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 600
    }}>
      <Ic d={D.warn} size={14} stroke="#fff" />
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
        <Ic d={D.close} size={12} stroke="#fff" />
      </button>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────
function AppHeader({ session, module, meta, onBack, onLogout, onUsers, onBuilder, onLists, pendingCount }) {
  return (
    <header style={{
      background: "var(--green3)", borderBottom: "3px solid var(--gold)",
      padding: "0 20px", height: 64, display: "flex", alignItems: "center",
      justifyContent: "space-between", flexShrink: 0, boxShadow: "0 2px 12px rgba(0,0,0,.18)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button onClick={onBack} title="Back to modules" style={{
          background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)",
          borderRadius: 6, padding: "7px 10px", color: "#fff", flexShrink: 0
        }}>
          <Ic d={D.grid} size={15} stroke="#fff" />
        </button>

        <img src={MNGHA_LOGO} alt="MNGHA" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)", background: "#fff", flexShrink: 0 }} />
        <img src={HTMS_LOGO} alt="HTMS" style={{ width: 40, height: 40, borderRadius: 7, objectFit: "cover", border: "1px solid rgba(255,255,255,.2)", flexShrink: 0 }} />

        <div style={{ width: 1, height: 34, background: "rgba(255,255,255,.2)", margin: "0 4px", flexShrink: 0 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: meta.color,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <Ic d={meta.icon} size={16} stroke="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
              {module} — {meta.name}
            </div>
            <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11 }}>
              HTMS Platform <span style={{ fontFamily: "var(--mono)", opacity: .7 }}>v{VERSION}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {session.role === "admin" && (
          <>
            <button onClick={onBuilder} title="Checklist Builder" style={hBtn}>
              <Ic d={D.list} size={14} stroke="#fff" />
              <span style={{ fontSize: 12 }}>Checklists</span>
            </button>
            <button onClick={onLists} title="Manage dropdown lists" style={hBtn}>
              <Ic d={D.chip} size={14} stroke="#fff" />
              <span style={{ fontSize: 12 }}>Lists</span>
            </button>
            <button onClick={onUsers} title="User Management" style={{ ...hBtn, position: "relative" }}>
              <Ic d={D.users} size={14} stroke="#fff" />
              <span style={{ fontSize: 12 }}>Users</span>
              {pendingCount > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -6, minWidth: 18, height: 18,
                  borderRadius: 10, background: "var(--gold)", color: "#fff",
                  fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: "0 5px", border: "2px solid var(--green3)"
                }}>{pendingCount}</span>
              )}
            </button>
          </>
        )}

        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{session.name}</div>
          <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11 }}>@{session.username}</div>
        </div>
        <span className={"badge " + (session.role === "admin" ? "badge-gold" : "badge-green")} style={{ fontSize: 10 }}>
          {session.role.toUpperCase()}
        </span>
        <button onClick={onLogout} style={hBtn}>
          <Ic d={D.logout} size={13} stroke="#fff" /> <span style={{ fontSize: 12 }}>Sign Out</span>
        </button>
      </div>
    </header>
  );
}

const hBtn = {
  background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6, padding: "6px 11px", fontFamily: "var(--sans)", fontWeight: 600,
  cursor: "pointer", display: "flex", alignItems: "center", gap: 5
};

// ── Login ──────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);

  const go = async () => {
    if (busy) return;
    setErr("");
    if (!u.trim() || !p) { setErr("Invalid username or password."); return; }
    setBusy(true);
    try { onLogin(await api.signIn(u, p)); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "var(--bg)" }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
        padding: 34, width: "min(420px,100%)", boxShadow: "var(--shadow2)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 }}>
            <img src={MNGHA_LOGO} alt="MNGHA" style={{ width: 62, height: 62, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--green-mid)" }} />
            <img src={HTMS_LOGO} alt="HTMS" style={{ width: 62, height: 62, borderRadius: 11, objectFit: "cover", border: "2px solid var(--border2)" }} />
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "var(--green3)", marginBottom: 4 }}>HTMS Platform</h1>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--green)", marginBottom: 3 }}>
            Healthcare Technology Management Services
          </div>
          <p style={{ color: "var(--text3)", fontSize: 11.5 }}>
            Unified Maintenance System · <span style={{ fontFamily: "var(--mono)" }}>v{VERSION}</span>
          </p>
        </div>

        {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}

        <div className="field">
          <label>Username</label>
          <input value={u} onChange={e => setU(e.target.value)} autoFocus
                 onKeyDown={e => e.key === "Enter" && go()} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={p} onChange={e => setP(e.target.value)}
                 onKeyDown={e => e.key === "Enter" && go()} />
        </div>
        <button className="btn-primary btn-lg" onClick={go} style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
          Sign In <Ic d={D.arrow} size={15} stroke="#fff" />
        </button>

        <div style={{ textAlign: "center", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12.5, color: "var(--text3)" }}>Don't have an account? </span>
          <button onClick={() => setSignup(true)} style={{
            background: "none", border: "none", padding: 0,
            color: "var(--green)", fontSize: 12.5, fontWeight: 700,
            textDecoration: "underline", cursor: "pointer"
          }}>
            Request one
          </button>
        </div>
      </div>

      {signup && <SignupModal onClose={() => setSignup(false)} onActivated={onLogin} />}
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────────────
function UsersModal({ users, session, requests, reload, onError, onClose }) {
  const [tab, setTab] = useState("users");
  const [add, setAdd] = useState(false);
  const [pw, setPw]   = useState(null);
  const [f, setF]     = useState({ name: "", username: "", password: "", role: "user" });
  const [np, setNp]   = useState("");
  const [err, setErr] = useState("");
  const pendingReqs = requests.filter(r => r.status === "pending").length;

  const create = async () => {
    setErr("");
    if (!f.name.trim() || !f.username.trim() || !f.password.trim()) { setErr("All fields are required."); return; }
    if (users.some(x => x.username === f.username.trim())) { setErr("That username already exists."); return; }
    try {
      await api.createUser(f);
      await reload();
      setF({ name: "", username: "", password: "", role: "user" });
      setAdd(false);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const run = async (fn) => {
    try { await fn(); await reload(); } catch (e) { onError(e); }
  };

  return (
    <>
      <Modal title="User Management" onClose={onClose} wide
        footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

        <div className="tab-bar" style={{ marginBottom: 18 }}>
          <button className={"tab-btn" + (tab === "users" ? " active" : "")} onClick={() => setTab("users")}>
            <Ic d={D.users} size={13} /> Users <span className="count-dot">{users.length}</span>
          </button>
          <button className={"tab-btn" + (tab === "requests" ? " active" : "")} onClick={() => setTab("requests")}>
            <Ic d={D.user} size={13} /> Account Requests
            {pendingReqs > 0 && (
              <span className="count-dot" style={{ background: "var(--gold-lt)", color: "var(--gold)", borderColor: "var(--gold-mid)" }}>
                {pendingReqs}
              </span>
            )}
          </button>
        </div>

        {tab === "requests" && (
          <RequestsPanel requests={requests} users={users} session={session}
                         reload={reload} onError={onError} />
        )}

        {tab === "users" && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <SL>Manage system users, roles and passwords</SL>
          <button className="btn-primary btn-sm" onClick={() => setAdd(true)}>
            <Ic d={D.plus} size={13} stroke="#fff" /> Add User
          </button>
        </div>

        {users.map(x => (
          <div key={x.id} style={{
            background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: x.role === "admin" ? "var(--gold-lt)" : "var(--green-lt)",
              border: "1px solid " + (x.role === "admin" ? "var(--gold-mid)" : "var(--green-mid)"),
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
            }}>
              <Ic d={D.user} size={16} stroke={x.role === "admin" ? "var(--gold)" : "var(--green)"} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{x.name}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>@{x.username}</div>
            </div>
            <span className={"badge " + (x.role === "admin" ? "badge-gold" : "badge-green")}>{x.role}</span>
            {!x.isActive && <span className="badge badge-gray">Pending</span>}
            {x.username === session.username && <span className="badge badge-gray">You</span>}
            <button className="btn-ghost btn-sm" onClick={() => { setPw(x); setNp(""); setErr(""); }}>
              <Ic d={D.key} size={12} /> Password
            </button>
            {x.username !== session.username && (
              <button className="btn-danger btn-sm"
                      onClick={() => { if (window.confirm(`Remove user ${x.username}?`)) run(() => api.deleteProfile(x.id)); }}>
                <Ic d={D.trash} size={12} /> Remove
              </button>
            )}
          </div>
        ))}
        </>}
      </Modal>

      {add && (
        <Modal title="Create New User" onClose={() => setAdd(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setAdd(false)}>Cancel</button>
            <button className="btn-primary" onClick={create}>Create</button>
          </>}>
          {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
          <div className="field"><label>Full Name</label>
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Full name" /></div>
          <div className="field"><label>Username</label>
            <input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} placeholder="Username" /></div>
          <div className="field"><label>Password</label>
            <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} placeholder="Password" /></div>
          <div className="field"><label>Role</label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select></div>
        </Modal>
      )}

      {pw && (
        <Modal title={`Change Password — ${pw.name}`} onClose={() => setPw(null)}
          footer={<>
            <button className="btn-ghost" onClick={() => setPw(null)}>Cancel</button>
            <button className="btn-primary" onClick={async () => {
              if (!np.trim()) return;
              try { await api.changePassword(pw, np); setPw(null); }
              catch (e) { setErr(friendlyError(e)); }
            }}>Update Password</button>
          </>}>
          {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
          <div className="field"><label>New Password</label>
            <input type="password" value={np} onChange={e => setNp(e.target.value)} autoFocus placeholder="New password" /></div>
        </Modal>
      )}
    </>
  );
}
