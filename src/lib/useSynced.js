import { useState, useRef, useCallback } from "react";

/**
 * A piece of shared state that lives in Supabase.
 *
 * It behaves exactly like useState — including functional updates — but every
 * change is also diffed against the previous value and pushed to the server.
 * That lets all the existing screens keep calling setRecords(rs => …) without
 * knowing anything about the database.
 *
 *   const [records, setRecords, resetRecords] = useSynced([], syncRecords, onError);
 *
 * The third element replaces the value without writing anything back — used
 * when a realtime event tells us the server has newer data.
 */
export function useSynced(initial, syncFn, onError) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);

  const update = useCallback((updater) => {
    const prev = ref.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    if (next === prev) return;
    ref.current = next;
    setValue(next);
    Promise.resolve()
      .then(() => syncFn(prev, next))
      .catch(err => {
        // Roll back so the screen never shows something the server rejected
        ref.current = prev;
        setValue(prev);
        onError?.(err);
      });
  }, [syncFn, onError]);

  const reset = useCallback((v) => { ref.current = v; setValue(v); }, []);

  return [value, update, reset];
}
