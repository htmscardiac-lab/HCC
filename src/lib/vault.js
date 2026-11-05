/**
 * Patient-data encryption ("vault").
 *
 * Patient MRN, name and phone are encrypted IN THE BROWSER before they are
 * saved, so the database only ever holds unreadable text. They are decrypted
 * again in the browser after loading. Nobody with access to the database —
 * a leaked backup, the hosting provider, the dashboard — can read them.
 *
 *   team passphrase ──PBKDF2 (600,000 rounds)──▶ AES-256-GCM key
 *   "Ahmed Saleh"   ──AES-256-GCM──▶  "enc:v1:kJ8x2Qp9vL…"
 *
 * The passphrase is never stored or sent anywhere. Only a random salt and a
 * "verifier" (a known phrase encrypted with the key) are stored, so a wrong
 * passphrase is caught at once instead of producing garbage.
 *
 * The derived key is kept in memory and in this tab's sessionStorage, so a
 * page refresh does not ask again; closing the tab forgets it.
 *
 * Values saved before encryption was switched on are plain text; they are
 * still read normally (anything without the "enc:v1:" prefix is returned as is).
 */

const PREFIX = "enc:v1:";
const VERIFY_TEXT = "HTMS-VAULT-OK";
export const ITERATIONS = 600000;
const SS_KEY = "htms_vault_key";

let key = null;          // CryptoKey while unlocked
let keySalt = null;      // which configuration the key belongs to
let required = false;    // true once encryption is set up for this database

// ── base64 helpers ─────────────────────────────────────────────────────
const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// ── primitives ─────────────────────────────────────────────────────────
export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export const isEncrypted = (v) => typeof v === "string" && v.startsWith(PREFIX);

export async function encryptWith(k, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(String(text)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return PREFIX + toB64(out);
}

export async function decryptWith(k, value) {
  if (!isEncrypted(value)) return value;          // plain (pre-encryption) value
  const raw = fromB64(value.slice(PREFIX.length));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, k, raw.slice(12));
  return new TextDecoder().decode(pt);
}

// ── state ──────────────────────────────────────────────────────────────
export const isRequired = () => required;
export const isUnlocked = () => !!key;
export const currentSalt = () => keySalt;
export const currentKey = () => key;

/** Tell the vault whether this database has encryption switched on. */
export function setRequired(on) { required = !!on; }

async function remember(k, salt) {
  key = k; keySalt = salt;
  try {
    const raw = await crypto.subtle.exportKey("raw", k);
    sessionStorage.setItem(SS_KEY, JSON.stringify({ salt, raw: toB64(raw) }));
  } catch { /* storage unavailable — key stays in memory only */ }
}

export function lock() {
  key = null; keySalt = null;
  try { sessionStorage.removeItem(SS_KEY); } catch {}
}

async function verify(k, config) {
  try { return (await decryptWith(k, config.verifier)) === VERIFY_TEXT; }
  catch { return false; }
}

/** Unlock with the team passphrase. Throws on a wrong passphrase. */
export async function unlock(passphrase, config) {
  const k = await deriveKey(passphrase, config.salt, config.iterations || ITERATIONS);
  if (!(await verify(k, config))) throw new Error("Incorrect team passphrase.");
  await remember(k, config.salt);
}

/** Re-use the key saved in this tab, if it still matches the configuration. */
export async function restore(config) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SS_KEY) || "null");
    if (!saved || saved.salt !== config.salt) return false;
    const k = await crypto.subtle.importKey("raw", fromB64(saved.raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    if (!(await verify(k, config))) return false;
    key = k; keySalt = config.salt;
    return true;
  } catch { return false; }
}

/** A fresh configuration (new random salt) for a new passphrase. */
export async function newConfig(passphrase) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await deriveKey(passphrase, salt, ITERATIONS);
  const verifier = await encryptWith(k, VERIFY_TEXT);
  return { config: { salt, iterations: ITERATIONS, verifier }, key: k };
}

/** Switch this tab to a newly applied configuration. */
export async function adopt(k, config) { required = true; await remember(k, config.salt); }

// ── field helpers used by the data layer ───────────────────────────────
/** Encrypt a value for saving (empty stays empty). */
export async function seal(value) {
  if (value === null || value === undefined || value === "") return value;
  if (!required) return value;
  if (!key) throw new Error("Patient data is locked. Enter the team passphrase, then try again.");
  return encryptWith(key, value);
}

/** Decrypt a loaded value (plain values pass through). */
export async function open(value) {
  if (!isEncrypted(value)) return value;
  if (!key) return "🔒";
  try { return await decryptWith(key, value); }
  catch { return "⚠ unreadable"; }
}

/** Passphrase rule: long enough to resist guessing. */
export function passphraseProblem(p) {
  const s = String(p || "");
  if (s.length < 16) return "Use at least 16 characters — e.g. five random words joined by dashes.";
  if (new Set(s).size < 8) return "Too repetitive — use several different words.";
  return "";
}
