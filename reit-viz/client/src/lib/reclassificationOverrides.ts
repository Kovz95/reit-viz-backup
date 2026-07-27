// Hand-written from call-site inference (Universe.tsx)
// localStorage-backed classification override store.
// Overrides allow users to re-classify tickers without modifying the source data.

import { useState, useEffect } from "react";

export const OVERRIDES_STORAGE_KEY = "reit-viz:classification-overrides:v1";
export const OVERRIDES_CHANGE_EVENT = "reit-viz:classification-overrides:changed";
const STORAGE_KEY = OVERRIDES_STORAGE_KEY;
const CHANGE_EVENT = OVERRIDES_CHANGE_EVENT;

export type ClassificationField =
  | "economy"
  | "sector"
  | "subsector"
  | "industryGroup"
  | "industry"
  | "subindustry";

export type ClassificationOverride = Partial<Record<ClassificationField, string>>;

/** Map from ticker → override record. */
export type OverridesMap = Record<string, ClassificationOverride>;

export function loadOverrides(): OverridesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OverridesMap;
  } catch {
    return {};
  }
}

function saveOverridesLocal(overrides: OverridesMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // quota exceeded — ignore
  }
}

// ── Server sync ──
// localStorage is only a per-browser cache; the server copy
// (/api/classification-overrides → DATA_DIR/classification-overrides.json)
// is the durable record, so reclassifications survive storage clears and
// follow the user across browsers/devices.
//
// Per-edit syncs are PER-TICKER upserts/deletes, serialized through one
// promise chain. A full-map "replace" push is reserved for the explicit
// Import-replace / Reset actions — pushing the whole local map on every
// edit meant any client with a stale or empty cache (fresh profile, edit
// racing the initial hydrate, out-of-order concurrent POSTs) replaced the
// server file with its own tiny snapshot and destroyed everyone's overrides.

let syncChain: Promise<void> = Promise.resolve();
function queueSync(fn: () => Promise<unknown>): void {
  syncChain = syncChain.then(async () => {
    try {
      await fn();
    } catch {
      /* offline / legacy server — localStorage-only mode */
    }
  });
}

/** Tickers touched this session — their local records win over the hydrate. */
const sessionEdited = new Set<string>();
/** Set by explicit Reset / Import-replace: the local map is the intended
 *  full state, so a late-arriving hydrate must not resurrect the server copy. */
let localIsAuthoritative = false;

function syncTickerToServer(ticker: string): void {
  sessionEdited.add(ticker);
  queueSync(() => {
    // Read at send time so rapid edits to one ticker collapse to the latest.
    const record = loadOverrides()[ticker];
    const base = `/api/classification-overrides/${encodeURIComponent(ticker)}`;
    if (record && Object.keys(record).length > 0) {
      return fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: record }),
        keepalive: true,
      });
    }
    return fetch(`${base}/delete`, { method: "POST", keepalive: true });
  });
}

let serverHydrateStarted = false;
async function hydrateOverridesFromServer(): Promise<void> {
  if (typeof window === "undefined" || serverHydrateStarted) return;
  serverHydrateStarted = true;
  try {
    const res = await fetch("/api/classification-overrides");
    if (!res.ok) return;
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<")) return; // SPA fallback (legacy server)
    const server = JSON.parse(text)?.overrides;
    if (!server || typeof server !== "object" || Array.isArray(server)) return;
    if (localIsAuthoritative) return; // user reset/replaced while this was in flight
    const local = loadOverrides();
    // Server copy wins, except tickers edited this session (their pushes are
    // already queued, so local is newer for those).
    const merged: OverridesMap = { ...(server as OverridesMap) };
    for (const t of sessionEdited) {
      if (local[t]) merged[t] = local[t];
      else delete merged[t];
    }
    saveOverridesLocal(merged);
    if (Object.keys(server as OverridesMap).length === 0) {
      // Server empty: seed the durable copy from this browser's cache via
      // non-destructive per-ticker upserts.
      for (const t of Object.keys(merged)) syncTickerToServer(t);
    }
  } catch {
    /* offline / legacy server — localStorage-only mode */
  }
}

if (typeof window !== "undefined") {
  void hydrateOverridesFromServer();
}

/** Hook returning the current overrides map. Re-renders on changes. */
export function useReclassificationOverrides(): OverridesMap {
  const [overrides, setOverrides] = useState<OverridesMap>(() => loadOverrides());

  useEffect(() => {
    function handler() {
      setOverrides(loadOverrides());
    }
    function storageHandler(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setOverrides(loadOverrides());
    }
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  return overrides;
}

/**
 * Commits a single field override for a ticker.
 * If `newValue` equals `originalValue`, the field override is cleared.
 */
export function commitClassificationOverride(
  ticker: string,
  field: ClassificationField,
  newValue: string,
  originalValue: string
): void {
  const overrides = loadOverrides();
  if (!overrides[ticker]) overrides[ticker] = {};

  if (newValue === originalValue) {
    delete overrides[ticker][field];
    if (Object.keys(overrides[ticker]).length === 0) delete overrides[ticker];
  } else {
    overrides[ticker][field] = newValue;
  }
  saveOverridesLocal(overrides);
  syncTickerToServer(ticker);
}

/**
 * Imports a batch of overrides, either merging with or replacing existing ones.
 */
export function importClassificationOverrides(
  incoming: OverridesMap,
  mode: "merge" | "replace" = "merge"
): void {
  const existing = mode === "replace" ? {} : loadOverrides();
  for (const [ticker, override] of Object.entries(incoming)) {
    if (!existing[ticker]) existing[ticker] = {};
    Object.assign(existing[ticker], override);
  }
  saveOverridesLocal(existing);
  for (const t of Object.keys(incoming)) sessionEdited.add(t);
  if (mode === "replace") {
    localIsAuthoritative = true;
    const snapshot = { ...existing };
    queueSync(() =>
      fetch("/api/classification-overrides/_bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: snapshot, mode: "replace" }),
      })
    );
  } else {
    // Push the post-merge records (local merge is field-level; the server's
    // merge is ticker-level, so send the already-merged result per ticker).
    const payload: OverridesMap = {};
    for (const t of Object.keys(incoming)) {
      if (existing[t]) payload[t] = existing[t];
    }
    queueSync(() =>
      fetch("/api/classification-overrides/_bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: payload, mode: "merge" }),
      })
    );
  }
}

/** Removes all overrides for a single ticker. */
export function revertClassificationOverride(ticker: string): void {
  const overrides = loadOverrides();
  delete overrides[ticker];
  saveOverridesLocal(overrides);
  syncTickerToServer(ticker);
}

/** Clears all overrides globally. */
export function resetAllClassificationOverrides(): void {
  localIsAuthoritative = true;
  saveOverridesLocal({});
  queueSync(() =>
    fetch("/api/classification-overrides/_reset", { method: "POST" })
  );
}
