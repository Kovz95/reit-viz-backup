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

function saveOverrides(overrides: OverridesMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // quota exceeded — ignore
  }
  pushOverridesToServer(overrides);
}

// ── Server sync ──
// localStorage is only a per-browser cache; the server copy
// (/api/classification-overrides → DATA_DIR/classification-overrides.json)
// is the durable record, so reclassifications survive storage clears and
// follow the user across browsers/devices. Last write wins.

function pushOverridesToServer(overrides: OverridesMap): void {
  try {
    // The server's existing bulk route; "replace" mirrors the full local map.
    void fetch("/api/classification-overrides/_bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides, mode: "replace" }),
    }).catch(() => {});
  } catch {
    /* offline / legacy server — localStorage-only mode */
  }
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
    if (server && typeof server === "object" && !Array.isArray(server) && Object.keys(server).length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(server));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } else {
      // Server empty: migrate any existing browser-local overrides up so the
      // durable copy is seeded from what this browser already has.
      const local = loadOverrides();
      if (Object.keys(local).length > 0) pushOverridesToServer(local);
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
  saveOverrides(overrides);
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
  saveOverrides(existing);
}

/** Removes all overrides for a single ticker. */
export function revertClassificationOverride(ticker: string): void {
  const overrides = loadOverrides();
  delete overrides[ticker];
  saveOverrides(overrides);
}

/** Clears all overrides globally. */
export function resetAllClassificationOverrides(): void {
  saveOverrides({});
}
