import { useState, useRef, useCallback } from "react";
import { noteWriteStart, noteWriteEnd } from "./syncState.js";

/**
 * A piece of shared state that lives in Supabase.
 *
 * It behaves like useState — including functional updates — but every change is
 * diffed against the previous value and pushed to the server. The screens keep
 * calling setRecords(rs => …) without knowing anything about the database.
 *
 *   const [records, setRecords, resetRecords] = useSynced([], syncRecords, onError);
 *
 * Reliability:
 *  · Writes are SERIALISED — each push waits for the previous one, so two rapid
 *    edits can never reach the server out of order and overwrite each other.
 *  · Transient network failures (the hospital Wi-Fi dropping for a moment) are
 *    RETRIED a few times before giving up.
 *  · On a real failure the caller is told, and it resyncs from the server so the
 *    screen always ends up showing the truth rather than a lost edit.
 *
 * The third returned element replaces the value without writing anything back —
 * used when a realtime event says the server has newer data.
 */

const TRANSIENT = /Failed to fetch|NetworkError|network|timeout|fetch failed|Load failed|ECONN/i;

async function pushWithRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = TRANSIENT.test(String(err?.message || err));
      if (!transient || i === tries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));   // 0.5s, 1s backoff
    }
  }
  throw lastErr;
}

export function useSynced(initial, syncFn, onError) {
  const [value, setValue] = useState(initial);
  const ref   = useRef(initial);
  const queue = useRef(Promise.resolve());

  const update = useCallback((updater) => {
    const prev = ref.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    if (next === prev) return;

    // Optimistic: show it immediately.
    ref.current = next;
    setValue(next);

    // Serialise the push behind any earlier ones.
    noteWriteStart();
    queue.current = queue.current.then(async () => {
      try {
        await pushWithRetry(() => syncFn(prev, next));
      } catch (err) {
        // Let the app surface the error and resync from the server (truth).
        onError?.(err);
      } finally {
        noteWriteEnd();
      }
    });
  }, [syncFn, onError]);

  const reset = useCallback((v) => { ref.current = v; setValue(v); }, []);

  return [value, update, reset];
}
