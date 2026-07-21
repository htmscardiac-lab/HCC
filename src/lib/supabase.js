import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client.
 *
 * Credentials come from .env at build time:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_KEY=sb_publishable_xxx
 *
 * The publishable key is safe to ship — every table is protected by
 * Row Level Security policies defined in schema.sql.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  console.error(
    "Supabase credentials are missing. Create a .env file with " +
    "VITE_SUPABASE_URL and VITE_SUPABASE_KEY, then rebuild."
  );
}

export const supabase = createClient(url || "http://localhost", key || "anon", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * A throwaway client used only when an administrator creates an account for
 * somebody else. Signing a new user up replaces the caller's session, so this
 * one keeps its own storage and never persists — the admin stays signed in.
 */
let _signup = null;
export function signupClient() {
  if (!_signup) {
    _signup = createClient(url || "http://localhost", key || "anon", {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "htms-signup" },
    });
  }
  return _signup;
}

/**
 * The app signs in with usernames, not email addresses — staff do not all
 * have mailboxes. Supabase Auth requires an email, so every username is
 * mapped to a synthetic address on this domain.
 */
export const AUTH_DOMAIN = "htms.local";
export const emailFor = (username) =>
  `${String(username).trim().toLowerCase()}@${AUTH_DOMAIN}`;

/** Turn a Supabase error into a short message suitable for the UI. */
export function friendlyError(error) {
  if (!error) return "";
  const m = String(error.message || error);
  if (/Invalid login credentials/i.test(m)) return "Invalid username or password.";
  if (/Failed to fetch|NetworkError/i.test(m))
    return "Cannot reach the server. Check the network connection, then try again.";
  if (/User already registered/i.test(m)) return "That username is already taken.";
  if (/Email not confirmed/i.test(m))
    return "Email confirmation is still switched on in Supabase. " +
           "Turn it off under Authentication → Sign In / Providers → Email.";
  if (/row-level security|permission denied/i.test(m))
    return "You do not have permission to do that. Ask an administrator.";
  if (/Password should be/i.test(m)) return "Password must be at least 6 characters.";
  if (/Email address .* is invalid/i.test(m))
    return "The server rejected the generated address. Contact the administrator.";
  return m;
}
