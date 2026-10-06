// Lightweight in-memory log of recent API calls, surfaced by the bottom
// activity bar (mirrors the "API Responses" bar in the CrestX reference UI).
const MAX_ENTRIES = 50;
const entries = [];
const listeners = new Set();

export function recordApiCall({ txnId, ok, ms }) {
  entries.unshift({ txnId, ok, ms, ts: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  listeners.forEach((fn) => fn());
}

export function getEntries() { return entries; }
export function clearEntries() { entries.length = 0; listeners.forEach((fn) => fn()); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
