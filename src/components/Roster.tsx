import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Ic, D, Modal, Empty, SH, SL } from "../lib/utils.jsx";
import { friendlyError } from "../lib/supabase.js";
import * as R from "../lib/roster.js";

/**
 * HCC On-Call roster — who is responsible for HCC each week, plus leave notices.
 *
 *   everyone   sees the roster, adds / removes their own leave
 *   admin      chooses the rotation team, generates a month, edits any week,
 *              adds leave for anyone
 */

// ── Data hook (shared by the strip and the tab) ────────────────────────
export function useRoster(enabled = true) {
  const [data, setData] = useState(null);     // { members, plans, leaves }
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try { setData(await R.loadRoster()); setError(null); }
    catch (e) { console.error(e); setError(e); }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const stop = R.subscribeRoster(reload);
    const poll = setInterval(() => { if (!document.hidden) reload(); }, 30000);
    return () => { stop(); clearInterval(poll); };
  }, [enabled, reload]);

  return { data, error, reload };
}

/** True on phone-width screens, where the week table becomes cards. */
function useNarrow(px = 700) {
  const [n, setN] = useState(() => typeof window !== "undefined" && window.innerWidth < px);
  useEffect(() => {
    const on = () => setN(window.innerWidth < px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return n;
}

const nameFn = (users) => {
  const m = new Map(users.map(u => [u.id, u.name || u.username]));
  return (id) => (id ? m.get(id) || "—" : "—");
};

// ── "On duty this week" strip, shown above the HCC tabs ────────────────
export function OnDutyStrip({ roster, users, onOpen }) {
  const { data } = roster;
  if (!data) return null;
  const ctx = R.makeCtx(users, data.members, data.leaves, data.plans);
  const w = R.weekStartOf(R.todayKey());
  if (!data.plans[w]) return null;
  const name = nameFn(users);
  // Today's actual holders — someone on leave today is already covered
  const slots = R.effectiveDay(ctx, w, R.todayKey());
  if (!slots[0]) return null;

  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer",
      background: "var(--green-lt)", border: "1px solid var(--green-mid)", borderRadius: 10,
      padding: "10px 14px", marginBottom: 14,
    }}>
      <Ic d={D.shield} size={16} stroke="var(--green)" />
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)" }}>HCC on duty today</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--green3)" }}>{name(slots[0])}</span>
      {(slots[1] || slots[2]) && (
        <span style={{ fontSize: 12, color: "var(--text2)" }}>
          Backup: {[slots[1], slots[2]].filter(Boolean).map(name).join(" → ")}
        </span>
      )}
      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text3)" }}>{R.weekLabel(w)}</span>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────
export default function RosterSection({ roster, users, session }) {
  const { data, error, reload } = roster;
  const isAdmin = session.role === "admin";
  const [ym, setYm] = useState(() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [editWeek, setEditWeek] = useState(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const activeUsers = useMemo(() => users.filter(u => u.isActive), [users]);
  const narrow = useNarrow();
  const name = nameFn(users);

  if (error) {
    return (
      <div className="alert alert-warn" style={{ marginTop: 8 }}>
        <Ic d={D.warn} size={14} />
        {R.isMissingSchema(error)
          ? (isAdmin
              ? "The roster tables are not set up yet. Run schema_roster.sql in Supabase → SQL Editor, then reopen this tab."
              : "The on-call roster has not been set up yet. Ask an administrator.")
          : friendlyError(error)}
      </div>
    );
  }
  if (!data) return <Empty label="Loading roster…" />;

  const ctx = R.makeCtx(users, data.members, data.leaves, data.plans);
  const weeks = R.monthWeeks(ym[0], ym[1]);
  const thisWeek = R.weekStartOf(R.todayKey());
  const monthName = new Date(ym[0], ym[1], 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const shift = (n) => setYm(([y, m]) => { const d = new Date(y, m + n, 1); return [d.getFullYear(), d.getMonth()]; });

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); await reload(); if (ok) flash(ok); }
    catch (e) { window.alert(friendlyError(e)); }
    finally { setBusy(false); }
  };

  // Generate: empty weeks anywhere in the month + unlocked weeks that have
  // not started yet. The current week, past weeks and hand-edited weeks stay.
  const generate = () => {
    if (ctx.pool.length === 0) {
      window.alert("No one is in the rotation yet. Open “Team” and add the engineers first.");
      return;
    }
    const rewrite = new Set(weeks.filter(w => !data.plans[w] || (w > thisWeek && !data.plans[w].locked)));
    if (rewrite.size === 0) {
      window.alert("Every week of this month is already running or edited by hand — nothing to generate.");
      return;
    }
    const replacing = [...rewrite].filter(w => data.plans[w]).length;
    if (replacing && !window.confirm(
      `Regenerate ${rewrite.size} week(s) of ${monthName}?\n\n` +
      "The current week, past weeks and weeks you edited by hand are kept.")) return;

    const out = R.generatePlans(ctx, weeks, rewrite);
    run(() => R.saveWeeks(Object.entries(out).map(([week, slots]) => ({ week, slots, locked: false })), session.id),
        `${monthName} generated — ${rewrite.size} week(s).`);
  };

  const monthTally = R.tally(ctx, weeks);
  const tallyIds = [...monthTally.keys()].filter(id =>
    ctx.pool.includes(id) || monthTally.get(id).load > 0);

  const visibleLeaves = data.leaves
    .filter(l => showPast || l.end >= R.todayKey())
    .sort((a, b) => (showPast ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SH title="On-Call Roster" sub="One engineer is responsible for HCC each week, with two backups in order" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost btn-sm" onClick={() => setLeaveOpen(true)}>
            <Ic d={D.calendar} size={13} /> Leave Notice
          </button>
          {isAdmin && (
            <button className="btn-ghost btn-sm" onClick={() => setShowTeam(true)}>
              <Ic d={D.users} size={13} /> Team <span className="count-dot">{ctx.pool.length}</span>
            </button>
          )}
          {isAdmin && (
            <button className="btn-primary btn-sm" onClick={generate} disabled={busy}>
              <Ic d={D.process} size={13} stroke="#fff" /> Generate Month
            </button>
          )}
        </div>
      </div>

      {msg && <div className="alert alert-success"><Ic d={D.check} size={14} />{msg}</div>}

      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "4px 0 14px" }}>
        <button className="btn-ghost btn-sm" onClick={() => shift(-1)}><Ic d={D.arrowL} size={13} /></button>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--green3)", minWidth: 170, textAlign: "center" }}>{monthName}</div>
        <button className="btn-ghost btn-sm" onClick={() => shift(1)}><Ic d={D.arrow} size={13} /></button>
      </div>

      {/* Weeks — cards on a phone */}
      {narrow && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {weeks.map(w => {
            const plan = data.plans[w];
            const eff = plan ? R.effectiveWeek(ctx, w) : null;
            const runs = plan ? R.dayRuns(ctx, w) : [];
            const isNow = w === thisWeek;
            const away = R.leavesInWeek(data.leaves, w);
            return (
              <div key={w} style={{
                background: isNow ? "var(--gold-lt)" : "var(--surface)",
                border: "1px solid " + (isNow ? "var(--gold-mid)" : "var(--border)"),
                borderRadius: 10, padding: 12, opacity: w < thisWeek ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5 }}>{R.weekLabel(w)}</span>
                  {isNow && <span className="badge badge-gold">This week</span>}
                  {plan?.locked && <span className="badge badge-purple">Edited</span>}
                  {isAdmin && (
                    <button className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setEditWeek(w)}>
                      <Ic d={D.pencil} size={12} /> Edit
                    </button>
                  )}
                </div>
                {!eff && <div style={{ fontSize: 12.5, color: "var(--text3)" }}>Not scheduled</div>}
                {eff && R.SLOTS.map((label, i) => {
                  const id = eff.slots[i];
                  const cover = eff.changes.some(c => c.cover && c.id === id);
                  return (
                    <div key={label} style={{ padding: "3px 0", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 52, fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>{label}</span>
                        <span style={{ fontWeight: i === 0 ? 800 : 600, color: i === 0 ? "var(--green3)" : "var(--text)" }}>{name(id)}</span>
                        {cover && <span className="badge badge-orange">covering</span>}
                      </div>
                    </div>
                  );
                })}
                <DayRuns runs={runs} name={name} />
                {away.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {away.map(l => (
                      <span key={l.id} className="badge badge-gray">
                        {name(l.profileId)} away {R.fmtDay(l.start < w ? w : l.start)}–{R.fmtDay(l.end > R.weekEnd(w) ? R.weekEnd(w) : l.end)}
                      </span>
                    ))}
                  </div>
                )}
                {plan?.note && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>{plan.note}</div>}
              </div>
            );
          })}
        </div>
      )}

      {!narrow && <div style={{ overflowX: "auto", marginBottom: 18 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--green3)", color: "#fff" }}>
              <th style={th}>Week (Sun – Sat)</th>
              {R.SLOTS.map(s => <th key={s} style={th}>{s}</th>)}
              {isAdmin && <th style={{ ...th, width: 1 }} />}
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => {
              const plan = data.plans[w];
              const eff = plan ? R.effectiveWeek(ctx, w) : null;
              const runs = plan ? R.dayRuns(ctx, w) : [];
              const isNow = w === thisWeek;
              const past = w < thisWeek;
              const away = R.leavesInWeek(data.leaves, w);
              return (
                <tr key={w} style={{
                  background: isNow ? "var(--gold-lt)" : "var(--surface)",
                  opacity: past ? 0.6 : 1, borderBottom: "1px solid var(--border)",
                }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{R.weekLabel(w)}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
                      {isNow && <span className="badge badge-gold">This week</span>}
                      {plan?.locked && <span className="badge badge-purple" title="Edited by hand — Generate will not change it">Edited</span>}
                      {away.map(l => (
                        <span key={l.id} className="badge badge-gray" title={l.note || ""}>
                          {name(l.profileId)} away {R.fmtDay(l.start < w ? w : l.start)}–{R.fmtDay(l.end > R.weekEnd(w) ? R.weekEnd(w) : l.end)}
                        </span>
                      ))}
                    </div>
                    {plan?.note && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 3 }}>{plan.note}</div>}
                    <DayRuns runs={runs} name={name} />
                  </td>
                  {[0, 1, 2].map(i => {
                    if (!eff) return <td key={i} style={{ ...td, color: "var(--text3)" }}>—</td>;
                    const id = eff.slots[i];
                    const cover = eff.changes.some(c => c.cover && c.id === id);
                    const replaced = eff.planned[i] && eff.planned[i] !== id && !eff.slots.includes(eff.planned[i])
                      ? eff.planned[i] : null;
                    return (
                      <td key={i} style={td}>
                        <span style={{ fontWeight: i === 0 ? 800 : 600, color: i === 0 ? "var(--green3)" : "var(--text)" }}>
                          {name(id)}
                        </span>
                        {cover && <span className="badge badge-orange" style={{ marginLeft: 6 }}>covering</span>}
                        {replaced && (
                          <div style={{ fontSize: 11, color: "var(--text3)", textDecoration: "line-through" }}>{name(replaced)}</div>
                        )}
                      </td>
                    );
                  })}
                  {isAdmin && (
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button className="btn-ghost btn-sm" onClick={() => setEditWeek(w)}>
                        <Ic d={D.pencil} size={12} /> Edit
                      </button>
                      {plan?.locked && (
                        <button className="btn-ghost btn-sm" style={{ marginLeft: 6 }}
                                title="Let Generate change this week again"
                                onClick={() => run(() => R.setWeekLocked(w, false))}>
                          Unlock
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}

      {weeks.every(w => !data.plans[w]) && (
        <div className="alert alert-warn">
          <Ic d={D.warn} size={14} />
          {isAdmin ? "No roster for this month yet — press Generate Month." : "The roster for this month has not been published yet."}
        </div>
      )}

      {/* Fairness */}
      {tallyIds.length > 0 && weeks.some(w => data.plans[w]) && (
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
          <SL>Workload this month</SL>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {tallyIds.sort((a, b) => monthTally.get(b).load - monthTally.get(a).load).map(id => {
              const t = monthTally.get(id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, minWidth: 120 }}>{name(id)}</span>
                  {ctx.catOf(id) === "light" && <span className="badge badge-blue">Light</span>}
                  <span className="badge badge-green">Assign {t.slots[0]}</span>
                  <span className="badge badge-gray">2nd {t.slots[1]}</span>
                  <span className="badge badge-gray">3rd {t.slots[2]}</span>
                  {t.coverDays > 0 && <span className="badge badge-orange">+{t.coverDays} cover day{t.coverDays === 1 ? "" : "s"}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leave notices */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <SL>Leave notices — for information; the roster adjusts automatically</SL>
          <label className="checkbox-custom" style={{ fontSize: 12 }}>
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} /> Show past
          </label>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {visibleLeaves.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text3)" }}>No leave notices.</div>}
          {visibleLeaves.map(l => {
            const mine = l.profileId === session.id;
            const now = l.start <= R.todayKey() && l.end >= R.todayKey();
            return (
              <div key={l.id} style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
              }}>
                <span style={{ fontWeight: 700, minWidth: 110 }}>{name(l.profileId)}</span>
                <span className="info-pill">📅 {R.fmtDayY(l.start)} → {R.fmtDayY(l.end)}</span>
                <span className="badge badge-gray">{R.daysBetween(l.start, l.end)} day(s)</span>
                {now && <span className="badge badge-orange">On leave now</span>}
                {l.note && <span style={{ fontSize: 12, color: "var(--text2)" }}>{l.note}</span>}
                {(mine || isAdmin) && (
                  <button className="btn-danger btn-sm" style={{ marginLeft: "auto" }}
                          onClick={() => { if (window.confirm("Remove this leave notice?")) run(() => R.deleteLeave(l.id)); }}>
                    <Ic d={D.trash} size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showTeam && (
        <TeamModal users={activeUsers} members={data.members}
                   onSave={(id, patch) => run(() => R.saveMember(id, patch))}
                   onClose={() => setShowTeam(false)} />
      )}
      {editWeek && (
        <EditWeekModal week={editWeek} plan={data.plans[editWeek]} users={activeUsers} ctx={ctx}
                       onSave={(slots, note) => run(() => R.saveWeeks([{ week: editWeek, slots, note, locked: true }], session.id), "Week saved.")}
                       onClose={() => setEditWeek(null)} />
      )}
      {leaveOpen && (
        <LeaveModal users={activeUsers} session={session} isAdmin={isAdmin}
                    onSave={(l) => run(() => R.addLeave(l), "Leave notice added — the roster has been adjusted.")}
                    onClose={() => setLeaveOpen(false)} />
      )}
    </div>
  );
}

/** "03–05 Nov: Assign Abdullah · 2nd Sultan · 3rd Faisal" — the days covered for leave */
function DayRuns({ runs, name }) {
  if (!runs.length) return null;
  return runs.map((r, k) => (
    <div key={k} style={{ fontSize: 11.5, color: "var(--orange)", fontWeight: 600, marginTop: 4, lineHeight: 1.5 }}>
      {R.fmtDay(r.from)}{r.to !== r.from ? "–" + R.fmtDay(r.to) : ""} covered:{" "}
      <span style={{ fontWeight: 500, color: "var(--text2)" }}>
        {R.SLOTS.map((l, i) => r.slots[i] ? `${l} ${name(r.slots[i])}` : null).filter(Boolean).join(" · ")}
      </span>
    </div>
  ));
}

const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: ".02em" };
const td = { padding: "10px 12px", verticalAlign: "top" };

// ── Team: who is in the rotation ───────────────────────────────────────
function TeamModal({ users, members, onSave, onClose }) {
  return (
    <Modal title="Rotation Team" onClose={onClose} wide
      footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <SL>Active accounts only — tick everyone who takes HCC weeks</SL>
      <p style={{ fontSize: 12, color: "var(--text3)", margin: "6px 0 14px", lineHeight: 1.6 }}>
        <strong>Intern</strong> — full rotation, takes the Assign role.<br />
        <strong>Summer / Technical College</strong> — lighter load: backup slots only, and first to cover gaps when someone is on leave.<br />
        A suspended account drops out of the roster automatically.
      </p>
      {users.length === 0 && <Empty label="No active accounts" />}
      {users.map(u => {
        const m = members[u.id] || {};
        const on = !!m.inRotation;
        return (
          <div key={u.id} style={{
            background: on ? "var(--green-lt)" : "var(--surface2)",
            border: "1px solid " + (on ? "var(--green-mid)" : "var(--border)"),
            borderRadius: 8, padding: "10px 13px", marginBottom: 7,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <label className="checkbox-custom" style={{ flex: 1, minWidth: 160 }}>
              <input type="checkbox" checked={on}
                     onChange={e => onSave(u.id, { inRotation: e.target.checked, category: m.category || "intern" })} />
              <span>
                <strong>{u.name}</strong>
                <span style={{ fontSize: 11.5, color: "var(--text3)", fontFamily: "var(--mono)", marginLeft: 6 }}>@{u.username}</span>
              </span>
            </label>
            <select value={m.category || "intern"} disabled={!on} style={{ width: "auto", minWidth: 220 }}
                    onChange={e => onSave(u.id, { category: e.target.value, inRotation: true })}>
              {Object.entries(R.CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        );
      })}
    </Modal>
  );
}

// ── Edit one week by hand ──────────────────────────────────────────────
function EditWeekModal({ week, plan, users, ctx, onSave, onClose }) {
  const [slots, setSlots] = useState(() => plan ? [...plan.slots] : [null, null, null]);
  const [note, setNote] = useState(plan?.note || "");
  const [err, setErr] = useState("");

  const set = (i, v) => setSlots(s => s.map((x, j) => (j === i ? (v || null) : x)));
  const away = (id) => R.awayDays(ctx.leaves, id, week);

  const save = () => {
    setErr("");
    if (!slots[0]) { setErr("Assign is required."); return; }
    const filled = slots.filter(Boolean);
    if (new Set(filled).size !== filled.length) { setErr("The same person cannot hold two slots."); return; }
    onSave(slots, note.trim());
    onClose();
  };

  return (
    <Modal title={`Edit Week — ${R.weekLabel(week)}`} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}><Ic d={D.save} size={13} stroke="#fff" /> Save</button>
      </>}>
      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
      {R.SLOTS.map((label, i) => (
        <div className="field" key={label}>
          <label>{label}{i === 0 ? " *" : ""}</label>
          <select value={slots[i] || ""} onChange={e => set(i, e.target.value)}>
            <option value="">{i === 0 ? "Select…" : "— none —"}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}{away(u.id) ? `  (away ${away(u.id)} day${away(u.id) === 1 ? "" : "s"} this week)` : ""}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="field">
        <label>Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. swapped at Sultan's request" />
      </div>
      <div className="alert" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 12, marginBottom: 0 }}>
        <Ic d={D.shield} size={13} />
        A week saved here is marked Edited, and Generate Month will leave it alone until you unlock it.
        Leave days are still covered automatically, day by day.
      </div>
    </Modal>
  );
}

// ── Leave notice ───────────────────────────────────────────────────────
function LeaveModal({ users, session, isAdmin, onSave, onClose }) {
  const [who, setWho] = useState(session.id);
  const [start, setStart] = useState(R.todayKey());
  const [end, setEnd] = useState(R.todayKey());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    setErr("");
    if (!who) { setErr("Select a person."); return; }
    if (!start || !end) { setErr("Both dates are required."); return; }
    if (end < start) { setErr("The end date is before the start date."); return; }
    onSave({ profileId: who, start, end, note: note.trim() });
    onClose();
  };

  return (
    <Modal title="Leave Notice" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}><Ic d={D.plus} size={13} stroke="#fff" /> Add</button>
      </>}>
      <div className="alert" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 12 }}>
        <Ic d={D.calendar} size={13} />
        For information only — approval is still obtained from the department.
        The on-call roster is covered automatically for these days only.
      </div>
      {err && <div className="alert alert-error"><Ic d={D.close} size={13} />{err}</div>}
      <div className="field">
        <label>Person</label>
        {isAdmin ? (
          <select value={who} onChange={e => setWho(e.target.value)}>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <input value={session.name} disabled />
        )}
      </div>
      <div className="grid-2">
        <div className="field"><label>From</label>
          <input type="date" value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></div>
        <div className="field"><label>To</label>
          <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. annual leave" />
      </div>
    </Modal>
  );
}
