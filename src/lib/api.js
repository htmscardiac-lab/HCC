import { supabase, signupClient, emailFor } from "./supabase.js";

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
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailFor(username),
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

  const { data: taken } = await supabase
    .from("profiles").select("id").eq("username", uname).maybeSingle();
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
 * Supabase only lets an account change its own password from the browser —
 * resetting somebody else's needs a service-role key, which must never ship
 * inside the app.
 */
export async function changePassword(user, newPassword) {
  const { data } = await supabase.auth.getUser();
  if (!data?.user || data.user.id !== user.id) {
    throw new Error(
      "For security, only the account holder can change their own password. " +
      "Ask them to sign in and change it, or remove the account and create it again."
    );
  }
  if (String(newPassword).length < 6) throw new Error("Password should be at least 6 characters.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
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

function recordRow(r) {
  const base = {
    id: r.id,
    module: r.module,
    created_by: idOf(r.createdBy || r.performedBy),
    created_at: r.createdAt || r.performedAt || new Date().toISOString(),
  };

  if (r.module === "HCC") {
    return {
      ...base,
      mrn: orNull(r.mrn),
      patient_name: orNull(r.patientName),
      patient_type: orNull(r.patientType),
      ward: r.ward || "",
      phone: r.phone || "",
      status: orNull(r.status),
      entry_date: orNull(r.entryDate),
      exit_date: orNull(r.exitDate),
      exit_by: idOf(r.exitBy),
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
});

function recordFromRow(row, devices) {
  if (row.module === "HCC") {
    return {
      id: row.id, module: "HCC",
      mrn: row.mrn || "",
      patientName: row.patient_name || "",
      patientType: row.patient_type || "outpatient",
      ward: row.ward || "",
      phone: row.phone || "",
      status: row.status || "in_process",
      entryDate: row.entry_date || row.created_at,
      exitDate: row.exit_date || "",
      exitBy: row.exit_by ? nameOf(row.exit_by) : "",
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

  return (rec.data || []).map(r => recordFromRow(r, byRecord.get(r.id) || []));
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
    const { error } = await supabase.from("records").upsert(changed.map(recordRow));
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
   "device_models", "cm_actions", "profiles", "signup_requests"]
    .forEach(table =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, ping)
    );
  channel.subscribe();

  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}
