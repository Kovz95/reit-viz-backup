// Hand-written from call-site inference
// excludedTickers: localStorage-backed set of tickers excluded from the universe.
// Supports namespaced keys ("workbook" or "global").

import { useState, useEffect, useCallback } from "react";

function storageKey(namespace: string): string {
  return `reit-viz:excluded-tickers:${namespace}:v1`;
}

function loadExcluded(namespace: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(namespace));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed as string[]);
  } catch {
    return new Set();
  }
}

function saveExcluded(namespace: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(namespace), JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent(`reit-viz:excluded:${namespace}:changed`));
  } catch {
    // quota exceeded — ignore
  }
}

/** Hook returning the current excluded set for a given namespace. */
export function useExcludedTickers(namespace: string): Set<string> {
  const [excluded, setExcluded] = useState<Set<string>>(() =>
    loadExcluded(namespace)
  );

  useEffect(() => {
    const eventName = `reit-viz:excluded:${namespace}:changed`;
    function handler() {
      setExcluded(loadExcluded(namespace));
    }
    function storageHandler(e: StorageEvent) {
      if (e.key === storageKey(namespace)) {
        setExcluded(loadExcluded(namespace));
      }
    }
    window.addEventListener(eventName, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(eventName, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, [namespace]);

  return excluded;
}

/** Adds a ticker to the excluded set for the given namespace. */
export function excludeTicker(namespace: string, ticker: string): void {
  const set = loadExcluded(namespace);
  set.add(ticker.toUpperCase());
  saveExcluded(namespace, set);
}

/** Removes a ticker from the excluded set. */
export function restoreExcludedTicker(namespace: string, ticker: string): void {
  const set = loadExcluded(namespace);
  set.delete(ticker.toUpperCase());
  saveExcluded(namespace, set);
}

/** Clears all excluded tickers for the given namespace. */
export function restoreAllExcluded(namespace: string): void {
  saveExcluded(namespace, new Set());
}
