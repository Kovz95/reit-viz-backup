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
      if (tabKey === "pairs") _pairsWrites++;
    },
    getCachedState(tabKey: string) {
      return _stateCache[tabKey] ?? null;
    },
  });
  return ref.current;
}

/** Fired by navigateToPairs so an ALREADY-MOUNTED /pairs picks up the new legs.
 *  The cache alone isn't enough: pages stay mounted, so their state initializers ran
 *  long before the hand-off and would never see it. */
export const PAIRS_HANDOFF_EVENT = "reit-viz:pairs-handoff";

export interface PairsHandoff {
  tickerA: string;
  tickerB: string;
  metricA: string;
  metricB: string;
}

// A hand-off has to outrank workspace restore: /pairs unmounts on navigation, so it
// remounts *after* the legs were stashed and its restore would otherwise put the
// previously-saved legs back and drop the pair the user just clicked.
let _pairsWrites = 0;
let _pairsApplied = 0;

/** True while a hand-off has been stashed but not yet applied by /pairs. */
export function pairsHandoffPending(): boolean {
  return _pairsWrites > _pairsApplied;
}

/** Returns the pending hand-off once, marking it applied. */
export function takePairsHandoff(): PairsHandoff | null {
  if (_pairsWrites <= _pairsApplied) return null;
  _pairsApplied = _pairsWrites;
  return (_stateCache["pairs"] as PairsHandoff) ?? null;
}

/** Pushes pair state and navigates to /pairs via hash navigation. */
export function navigateToPairs(tickerA: string, tickerB: string, metric?: string): void {
  const payload: PairsHandoff = {
    tickerA,
    tickerB,
    metricA: metric ?? "close",
    metricB: metric ?? "close",
  };
  _stateCache["pairs"] = payload;
  _pairsWrites++;
  if (typeof window !== "undefined") {
    window.location.hash = "#/pairs";
    window.dispatchEvent(new CustomEvent(PAIRS_HANDOFF_EVENT, { detail: payload }));
  }
}

// Re-export navigateToTicker so callers that import it from here also work
export { navigateToTicker } from "@/lib/navigateToTicker";
