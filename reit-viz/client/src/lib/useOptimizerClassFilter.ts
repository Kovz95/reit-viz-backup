// Hand-written from call-site inference (PairOptimizer.tsx, PatternScreener.tsx)
// useOptimizerClassFilter: applies classification filtering to the ticker list
// and provides UI elements for the filter controls.

import { useState, useMemo, createElement } from "react";
import { emptyClassFilters, applyClassFilters } from "@/components/ClassificationFilters";
import type { ClassFilters } from "@/components/ClassificationFilters";

export interface OptimizerClassFilterResult {
  /** Filtered tickers list. */
  filteredTickers: any[];
  /** ClassFilters state. */
  classFilter: ClassFilters;
  /** Setter for classFilter. */
  setClassFilter: (f: ClassFilters) => void;
  /** JSX element for the universe-source picker (null when not active). */
  universeSourceUI: React.ReactNode | null;
  /** JSX element for the classification filter bar (null when not active). */
  classFilterUI: React.ReactNode | null;
}

/**
 * Manages a classification filter that narrows an optimizer's ticker universe.
 *
 * @param tickers      Base ticker list.
 * @param active       When false, pass-through (no filtering UI shown).
 * @param storageKey   Unique key for persisting filter state.
 */
export function useOptimizerClassFilter(
  tickers: any[] | null | undefined,
  active: boolean,
  storageKey?: string
): OptimizerClassFilterResult {
  const [classFilter, setClassFilter] = useState<ClassFilters>(() =>
    emptyClassFilters()
  );
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());

  const filteredTickers = useMemo(() => {
    if (!active || !tickers) return tickers ?? [];
    return applyClassFilters(tickers, classFilter, search, manualTickers);
  }, [active, tickers, classFilter, search, manualTickers]);

  // Minimal inline filter UI — pages render these in their own panel
  const classFilterUI = active
    ? createElement(
        "span",
        { className: "text-[10px] text-muted-foreground font-mono" },
        `${filteredTickers.length} tickers`
      )
    : null;

  const universeSourceUI = active
    ? createElement(
        "span",
        { className: "text-[10px] text-foreground font-mono" },
        "universe"
      )
    : null;

  return {
    filteredTickers,
    classFilter,
    setClassFilter,
    universeSourceUI,
    classFilterUI,
  };
}
