/**
 * Tiny shared coordinator between the write path (useSynced) and the realtime
 * refresh (App.reload).
 *
 * It exists to stop the auto-refresh from overwriting local edits that are
 * still on their way to the server — the main cause of an entry appearing to
 * "not save".
 */
export const syncState = { pending: 0, lastWriteAt: 0 };

export const noteWriteStart = () => { syncState.pending += 1; };

export const noteWriteEnd = () => {
  syncState.pending = Math.max(0, syncState.pending - 1);
  syncState.lastWriteAt = Date.now();
};

/** True when nothing is being written and the last write settled a while ago. */
export const writesSettled = (quietMs = 1500) =>
  syncState.pending === 0 && Date.now() - syncState.lastWriteAt > quietMs;
