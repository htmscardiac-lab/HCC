import { supabase, signupClient, emailFor, passwordProblem } from "./supabase.js";
import * as V from "./vault.js";

/**
 * Data access layer between the React app and Supabase.
 *
 * The UI keeps working with exactly the same shapes it used when everything
 * lived in localStorage. This module is the only place that knows about
 * table names, snake_case columns and foreign keys.
 *
 *   app record  ──rowFromRecord──▶  public.records / public.devices
 *   app record  ◀──recordFromRow──  public.records / public.devices
 */

// ── Profile cache: usernames in the UI, uuids in the database ──────────
let profileById = new Map();   // uuid    → { id, username, full_name, role, is_active }
let profileByName = new Map(); // username → same object

export function cacheProfiles(list) {
  profileById = new Map();
  profileByName = new Map();
  (list || []).forEach(p => {
    profileById.set(p.id, p);
    profileByName.set(String(p.username).toLowerCase(), p);
  });
}

/** username → profile uuid (null when unknown, which the schema allows) */
export const idOf = (username) =>
  username ? (profileByName.get(String(username).toLowerCase())?.id ?? null) : null;

/** profile uuid → username (falls back to a short id so the UI never blanks) */
export const nameOf = (id) =>
  id ? (profileById.get(id)?.username ?? "—") : "";

// ── Authentication ─────────────────────────────────────────────────────

/**
 * Sign in with a username. Returns the session object the app expects:
 *   { id, username, name, role }
 * Throws an Error with a ready-to-display message on failure.
 */
export async function signIn(username, password) {
  const uname = String(username).trim().toLowerCase();

  // Resolve the username to the address the account actually signs in with.
  // They differ whenever an admin has renamed the account, so we never assume
  // the address matches the current username.
  // A narrow server function returns only the sign-in address — signed-out
  // visitors cannot read the profiles table itself.
  let loginEmail = emailFor(uname);
  try {
    const { data: addr } = await supabase.rpc("login_email", { p_username: uname });
    if (addr) loginEmail = addr;
  } catch { /* fall back to the derived address */ }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  });
  if (error) throw error;

  const profile = await fetchMyProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error("This account has no profile. Contact an administrator.");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error("Your account is waiting for administrator activation.");
  }
  return sessionFrom(profile);
}

export const sessionFrom = (p) => ({
  id: p.id, username: p.username, name: p.full_name, role: p.role,
});

export async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Restore a session after a page reload / app restart. */
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) return null;
  try {
    const profile = await fetchMyProfile(data.session.user.id);
    if (!profile || !profile.is_active) { await supabase.auth.signOut(); return null; }
    return sessionFrom(profile);
  } catch { return null; }
}

export const signOut = () => supabase.auth.signOut();

/**
 * Create an account. The very first account ever created becomes an active
 * admin automatically (handled by the handle_new_user trigger); every later
 * one arrives inactive and waits for an admin.
 *
 * The request row carries the reason and email so the admin has context.
 */
export async function requestAccount({ name, username, email, password, reason }) {
  const uname = username.trim().toLowerCase();
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);

  const { data: taken } = await supabase.rpc("username_taken", { p_username: uname });
  if (taken) throw new Error("That username is already taken.");

  const { data, error } = await supabase.auth.signUp({
    email: emailFor(uname),
    password,
    options: { data: { username: uname, full_name: name.trim() } },
  });
  if (error) throw error;

  await supabase.from("signup_requests").insert({
    full_name: name.trim(),
    username: uname,
    email: (email || "").trim() || emailFor(uname),
    reason: (reason || "").trim(),
    status: "pending",
  });

  // A brand-new first user is signed in and active; anyone else must wait.
  const profile = data.user ? await fetchMyProfile(data.user.id).catch(() => null) : null;
  if (profile?.is_active) return { active: true, session: sessionFrom(profile) };
  await supabase.auth.signOut();
  return { active: false };
}

/**
 * Create an account on behalf of an administrator (User Management → Add User).
 *
 * A second, isolated client is used so signing the new account up does not
 * replace the administrator's own session. The account is activated straight
 * away, because an admin created it deliberately.
 */
export async function createUser({ name, username, password, role }) {
  const uname = username.trim().toLowerCase();
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);

  const { data: taken } = await supabase
    .from("profiles").select("id").eq("username", uname).maybeSingle();
  if (taken) throw new Error("That username already exists.");

  const { data, error } = await signupClient().auth.signUp({
    email: emailFor(uname),
    password,
    options: { data: { username: uname, full_name: name.trim() } },
  });
  if (error) throw error;

  const newId = data?.user?.id;
  if (newId) {
    const { error: e2 } = await supabase.from("profiles")
      .update({ is_active: true, role: role || "user", full_name: name.trim() })
      .eq("id", newId);
    if (e2) throw e2;
  }
  return newId;
}

/**
 * Change a password.
 *
 * Your own password is changed directly. Resetting somebody else's needs the
 * service-role key, which must never ship inside the app — so that goes
 * through the admin-reset-password Edge Function, which re-checks on the
 * server that the caller really is an active admin.
 */
export async function changePassword(user, newPassword) {
  const weak = passwordProblem(newPassword);
  if (weak) throw new Error(weak);

  const { data } = await supabase.auth.getUser();
  const isSelf = data?.user && data.user.id === user.id;

  if (isSelf) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return;
  }

  const { data: res, error } = await supabase.functions.invoke("admin-reset-password", {
    body: { userId: user.id, newPassword },
  });

  if (error) {
    // Read whatever the server said so the message names the real problem
    // rather than always blaming deployment.
    const status = error.context?.status;
    let detail = "";
    try {
      const body = await error.context?.clone?.().text?.();
      if (body) {
        try { detail = JSON.parse(body).error || body; } catch { detail = body; }
      }
    } catch { /* body not readable */ }

    if (status === 404) {
      throw new Error(
        "Function not found. In Supabase → Edge Functions, check a function named " +
        "exactly ‘admin-reset-password’ is deployed (see PASSWORD_RESET.md)."
      );
    }
    if (status === 401 || status === 403) {
      throw new Error(detail || "You are not allowed to reset other users' passwords.");
    }
    throw new Error(
      detail
        ? `Reset failed: ${detail}`
        : `Reset failed${status ? ` (HTTP ${status})` : ""}. ` +
          "Check the function logs in Supabase → Edge Functions."
    );
  }
  if (res?.error) throw new Error(res.error);
}

// ── Users / requests administration ────────────────────────────────────

export async function loadProfiles() {
  const { data, error } = await supabase
    .from("profiles").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  cacheProfiles(data);
  return data;
}

/** Profiles in the shape the User Management screen already expects. */
export async function loadUsers() {
  const rows = await loadProfiles();
  return rows.map(p => ({
    id: p.id,
    username: p.username,
    name: p.full_name,
    role: p.role,
    isActive: p.is_active,
  }));
}

/** Requests in the shape the admin panel already expects. */
export async function loadRequests() {
  const { data, error } = await supabase
    .from("signup_requests").select("*").order("requested_at", { ascending: false });
  if (error) return [];   // non-admins are not allowed to read this table
  return (data || []).map(r => ({
    id: r.id,
    name: r.full_name,
    username: r.username,
    reason: r.reason || "",
    status: r.status,
    grantedRole: r.granted_role || "",
    rejectReason: r.reject_reason || "",
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by ? nameOf(r.decided_by) : "",
  }));
}

export async function setProfileActive(id, isActive) {
  const { error } = await supabase.from("profiles")
    .update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function setProfileRole(id, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

/**
 * Edit an account from User Management (admin only): display name, username
 * and role.
 *
 * Renaming works end to end: signIn() resolves a username to the stored
 * auth_email before authenticating, so the person signs in with their NEW
 * username straight away and their password is untouched.
 */
export async function updateProfile(id, { name, username, role }) {
  const patch = {};

  if (username !== undefined) {
    const uname = String(username).trim().toLowerCase();
    if (!uname) throw new Error("Username is required.");
    if (!/^[a-zA-Z0-9._-]+$/.test(uname))
      throw new Error("Username may contain letters, numbers, dot, dash and underscore only.");

    const { data: clash } = await supabase
      .from("profiles").select("id").eq("username", uname).maybeSingle();
    if (clash && clash.id !== id) throw new Error("That username already exists.");
    patch.username = uname;
  }

  if (name !== undefined) patch.full_name = String(name).trim();
  if (role !== undefined) patch.role = role;
  if (!Object.keys(patch).length) return;

  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProfile(id) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function decideRequest(request, decision, { role, rejectReason, actorId } = {}) {
  const patch = {
    status: decision,
    decided_by: actorId ?? null,
    decided_at: new Date().toISOString(),
  };
  if (decision === "approved") patch.granted_role = role || "user";
  if (decision === "rejected") patch.reject_reason = rejectReason || "";

  const { error } = await supabase
    .from("signup_requests").update(patch).eq("id", request.id);
  if (error) throw error;

  if (decision === "approved") {
    const profile = profileByName.get(String(request.username).toLowerCase());
    if (profile) {
      const { error: e2 } = await supabase.from("profiles")
        .update({ is_active: true, role: role || "user" }).eq("id", profile.id);
      if (e2) throw e2;
    }
  }
}

export async function deleteRequest(id) {
  await supabase.from("signup_requests").delete().eq("id", id);
}

// ── Lists: device types, models, CM actions ────────────────────────────

let typeIndex = new Map(); // "MODULE::Name" → device_types.id

export async function loadLists() {
  const [types, models, actions] = await Promise.all([
    supabase.from("device_types").select("*").order("name"),
    supabase.from("device_models").select("*").order("name"),
    supabase.from("cm_actions").select("*").order("sort_order"),
  ]);
  if (types.error) throw types.error;

  typeIndex = new Map();
  const dtypes = { HCC: [], PPM: [], CM: [] };
  const typeKeyById = new Map();
  (types.data || []).forEach(t => {
    const key = `${t.module}::${t.name}`;
    typeIndex.set(key, t.id);
    typeKeyById.set(t.id, key);
    (dtypes[t.module] ||= []).push(t.name);
  });

  const modelMap = {};
  (models.data || []).forEach(m => {
    const key = typeKeyById.get(m.device_type_id);
    if (!key) return;
    (modelMap[key] ||= []).push(m.name);
  });

  return {
    dtypes,
    models: modelMap,
    cmActions: (actions.data || []).map(a => a.name),
  };
}

/** Persist device-type additions, renames and deletions. */
export async function syncDeviceTypes(prev, next) {
  for (const mod of ["HCC", "PPM", "CM"]) {
    const before = prev?.[mod] || [];
    const after = next?.[mod] || [];
    const added = after.filter(n => !before.includes(n));
    const removed = before.filter(n => !after.includes(n));

    if (added.length) {
      const { error } = await supabase.from("device_types")
        .upsert(added.map(name => ({ module: mod, name })), { onConflict: "module,name" });
      if (error) throw error;
    }
    if (removed.length) {
      const { error } = await supabase.from("device_types")
        .delete().eq("module", mod).in("name", removed);
      if (error) throw error;
    }
  }
}

/** Persist model lists, keyed in the app as "MODULE::Device Type". */
export async function syncModels(prev, next) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const typeId = typeIndex.get(key);
    if (!typeId) continue;                 // type not on the server (yet)
    const before = prev?.[key] || [];
    const after = next?.[key] || [];
    const added = after.filter(n => !before.includes(n));
    const removed = before.filter(n => !after.includes(n));

    if (added.length) {
      const { error } = await supabase.from("device_models").upsert(
        added.map(name => ({ device_type_id: typeId, name })),
        { onConflict: "device_type_id,name" }
      );
      if (error) throw error;
    }
    if (removed.length) {
      const { error } = await supabase.from("device_models")
        .delete().eq("device_type_id", typeId).in("name", removed);
      if (error) throw error;
    }
  }
}

/** Persist the CM "Action Taken" dropdown, preserving its order. */
export async function syncCmActions(prev, next) {
  const before = prev || [], after = next || [];
  const removed = before.filter(n => !after.includes(n));
  if (removed.length) {
    const { error } = await supabase.from("cm_actions").delete().in("name", removed);
    if (error) throw error;
  }
  if (after.length) {
    const { error } = await supabase.from("cm_actions").upsert(
      after.map((name, i) => ({ name, sort_order: i + 1 })),
      { onConflict: "name" }
    );
    if (error) throw error;
  }
}

// ── Checklist templates ────────────────────────────────────────────────

export async function loadTemplates() {
  const { data, error } = await supabase
    .from("checklist_templates").select("*").order("created_at");
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.id,
    module: t.module,
    deviceType: t.device_type,
    model: t.model || "",
    name: t.name,
    steps: t.steps || [],
    createdBy: nameOf(t.created_by),
    createdAt: t.created_at,
  }));
}

const templateRow = (t) => ({
  id: t.id,
  module: t.module,
  device_type: t.deviceType,
  device_type_id: typeIndex.get(`${t.module}::${t.deviceType}`) ?? null,
  model: t.model || "",
  name: t.name,
  steps: t.steps || [],
  created_by: idOf(t.createdBy),
});

export async function syncTemplates(prev, next) {
  const prevMap = new Map((prev || []).map(t => [t.id, t]));
  const nextMap = new Map((next || []).map(t => [t.id, t]));

  const removed = [...prevMap.keys()].filter(id => !nextMap.has(id));
  if (removed.length) {
    const { error } = await supabase.from("checklist_templates").delete().in("id", removed);
    if (error) throw error;
  }

  const changed = (next || []).filter(t => {
    const before = prevMap.get(t.id);
    return !before || JSON.stringify(before) !== JSON.stringify(t);
  });
  if (changed.length) {
    const { error } = await supabase.from("checklist_templates").upsert(changed.map(templateRow));
    if (error) throw error;
  }
}

// ── Records and devices ────────────────────────────────────────────────

const orNull = (v) => (v === "" || v === undefined ? null : v);

/**
 * Normalise a timestamp before it is stored.
 *
 * The date-time picker hands back a naive local string ("2026-08-02T12:46:00")
 * with no timezone, while everything generated in code is already UTC. Storing
 * both as-is made a record look like it left before it arrived, because the
 * naive value was read as UTC. Converting here keeps every stored timestamp a
 * true instant, so comparisons and ordering are always correct.
 */
function toIso(v) {
  if (!v) return null;
  const s = String(v);
  // Already carries a zone (…Z or ±hh:mm) — trust it
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  const d = new Date(s);          // naive string is parsed as local time
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function recordRow(r) {
  const base = {
    id: r.id,
    module: r.module,
    created_by: idOf(r.createdBy || r.performedBy),
    created_at: r.createdAt || r.performedAt || new Date().toISOString(),
  };

  if (r.module === "HCC") {
    return {
      ...base,
      // Patient identifiers are encrypted in the browser before saving
      mrn: orNull(await V.seal(r.mrn)),
      patient_name: orNull(await V.seal(r.patientName)),
      patient_type: orNull(r.patientType),
      ward: r.ward || "",
      phone: (await V.seal(r.phone || "")) || "",
      status: orNull(r.status),
      entry_date: toIso(r.entryDate),
      exit_date: toIso(r.exitDate),
      exit_by: idOf(r.exitBy),
      outgoing_at: toIso(r.outgoingAt),
      notes: r.notes || [],
    };
  }

  if (r.module === "PPM") {
    return {
      ...base,
      htm_sn: orNull(r.htmSn),
      device_type: orNull(r.deviceType),
      model: r.model || "",
      location: r.location || "",
      checklist: r.checklist ?? null,
      ppm_status: orNull(r.status),
      cmms_status: r.cmmsStatus || "pending",
    };
  }

  // CM
  return {
    ...base,
    htm_sn: orNull(r.htmSn),
    device_type: orNull(r.deviceType),
    model: r.model || "",
    manufacturer: r.manufacturer || "",
    location: r.location || "",
    reported_problem: orNull(r.reportedProblem),
    found_problem: orNull(r.foundProblem),
    inspection_details: orNull(r.inspectionDetails),
    action_taken: orNull(r.actionTaken),
    parts: r.parts || [],
    cmms_status: r.cmmsStatus || "pending",
  };
}

const deviceRow = (d, recordId, i) => ({
  id: d.id,
  record_id: recordId,
  htm_sn: d.htmSn || "",
  device_type: d.deviceType || "",
  model: d.model || "",
  manufacturer: d.manufacturer || "",
  condition: orNull(d.condition),
  checklist: d.checklist ?? null,
  return_checked: !!d.returnChecked,
  report_checked: !!d.reportChecked,
  inspection_date: orNull(d.inspectionDate),
  inspected_by: idOf(d.inspectedBy),
  sort_order: i,
  // HCC v2 — device_no is never written: the database assigns it
  stage: d.stage || "in_process",
  outgoing_at: toIso(d.outgoingAt),
  owned_by_hospital: d.ownedByHospital ?? null,
  report: d.report ?? null,
  attachments: d.attachments || [],
});

const deviceFromRow = (d) => ({
  id: d.id,
  htmSn: d.htm_sn || "",
  deviceType: d.device_type || "",
  model: d.model || "",
  manufacturer: d.manufacturer || "",
  condition: d.condition || "",
  checklist: d.checklist || null,
  returnChecked: !!d.return_checked,
  reportChecked: !!d.report_checked,
  inspectionDate: d.inspection_date || "",
  inspectedBy: d.inspected_by ? nameOf(d.inspected_by) : "",
  stage: d.stage || "",
  deviceNo: d.device_no || "",
  outgoingAt: d.outgoing_at || "",
  ownedByHospital: d.owned_by_hospital ?? null,
  report: d.report || null,
  attachments: d.attachments || [],
});

async function recordFromRow(row, devices) {
  if (row.module === "HCC") {
    return {
      id: row.id, module: "HCC",
      mrn: (await V.open(row.mrn)) || "",
      patientName: (await V.open(row.patient_name)) || "",
      patientType: row.patient_type || "outpatient",
      ward: row.ward || "",
      phone: (await V.open(row.phone)) || "",
      status: row.status || "in_process",
      entryDate: row.entry_date || row.created_at,
      exitDate: row.exit_date || "",
      exitBy: row.exit_by ? nameOf(row.exit_by) : "",
      outgoingAt: row.outgoing_at || "",
      notes: row.notes || [],
      createdBy: nameOf(row.created_by),
      createdAt: row.created_at,
      devices: (devices || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(deviceFromRow),
    };
  }

  if (row.module === "PPM") {
    return {
      id: row.id, module: "PPM",
      htmSn: row.htm_sn || "",
      deviceType: row.device_type || "",
      model: row.model || "",
      location: row.location || "",
      checklist: row.checklist || null,
      status: row.ppm_status || "",
      cmmsStatus: row.cmms_status || "pending",
      performedBy: nameOf(row.created_by),
      performedAt: row.created_at,
    };
  }

  return {
    id: row.id, module: "CM",
    htmSn: row.htm_sn || "",
    deviceType: row.device_type || "",
    model: row.model || "",
    manufacturer: row.manufacturer || "",
    location: row.location || "",
    reportedProblem: row.reported_problem || "",
    foundProblem: row.found_problem || "",
    inspectionDetails: row.inspection_details || "",
    actionTaken: row.action_taken || "",
    parts: row.parts || [],
    cmmsStatus: row.cmms_status || "pending",
    performedBy: nameOf(row.created_by),
    performedAt: row.created_at,
  };
}

export async function loadRecords() {
  const [rec, dev] = await Promise.all([
    supabase.from("records").select("*").order("created_at", { ascending: false }),
    supabase.from("devices").select("*"),
  ]);
  if (rec.error) throw rec.error;
  if (dev.error) throw dev.error;

  const byRecord = new Map();
  (dev.data || []).forEach(d => {
    if (!byRecord.has(d.record_id)) byRecord.set(d.record_id, []);
    byRecord.get(d.record_id).push(d);
  });

  return Promise.all((rec.data || []).map(r => recordFromRow(r, byRecord.get(r.id) || [])));
}

/**
 * Compare the previous and next record arrays and push only what changed.
 * Devices are diffed across the whole array — an HCC device that moves from
 * one record to another keeps its id and simply changes record_id.
 */
export async function syncRecords(prev, next) {
  const prevMap = new Map((prev || []).map(r => [r.id, r]));
  const nextMap = new Map((next || []).map(r => [r.id, r]));

  const flatten = (list) => {
    const out = new Map();
    (list || []).forEach(r =>
      (r.devices || []).forEach((d, i) => out.set(d.id, { d, recordId: r.id, i }))
    );
    return out;
  };
  const prevDevices = flatten(prev);
  const nextDevices = flatten(next);

  // 1. Deleted records (their devices cascade away with them)
  const removedRecords = [...prevMap.keys()].filter(id => !nextMap.has(id));
  if (removedRecords.length) {
    const { error } = await supabase.from("records").delete().in("id", removedRecords);
    if (error) throw error;
  }

  // 2. New and modified records
  const changed = (next || []).filter(r => {
    const before = prevMap.get(r.id);
    if (!before) return true;
    return JSON.stringify({ ...before, devices: undefined })
        !== JSON.stringify({ ...r, devices: undefined });
  });
  if (changed.length) {
    const { error } = await supabase.from("records").upsert(await Promise.all(changed.map(recordRow)));
    if (error) throw error;
  }

  // 3. Devices that disappeared while their record survived
  const removedDevices = [...prevDevices.keys()].filter(id => {
    if (nextDevices.has(id)) return false;
    return !removedRecords.includes(prevDevices.get(id).recordId);
  });
  if (removedDevices.length) {
    const { error } = await supabase.from("devices").delete().in("id", removedDevices);
    if (error) throw error;
  }

  // 4. New and modified devices
  const changedDevices = [];
  nextDevices.forEach(({ d, recordId, i }, id) => {
    const before = prevDevices.get(id);
    if (!before ||
        before.recordId !== recordId ||
        before.i !== i ||
        JSON.stringify(before.d) !== JSON.stringify(d)) {
      changedDevices.push(deviceRow(d, recordId, i));
    }
  });
  if (changedDevices.length) {
    const { error } = await supabase.from("devices").upsert(changedDevices);
    if (error) throw error;
  }
}

// ── HCC: fault lists, report template, attachments ─────────────────────

const missingTable = (e) => /does not exist|Could not find|PGRST205|42P01/i.test(e?.message || "");

/**
 * Lists used by the defective-device report, as
 *   { parts: { [deviceType]: [{id,name}] },
 *     failures: { common: [{id,name}], byType: { [deviceType]: [{id,name}] } },
 *     recommendations: [{id,name}] }
 * plus the saved report template (null = use the default).
 */
export async function loadHccConfig() {
  const [o, t] = await Promise.all([
    supabase.from("hcc_options").select("*").order("sort_order").order("id"),
    supabase.from("hcc_report_template").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (o.error) { if (missingTable(o.error)) return { missing: true }; throw o.error; }
  const parts = {}, byType = {}, common = [], recommendations = [];
  (o.data || []).forEach(r => {
    const item = { id: r.id, name: r.name };
    if (r.kind === "part") (parts[r.device_type] ||= []).push(item);
    else if (r.kind === "failure") (r.device_type ? (byType[r.device_type] ||= []) : common).push(item);
    else if (r.kind === "recommendation") recommendations.push(item);
  });
  return {
    parts, failures: { common, byType }, recommendations,
    template: t.error ? null : (t.data?.data || null),
  };
}

export async function addHccOption(kind, deviceType, name) {
  const { error } = await supabase.from("hcc_options").insert({
    kind, device_type: deviceType || null, name: String(name).trim(), sort_order: 999,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message || "")) throw new Error("That item is already in the list.");
    throw error;
  }
}

export async function renameHccOption(id, name) {
  const { error } = await supabase.from("hcc_options").update({ name: String(name).trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteHccOption(id) {
  const { error } = await supabase.from("hcc_options").delete().eq("id", id);
  if (error) throw error;
}

export async function saveReportTemplate(data, actorId) {
  const { error } = await supabase.from("hcc_report_template").upsert(
    { id: 1, data, updated_at: new Date().toISOString(), updated_by: actorId || null },
    { onConflict: "id" });
  if (error) throw error;
}

const BUCKET = "hcc-attachments";
const ATTACH_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const ATTACH_MAX = 5 * 1024 * 1024;

/** Upload one attachment for a device (admin). Returns its metadata. */
export async function uploadAttachment(file, recordId, deviceId, byUsername) {
  if (!ATTACH_TYPES.includes(file.type)) throw new Error("Only PDF, JPG, PNG or WEBP files can be attached.");
  if (file.size > ATTACH_MAX) throw new Error("The file is larger than 5 MB.");
  const safe = String(file.name).replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${recordId}/${deviceId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, name: file.name, size: file.size, type: file.type, by: byUsername, at: new Date().toISOString() };
}

export async function deleteAttachmentFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** A short-lived link to open an attachment (5 minutes). */
export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Live updates for the lists and the template. */
export function subscribeHccConfig(onChange) {
  let timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(onChange, 400); };
  const ch = supabase.channel("htms-hcc-config");
  ["hcc_options", "hcc_report_template"].forEach(table =>
    ch.on("postgres_changes", { event: "*", schema: "public", table }, ping));
  ch.subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(ch); };
}

// ── Patient-data encryption ────────────────────────────────────────────

/**
 * The encryption settings, or null when encryption has not been set up.
 * { missing: true } when the database update (vault_config) has not been run.
 */
export async function loadVaultConfig() {
  const { data, error } = await supabase.from("vault_config").select("*").eq("id", 1).maybeSingle();
  if (error) {
    if (/vault_config|does not exist|Could not find|PGRST205|42P01/i.test(error.message || "")) return { missing: true };
    throw error;
  }
  return data ? { salt: data.salt, iterations: data.iterations, verifier: data.verifier } : null;
}

/**
 * Set up or change the team passphrase.
 *
 * Every HCC record's MRN, name and phone is read, decrypted with the current
 * key (or taken as is when still plain), encrypted with the new key, and sent
 * together with the new settings in ONE database transaction (vault_apply).
 * Returns the number of records written.
 */
export async function applyVault(newPassphrase, onProgress = () => {}) {
  const oldKey = V.currentKey();
  onProgress("Preparing the new key…");
  const { config, key } = await V.newConfig(newPassphrase);

  onProgress("Reading records…");
  const { data, error } = await supabase
    .from("records").select("id, mrn, patient_name, phone").eq("module", "HCC");
  if (error) throw error;

  const plain = async (v) => {
    if (!V.isEncrypted(v)) return v;
    if (!oldKey) throw new Error("Unlock with the current passphrase first.");
    return V.decryptWith(oldKey, v);   // throws if any value is unreadable — nothing is changed
  };
  const enc = async (v) => (v === null || v === undefined || v === "" ? v : V.encryptWith(key, v));

  const rows = [];
  for (let i = 0; i < (data || []).length; i++) {
    const r = data[i];
    rows.push({
      id: r.id,
      mrn: await enc(await plain(r.mrn)),
      patient_name: await enc(await plain(r.patient_name)),
      phone: await enc(await plain(r.phone)),
    });
    if (i % 25 === 0) onProgress(`Encrypting ${i + 1} of ${data.length}…`);
  }

  onProgress("Saving…");
  const { data: n, error: e2 } = await supabase.rpc("vault_apply", {
    p_rows: rows, p_salt: config.salt, p_iterations: config.iterations, p_verifier: config.verifier,
  });
  if (e2) throw e2;

  await V.adopt(key, config);
  return n ?? rows.length;
}

// ── Realtime ───────────────────────────────────────────────────────────

/**
 * Watch every shared table and call onChange (debounced) whenever another
 * workstation writes something. Returns an unsubscribe function.
 */
export function subscribeAll(onChange) {
  let timer = null;
  const ping = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };

  const channel = supabase.channel("htms-sync");
  ["records", "devices", "checklist_templates", "device_types",
   "device_models", "cm_actions", "profiles", "signup_requests", "vault_config"]
    .forEach(table =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, ping)
    );
  channel.subscribe();

  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}
