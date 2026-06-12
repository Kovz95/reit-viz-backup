// Hand-written from call-site inference
// navigateToPairs: navigates to the /pairs page with tickerA and tickerB pre-set.
// useRouterState: provides a simple router-state cache for passing data between pages.
// navigateToTicker: re-exported here for pages that import it from navigateToPairs.

import { useRef } from "react";

// ─── Router state cache ────────────────────────────────────────────────────────
// A simple in-memory store that pages use to pass state to each other on navigation.

const _stateCache: Record<string, any> = {};

interface RouterState {
  pushState(tabKey: string, state: any): void;
  getCachedState(tabKey: string): any;
}

/**
 * Returns a stable router state object.  Pages call `pushState` before navigating,
 * and the destination page calls `getCachedState` to retrieve it.
 */
export function useRouterState(): RouterState {
  const ref = useRef<RouterState>({
    pushState(tabKey: string, state: any) {
      _stateCache[tabKey] = state;
    },
    getCachedState(tabKey: string) {
      return _stateCache[tabKey] ?? null;
    },
  });
  return ref.current;
}

/** Pushes pair state and navigates to /pairs via hash navigation. */
export function navigateToPairs(tickerA: string, tickerB: string, metric?: string): void {
  _stateCache["pairs"] = { tickerA, tickerB, metricA: metric ?? "close", metricB: metric ?? "close" };
  if (typeof window !== "undefined") {
    window.location.hash = "#/pairs";
  }
}

// Re-export navigateToTicker so callers that import it from here also work
export { navigateToTicker } from "@/lib/navigateToTicker";
