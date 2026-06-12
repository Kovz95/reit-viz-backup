// Hand-written from call-site inference
// useWorkspaceState: saves/restores per-key page state in the active workspace.
// useWorkspaceStateEx: extended version (currently same interface; reserved for richer options).
// useUploadedMetricColumns: reads uploaded custom metric column names from the upload context.

import { useEffect, useCallback } from "react";
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
  // Restore on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_PREFIX + key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (opts?.universeSig && parsed?._universeSig !== opts.universeSig) return;
      setState(parsed);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      try {
        const state = getState();
        if (state == null) return;
        const payload =
          opts?.universeSig ? { ...(state as object), _universeSig: opts.universeSig } : state;
        window.sessionStorage.setItem(
          WORKSPACE_STORAGE_PREFIX + key,
          JSON.stringify(payload)
        );
      } catch {
        // quota or SSR — ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.universeSig]);
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
  if (!upload?.sheets) return [];
  const cols = new Set<string>();
  for (const sheet of upload.sheets) {
    for (const metric of sheet.metrics ?? []) {
      if (metric?.name) cols.add(metric.name);
    }
  }
  return Array.from(cols);
}
