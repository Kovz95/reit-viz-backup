// localStorage-backed results state for optimizer runs.
//
// usePersistedState JSON.stringifies its ENTIRE value on every set — fine for
// small settings, but optimizer results at universe scale run to tens of MB
// (720 configs × 75 tickers with summaries/profiles), and the incremental
// flushes during a run re-serialized the whole growing array each time. The
// 2026-08-31 prod stress test measured 5s+ main-thread stalls from exactly
// that (the compute itself was already off-thread in workers).
//
// This hook never touches storage on set (except a cheap write-through for
// empty arrays, preserving "clear results" semantics). The page calls
// persist() once when a run completes; the stored copy passes through `slim`
// first — drop profiles/priceContext, cap configs — so restore-on-reload
// keeps working without ever serializing the heavy payload.
import { useCallback, useRef, useState } from "react";

export function useRunResultsState<T>(
  key: string,
  slim: (rows: T[]) => unknown,
): {
  results: T[];
  setResults: (next: T[] | ((prev: T[]) => T[])) => void;
  /** Slim + write to localStorage. Call once, at run completion (or pass the
   *  final array explicitly if state hasn't flushed yet). */
  persistResults: (rows?: T[]) => void;
  /** Last slimmed persisted copy — use this (not the live array) in workspace
   *  serializeState so mid-run autosaves never serialize the heavy payload. */
  persistedSnapshot: () => unknown;
} {
  const [results, setState] = useState<T[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  });
  const latestRef = useRef(results);
  const snapshotRef = useRef<unknown>(results);
  const slimRef = useRef(slim);
  slimRef.current = slim;

  const setResults = useCallback((next: T[] | ((prev: T[]) => T[])) => {
    setState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T[]) => T[])(prev) : next;
      latestRef.current = resolved;
      if (resolved.length === 0) {
        snapshotRef.current = resolved;
        try { window.localStorage.setItem(key, "[]"); } catch { /* quota */ }
      }
      return resolved;
    });
  }, [key]);

  const persistResults = useCallback((rows?: T[]) => {
    const src = rows ?? latestRef.current;
    const slimmed = slimRef.current(src);
    snapshotRef.current = slimmed;
    try {
      window.localStorage.setItem(key, JSON.stringify(slimmed));
    } catch { /* quota exceeded — the restore just misses this run */ }
  }, [key]);

  const persistedSnapshot = useCallback(() => snapshotRef.current ?? [], []);

  return { results, setResults, persistResults, persistedSnapshot };
}

/**
 * Generic slimmer for optimizer ticker-result rows. Handles every page's
 * shape defensively: drops per-row priceContext, strips profile arrays from
 * configs[].categories[] / configs[].directions[] (TVA) / topCombos[] (Combo)
 * / results[] window profiles (ZScore), and caps configs per row by bestScore.
 */
/** Slimmer for grid-search results (ROC Grid Search / MACrossover Find Best
 *  Combo): keeps combo summaries/scores, drops per-signal date lists and
 *  profile arrays. */
export function slimGridRows(rows: any[]): any[] {
  return rows.map((r) => ({
    ...r,
    topCombos: Array.isArray(r?.topCombos)
      ? r.topCombos.map((c: any) => ({ ...c, bullDates: undefined, bearDates: undefined, profiles: undefined }))
      : r?.topCombos,
  }));
}

export function slimOptimizerRows(rows: any[], opts?: { maxConfigs?: number }): any[] {
  const maxConfigs = opts?.maxConfigs ?? 0;
  return rows.map((r) => {
    const out: any = { ...r };
    delete out.priceContext;
    if (Array.isArray(out.configs)) {
      let cfgs = out.configs.map((cfg: any) => {
        let c = cfg;
        if (Array.isArray(c?.categories)) {
          c = { ...c, categories: c.categories.map((cat: any) => ({ ...cat, profiles: undefined })) };
        }
        if (Array.isArray(c?.directions)) {
          c = { ...c, directions: c.directions.map((d: any) => ({ ...d, profiles: undefined })) };
        }
        return c;
      });
      if (maxConfigs > 0 && cfgs.length > maxConfigs) {
        cfgs = [...cfgs]
          .sort((a: any, b: any) => (b?.bestScore ?? 0) - (a?.bestScore ?? 0))
          .slice(0, maxConfigs);
      }
      out.configs = cfgs;
    }
    if (Array.isArray(out.results)) {
      out.results = out.results.map((w: any) => ({
        ...w,
        buyProfiles: undefined,
        sellProfiles: undefined,
        buyRevProfiles: undefined,
        sellRevProfiles: undefined,
        profiles: undefined,
      }));
    }
    if (Array.isArray(out.topCombos)) {
      out.topCombos = out.topCombos.map((c: any) => ({ ...c, profiles: undefined }));
    }
    return out;
  });
}
