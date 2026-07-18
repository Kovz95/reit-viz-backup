// Hand-written from call-site inference
// useWorkspaceState: saves/restores per-key page state in the active workspace.
// useWorkspaceStateEx: extended version (currently same interface; reserved for richer options).
// useUploadedMetricColumns: reads uploaded custom metric column names from the upload context.

import { useEffect, useCallback, useRef } from "react";
import { useUpload } from "@/lib/uploadContext";

const WORKSPACE_STORAGE_PREFIX = "reit-viz:workspace:";

// ─── useWorkspaceState ────────────────────────────────────────────────────────

/**
 * Saves and restores a page's state object to/from the current workspace slot
 * in sessionStorage. Called once per page with stable callbacks.
 *
 * @param key        Unique page/tab identifier (e.g. "pair-optimizer")
 * @param getState   Called on unmount — returns current page state to persist
 * @param setState   Called on mount — receives persisted state to restore
 * @param opts       Optional extra options (e.g. universeSig for cache-busting)
 */
export function useWorkspaceState(
  key: string,
  getState: () => unknown,
  setState: (state: unknown) => void,
  opts?: { universeSig?: string; resultFields?: string[] }
): void {
  const universeSig = opts?.universeSig;
  // Keep the latest getState so the pagehide/unmount save always reads current state.
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  // Restore on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_PREFIX + key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (universeSig && parsed?._universeSig !== universeSig) return;
      setState(parsed);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const state = getStateRef.current();
      if (state == null) return;
      const payload = universeSig ? { ...(state as object), _universeSig: universeSig } : state;
      window.sessionStorage.setItem(WORKSPACE_STORAGE_PREFIX + key, JSON.stringify(payload));
    } catch {
      // quota or SSR — ignore
    }
  }, [key, universeSig]);

  // Persist on unmount (in-app tab switch) AND on pagehide (hard refresh / tab
  // close) — a full page reload does not run React unmount cleanup, so the
  // pagehide listener is what makes state survive a refresh.
  useEffect(() => {
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [save]);
}

/**
 * Extended workspace state hook — currently identical to useWorkspaceState.
 * Reserved for richer workspace management features.
 */
export function useWorkspaceStateEx(
  key: string,
  getState: () => unknown,
  setState: (state: unknown) => void,
  opts?: { universeSig?: string; resultFields?: string[] }
): void {
  return useWorkspaceState(key, getState, setState, opts);
}

// ─── useUploadedMetricColumns ─────────────────────────────────────────────────

/**
 * Returns the list of custom metric column names from the current workbook upload.
 */
export function useUploadedMetricColumns(): string[] {
  const upload = useUpload();
  const sheets = (upload as any)?.sheets ?? upload?.fundamentalSheets ?? [];
  if (!sheets || !sheets.length) return [];
  const cols = new Set<string>();
  for (const sheet of sheets) {
    for (const metric of sheet.metrics ?? []) {
      if (metric?.name) cols.add(metric.name);
    }
  }
  return Array.from(cols);
}
