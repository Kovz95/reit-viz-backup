// Hand-written from call-site inference (Universe.tsx)
// localStorage-backed classification override store.
// Overrides allow users to re-classify tickers without modifying the source data.

import { useState, useEffect } from "react";

const STORAGE_KEY = "reit-viz:classification-overrides:v1";
const CHANGE_EVENT = "reit-viz:classification-overrides:changed";

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

function loadOverrides(): OverridesMap {
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
