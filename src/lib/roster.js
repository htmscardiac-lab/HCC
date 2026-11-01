import { supabase } from "./supabase.js";

/**
 * HCC On-Call roster.
 *
 * Every week (Sunday → Saturday) one engineer is responsible for HCC
 * ("Assign"), with a 2nd and a 3rd as backups.
 *
 * Fairness — each slot carries a load: Assign 3 · 2nd 2 · 3rd 1. When a month
 * is generated, every week goes to whoever has carried the least load over the
 * recent weeks, with ties broken at random. With three interns this settles
 * into the familiar rotation where each person takes each role once every
 * three weeks.
 *
 * Categories —
 *   intern  full rotation; the only people who take "Assign" while any is free
 *   light   summer / technical-college students: backup slots only, at a
 *           reduced load, and first choice to fill a gap left by leave
 *
 * Leave — a leave notice never edits the stored plan. The effective roster is
 * worked out on the fly, DAY BY DAY: on each day someone is away, the others
 * move up for that day only and the empty slot is filled by the least loaded
 * free member. The person keeps the rest of their week. (Someone away the
 * whole week is simply replaced for that week.) Delete the leave and the
 * original plan returns.
 */

export const SLOTS = ["Assign", "2nd", "3rd"];
const WEIGHT = [3, 2, 1];
const LIGHT_FACTOR = 1.6;   // a light member's load counts this much more → picked less often
const LOOKBACK_WEEKS = 12;

export const CATEGORIES = {
  intern: { label: "Intern",                    short: "Intern" },
  light:  { label: "Summer / Technical College", short: "Light" },
};

// ── Dates (local, "YYYY-MM-DD" keys — compare as plain strings) ─────────
const pad = (n) => String(n).padStart(2, "0");
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dparse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (k, n) => { const d = dparse(k); d.setDate(d.getDate() + n); return dkey(d); };
export const todayKey = () => dkey(new Date());
export const weekStartOf = (k) => { const d = dparse(k); d.setDate(d.getDate() - d.getDay()); return dkey(d); };
export const weekEnd = (w) => addDays(w, 6);

/** Every week (by its Sunday) that touches the given month. */
export function monthWeeks(year, month0) {
  const first = dkey(new Date(year, month0, 1, 12));
  const last  = dkey(new Date(year, month0 + 1, 0, 12));
  const out = [];
  for (let w = weekStartOf(first); w <= last; w = addDays(w, 7)) out.push(w);
  return out;
}

export const fmtDay = (k) => dparse(k).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
export const fmtDayY = (k) => dparse(k).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
export const weekLabel = (w) => `${fmtDay(w)} – ${fmtDay(weekEnd(w))}`;
export const daysBetween = (a, b) => Math.round((dparse(b) - dparse(a)) / 86400000) + 1;

// ── Leave ──────────────────────────────────────────────────────────────
const overlaps = (l, w) => l.start <= weekEnd(w) && l.end >= w;
export const leavesInWeek = (leaves, w) => leaves.filter(l => overlaps(l, w));
export const isOnLeave = (leaves, id, w) => leaves.some(l => l.profileId === id && overlaps(l, w));
export const weekDays = (w) => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(w, i));
/** Away on this exact day */
export const awayOn = (leaves, id, day) =>
  leaves.some(l => l.profileId === id && l.start <= day && l.end >= day);
/** Number of days in week `w` the person is away (0–7) */
export const awayDays = (leaves, id, w) => weekDays(w).filter(d => awayOn(leaves, id, d)).length;
/** Away for the entire week — the only case that replaces someone for the week */
export const awayAllWeek = (leaves, id, w) => awayDays(leaves, id, w) === 7;

// ── Context ────────────────────────────────────────────────────────────
/**
 * Everything the calculations need, built once per render.
 *   users   — App user list ({ id, name, isActive })
 *   members — { [profileId]: { category, inRotation } }
 */
export function makeCtx(users, members, leaves, plans) {
  const active = new Set(users.filter(u => u.isActive).map(u => u.id));
  const pool = users
    .filter(u => u.isActive && members[u.id]?.inRotation)
    .map(u => u.id);
  const catOf = (id) => members[id]?.category || "intern";
  return { active, pool, catOf, leaves, plans };
}

// ── Load bookkeeping ───────────────────────────────────────────────────
function emptyLoads(ids) {
  const m = new Map();
  ids.forEach(id => m.set(id, { load: 0, slots: [0, 0, 0], coverDays: 0 }));
  return m;
}
function addLoad(loads, slots) {
  slots.forEach((id, i) => {
    if (!id) return;
    if (!loads.has(id)) loads.set(id, { load: 0, slots: [0, 0, 0] });
    const e = loads.get(id);
    e.load += WEIGHT[i];
    e.slots[i] += 1;
  });
}
/** Load carried in the weeks just before `w`, from the effective roster. */
function historyLoads(ctx, w) {
  const loads = emptyLoads(ctx.pool);
  for (let k = addDays(w, -7 * LOOKBACK_WEEKS); k < w; k = addDays(k, 7)) {
    if (ctx.plans[k]) addWeekLoad(ctx, loads, k);
  }
  return loads;
}

/**
 * Credit a week day by day: each day is worth 1/7 of the slot weight, so a
 * covering day counts for the person who covered it, not the one away.
 * Slot COUNTS stay whole weeks (by the week-level holder).
 */
function addWeekLoad(ctx, loads, w) {
  const weekSlots = effectiveWeek(ctx, w).slots;
  weekSlots.forEach((id, i) => {
    if (!id) return;
    if (!loads.has(id)) loads.set(id, { load: 0, slots: [0, 0, 0], coverDays: 0 });
    loads.get(id).slots[i] += 1;
  });
  weekDays(w).forEach(day => {
    effectiveDay(ctx, w, day).forEach((id, i) => {
      if (!id) return;
      if (!loads.has(id)) loads.set(id, { load: 0, slots: [0, 0, 0], coverDays: 0 });
      const e = loads.get(id);
      e.load += WEIGHT[i] / 7;
      // A cover day = actually taking Assign for someone, or being brought in
      // from outside the week's line-up. Backups shuffling up a place is not.
      if ((i === 0 && weekSlots[0] !== id) || !weekSlots.includes(id))
        e.coverDays = (e.coverDays || 0) + 1;
    });
  });
}

const score = (ctx, loads, id) =>
  (loads.get(id)?.load || 0) * (ctx.catOf(id) === "light" ? LIGHT_FACTOR : 1);

/** Pick the lowest-scoring id; random among equals. */
function pickBest(ctx, loads, ids, penalty = () => 0) {
  if (!ids.length) return null;
  const scored = ids.map(id => ({ id, s: score(ctx, loads, id) + penalty(id) + Math.random() * 0.5 }));
  scored.sort((a, b) => a.s - b.s);
  return scored[0].id;
}

/**
 * Choose Assign / 2nd / 3rd for one week from the available members.
 *
 *   loads  — everything carried recently (previous months + this month so far)
 *   month  — what has been carried within the month being generated
 *
 * Balance inside the month comes first, so the month on screen is always
 * fair; earlier months only break ties. `prev` is last week's slots, used to
 * avoid back-to-back Assign weeks.
 */
function chooseWeek(ctx, loads, month, available, prev = [], away = () => 0) {
  const interns = available.filter(id => ctx.catOf(id) === "intern");
  const notLast = (list) => {
    const f = list.filter(id => id !== prev[0]);
    return f.length ? f : list;
  };
  const m = (id) => month.get(id) || { load: 0, slots: [0, 0, 0] };
  const all = (id) => loads.get(id) || { load: 0, slots: [0, 0, 0] };
  const light = (id) => ctx.catOf(id) === "light";

  // Assign is the real duty: fewest Assign weeks this month first, then over
  // the recent months, then the lightest overall load.
  // Someone with leave days that week only gets Assign if nobody else is free.
  const assignRank = (id) => away(id) * 200 + m(id).slots[0] * 40 + all(id).slots[0] * 4;
  const primary = interns.length
    ? pickBest(ctx, loads, notLast(interns), assignRank)
    : pickBest(ctx, loads, notLast(available), assignRank);

  // Backups: lightest load this month first. Light members lean towards 3rd
  // (the lightest slot); nobody repeats the same backup slot two weeks running
  // if it can be avoided.
  const backupRank = (id, i) =>
    away(id) * 10 +
    m(id).load * (light(id) ? LIGHT_FACTOR : 1) * 4 +
    m(id).slots[i] * 2 +
    (id === prev[i] ? 1 : 0);

  const rest = available.filter(id => id !== primary);
  const second = pickBest(ctx, loads, rest, id => backupRank(id, 1) + (light(id) ? 3 : 0));
  const rest2 = rest.filter(id => id !== second);
  const third = pickBest(ctx, loads, rest2, id => backupRank(id, 2));

  return [primary || null, second || null, third || null];
}

/**
 * Build new plans for the weeks in `rewrite` (a Set of week keys), walking the
 * given weeks in order so every choice sees the load of the ones before it.
 * Weeks that are not rewritten still count towards the load.
 */
export function generatePlans(ctx, weeks, rewrite) {
  const sorted = [...weeks].sort();
  if (!sorted.length) return {};
  const loads = historyLoads(ctx, sorted[0]);
  const month = emptyLoads(ctx.pool);
  const out = {};
  let prev = ctx.plans[addDays(sorted[0], -7)]
    ? effectiveWeek(ctx, addDays(sorted[0], -7)).slots
    : [];

  for (const w of sorted) {
    let slots;
    if (rewrite.has(w)) {
      const available = ctx.pool.filter(id => !awayAllWeek(ctx.leaves, id, w));
      slots = chooseWeek(ctx, loads, month, available, prev, (id) => awayDays(ctx.leaves, id, w));
      out[w] = slots;
    } else if (ctx.plans[w]) {
      slots = effectiveWeek(ctx, w).slots;
      addWeekLoad(ctx, loads, w);
      addWeekLoad(ctx, month, w);
      prev = slots;
      continue;
    } else {
      slots = [];
    }
    addLoad(loads, slots);
    addLoad(month, slots);
    prev = slots;
  }
  return out;
}

/**
 * Rebuild a slot list after some people dropped out: an intern keeps Assign
 * whenever one is available, the remaining backups keep their order, and gaps
 * are filled from `candidates` — light members first, since covering gaps is
 * what they are there for.
 */
function refill(ctx, loads, kept, candidates) {
  let primary = kept.find(id => ctx.catOf(id) === "intern");
  if (!primary) {
    const freeInterns = candidates.filter(id => ctx.catOf(id) === "intern");
    primary = pickStable(ctx, loads, freeInterns) || kept[0] || pickStable(ctx, loads, candidates);
  }
  const backups = kept.filter(id => id !== primary);
  let pool = candidates.filter(id => id !== primary && !backups.includes(id));
  while (backups.length < 2 && pool.length) {
    const light = pool.filter(id => ctx.catOf(id) === "light");
    const pick = pickStable(ctx, loads, light.length ? light : pool);
    backups.push(pick);
    pool = pool.filter(id => id !== pick);
  }
  return [primary || null, backups[0] || null, backups[1] || null];
}

/**
 * The roster for week `w` at WEEK level: the stored plan, with anyone who is
 * no longer active or is away for the entire week replaced. Partial leave is
 * handled per day by effectiveDay().
 *
 * Returns { slots, planned, changes } where changes lists
 *   { id, reason: "leave" | "inactive" } for everyone removed and
 *   { id, cover: true } for everyone brought in.
 */
export function effectiveWeek(ctx, w) {
  const plan = ctx.plans[w];
  const planned = plan ? [...plan.slots] : [null, null, null];
  const usable = (id) => id && ctx.active.has(id) && !awayAllWeek(ctx.leaves, id, w);

  const removed = planned.filter(id => id && !usable(id));
  if (!removed.length) return { slots: planned, planned, changes: [] };

  const changes = removed.map(id => ({ id, reason: ctx.active.has(id) ? "leave" : "inactive" }));
  const kept = planned.filter(usable);
  const candidates = ctx.pool.filter(id => usable(id) && !kept.includes(id));
  const slots = refill(ctx, historyLoadsShallow(ctx, w), kept, candidates);
  slots.forEach(id => { if (id && !planned.includes(id)) changes.push({ id, cover: true }); });
  return { slots, planned, changes };
}

/** Who actually holds each slot on one specific day. */
export function effectiveDay(ctx, w, day) {
  const base = effectiveWeek(ctx, w).slots;
  const here = (id) => id && !awayOn(ctx.leaves, id, day);
  if (base.every(id => !id || here(id))) return base;
  const kept = base.filter(here);
  const candidates = ctx.pool.filter(id => here(id) && ctx.active.has(id) && !kept.includes(id));
  return refill(ctx, historyLoadsShallow(ctx, w), kept, candidates);
}

/**
 * Days inside a week where the line-up differs from the week's own, grouped
 * into runs of identical days for display:
 *   [{ from, to, slots }]   e.g. 03–05 Nov → [Abdullah, Sultan, Faisal]
 */
export function dayRuns(ctx, w) {
  const base = effectiveWeek(ctx, w).slots;
  const same = (a, b) => a.every((x, i) => x === b[i]);
  const out = [];
  weekDays(w).forEach(day => {
    const today = effectiveDay(ctx, w, day);
    if (same(today, base)) return;
    const last = out[out.length - 1];
    if (last && last.to === addDays(day, -1) && same(last.slots, today)) last.to = day;
    else out.push({ from: day, to: day, slots: today });
  });
  return out;
}

/** Deterministic pick (no randomness) so the screen never flickers. */
function pickStable(ctx, loads, ids) {
  if (!ids.length) return null;
  return [...ids].sort((a, b) => score(ctx, loads, a) - score(ctx, loads, b) || String(a).localeCompare(String(b)))[0];
}

/** Planned slots of earlier weeks — cheap, avoids recursion. */
function historyLoadsShallow(ctx, w) {
  const loads = emptyLoads(ctx.pool);
  for (let k = addDays(w, -7 * LOOKBACK_WEEKS); k < w; k = addDays(k, 7)) {
    const p = ctx.plans[k];
    if (p) addLoad(loads, p.slots);
  }
  return loads;
}

/** Per-person totals over a set of weeks (effective roster). */
export function tally(ctx, weeks) {
  const loads = emptyLoads(ctx.pool);
  weeks.forEach(w => { if (ctx.plans[w]) addWeekLoad(ctx, loads, w); });
  return loads;
}

// ── Supabase ───────────────────────────────────────────────────────────
export async function loadRoster() {
  const [m, w, l] = await Promise.all([
    supabase.from("roster_members").select("*"),
    supabase.from("roster_weeks").select("*"),
    supabase.from("roster_leaves").select("*").order("start_date", { ascending: true }),
  ]);
  for (const r of [m, w, l]) if (r.error) throw r.error;

  const members = {};
  (m.data || []).forEach(r => {
    members[r.profile_id] = { category: r.category, inRotation: r.in_rotation };
  });

  const plans = {};
  (w.data || []).forEach(r => {
    plans[r.week_start] = {
      slots: [r.primary_id, r.second_id, r.third_id],
      locked: !!r.locked,
      note: r.note || "",
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    };
  });

  const leaves = (l.data || []).map(r => ({
    id: r.id,
    profileId: r.profile_id,
    start: r.start_date,
    end: r.end_date,
    note: r.note || "",
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  return { members, plans, leaves };
}

/** True when the error means schema_roster.sql has not been run yet. */
export const isMissingSchema = (err) =>
  /roster_|relation .* does not exist|Could not find the table|PGRST205|42P01/i
    .test(String(err?.message || err?.code || err));

export async function saveMember(profileId, patch) {
  const row = { profile_id: profileId, updated_at: new Date().toISOString() };
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.inRotation !== undefined) row.in_rotation = patch.inRotation;
  const { error } = await supabase.from("roster_members").upsert(row, { onConflict: "profile_id" });
  if (error) throw error;
}

export async function saveWeeks(entries, actorId) {
  // entries: [{ week, slots, locked, note }]
  if (!entries.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("roster_weeks").upsert(entries.map(e => ({
    week_start: e.week,
    primary_id: e.slots[0] || null,
    second_id:  e.slots[1] || null,
    third_id:   e.slots[2] || null,
    locked: !!e.locked,
    note: e.note || null,
    updated_by: actorId || null,
    updated_at: now,
  })), { onConflict: "week_start" });
  if (error) throw error;
}

export async function setWeekLocked(week, locked) {
  const { error } = await supabase.from("roster_weeks").update({ locked }).eq("week_start", week);
  if (error) throw error;
}

export async function addLeave({ profileId, start, end, note }) {
  const { error } = await supabase.from("roster_leaves").insert({
    profile_id: profileId, start_date: start, end_date: end, note: note || "",
  });
  if (error) throw error;
}

export async function deleteLeave(id) {
  const { error } = await supabase.from("roster_leaves").delete().eq("id", id);
  if (error) throw error;
}

/** Live updates for the three roster tables. Returns an unsubscribe function. */
export function subscribeRoster(onChange) {
  let timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(onChange, 400); };
  const ch = supabase.channel("htms-roster");
  ["roster_members", "roster_weeks", "roster_leaves"].forEach(table =>
    ch.on("postgres_changes", { event: "*", schema: "public", table }, ping));
  ch.subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(ch); };
}
