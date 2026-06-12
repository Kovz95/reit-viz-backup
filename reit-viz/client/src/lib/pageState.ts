// Hand-written from call-site inference
// usePageState: saves/restores page state to sessionStorage on mount/unmount.
// Used by DataExplorer, ShortInterest, Universe, Valuation.

import { useEffect } from "react";

const PAGE_STATE_PREFIX = "reit-viz:page:";

/**
 * Persists and restores page state via sessionStorage.
 *
 * @param key          Unique identifier for this page's state slot.
 * @param getState     Called on unmount — returns the state object to save.
 * @param restoreState Called on mount — receives the saved state object.
 */
export function usePageState(
  key: string,
  getState: () => unknown,
  restoreState: (s: unknown) => void
): void {
  // Restore on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(PAGE_STATE_PREFIX + key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      restoreState(parsed);
    } catch {
      // ignore parse errors
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
        window.sessionStorage.setItem(PAGE_STATE_PREFIX + key, JSON.stringify(state));
      } catch {
        // quota exceeded or SSR — ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
