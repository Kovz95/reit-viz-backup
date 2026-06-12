// Hand-written from call-site inference (AutoTrendlineBacktest.tsx, PatternScreener.tsx)
// usePairComboPicker: hook that manages a list of ticker pairs and renders a UI for them.

import { useState, useCallback, useMemo } from "react";
import { createElement } from "react";

export interface TickerPair {
  tickerA: string;
  tickerB: string;
}

export interface PairComboPickerResult {
  /** Currently selected pairs. */
  pairs: TickerPair[];
  /** Total capped pair count (combinations). */
  cappedPairCount: number;
  /** Whether the pair list was capped. */
  capped: boolean;
  /** JSX element for the pair picker UI (rendered inline by the page). */
  ui: React.ReactNode | null;
  /** Serialize state for workspace persistence. */
  serialize: () => any;
  /** Restore state from serialized form. */
  hydrate: (s: any) => void;
  addPair: (a: string, b: string) => void;
  removePair: (idx: number) => void;
  clearPairs: () => void;
}

const MAX_PAIRS = 500;

/**
 * Manages a manual list of ticker pairs for "pair combo" scope mode.
 *
 * @param tickers     Full ticker list (used to generate combo permutations when pairs is empty).
 * @param active      When false, the hook is a no-op (returns empty state).
 * @param storageKey  Unique key for sessionStorage persistence.
 */
export function usePairComboPicker(
  tickers: Array<{ ticker: string } | string> | null | undefined,
  active: boolean,
  storageKey?: string
): PairComboPickerResult {
  const [pairs, setPairs] = useState<TickerPair[]>([]);

  const addPair = useCallback((a: string, b: string) => {
    setPairs((prev) => {
      if (prev.find((p) => p.tickerA === a && p.tickerB === b)) return prev;
      return [...prev, { tickerA: a, tickerB: b }];
    });
  }, []);

  const removePair = useCallback((idx: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearPairs = useCallback(() => {
    setPairs([]);
  }, []);

  const serialize = useCallback(() => ({ pairs }), [pairs]);
  const hydrate = useCallback((s: any) => {
    if (s?.pairs && Array.isArray(s.pairs)) setPairs(s.pairs);
  }, []);

  // Compute all N×(N-1)/2 combinations from the tickers list
  const allComboPairs = useMemo<TickerPair[]>(() => {
    if (!active || !tickers || tickers.length < 2) return [];
    const ts = tickers.map((t) =>
      typeof t === "string" ? t : (t as any).ticker
    );
    const combos: TickerPair[] = [];
    for (let i = 0; i < ts.length && combos.length < MAX_PAIRS; i++) {
      for (let j = i + 1; j < ts.length && combos.length < MAX_PAIRS; j++) {
        combos.push({ tickerA: ts[i], tickerB: ts[j] });
      }
    }
    return combos;
  }, [active, tickers]);

  const effectivePairs = active ? (pairs.length > 0 ? pairs : allComboPairs) : [];
  const capped = effectivePairs.length >= MAX_PAIRS;
  const cappedPairCount = effectivePairs.length;

  // Minimal UI — a simple text label (full UI would use a component)
  const ui = active
    ? createElement(
        "span",
        { className: "text-[10px] text-muted-foreground font-mono" },
        `${cappedPairCount} pairs${capped ? " (capped)" : ""}`
      )
    : null;

  return {
    pairs: effectivePairs,
    cappedPairCount,
    capped,
    ui,
    serialize,
    hydrate,
    addPair,
    removePair,
    clearPairs,
  };
}

// Named export alias for destructured import `{ u as usePairComboPicker }`
export { usePairComboPicker as u };
