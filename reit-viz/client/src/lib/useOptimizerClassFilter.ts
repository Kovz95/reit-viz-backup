// Reconstructed from the live production chunk useOptimizerClassFilter-COCFGQs0.js
// (served by the ground-truth bundle) on 2026-06-17. Renders the real
// "Universe Source" picker (REIT Workbook / Global) and the classification
// filter bar, replacing the earlier inferred placeholder.

import { useState, useMemo, useCallback, createElement } from "react";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
} from "@/components/ClassificationFilters";
import type { ClassFilters } from "@/components/ClassificationFilters";
import { useGlobalUniverse } from "@/lib/globalUniverse";

type UniverseSource = "workbook" | "global";

export interface OptimizerClassFilterResult {
  /** Filtered tickers list (respects active source + classification filters). */
  filteredTickers: any[];
  /** JSX element for the classification filter bar (null when not active). */
  classFilterUI: React.ReactNode | null;
  /** JSX element for the universe-source picker (null when not active). */
  universeSourceUI: React.ReactNode | null;
  /** Active universe source. */
  source: UniverseSource;
  /** True while the global universe is loading. */
  globalLoading: boolean;
  /** Global universe load error (null unless source === "global"). */
  globalError: string | null;
  /** True when any classification filter is active. */
  hasActiveFilters: boolean;
  /** Raw filter state. */
  state: {
    classFilters: ClassFilters;
    search: string;
    manualTickers: Set<string>;
    source: UniverseSource;
  };
  /** Reset all filters (keeps current source). */
  reset: () => void;
}

/**
 * Manages a classification filter that narrows an optimizer's ticker universe,
 * including the REIT-Workbook vs. Global universe-source toggle.
 *
 * @param tickers       Base (REIT workbook) ticker list.
 * @param active        When false, pass-through (no filtering UI shown).
 * @param testIdPrefix  Prefix for data-testid attributes / persistence.
 */
export function useOptimizerClassFilter(
  tickers: any[],
  active: boolean,
  testIdPrefix = "opt-clf"
): OptimizerClassFilterResult {
  const [classFilters, setClassFilters] = useState<ClassFilters>(() =>
    emptyClassFilters()
  );
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [source, setSourceState] = useState<UniverseSource>("workbook");

  const globalActive = active && source === "global";
  const { metas, loading, error } = useGlobalUniverse();

  const pool = useMemo(
    () => (source === "global" ? (globalActive ? metas : []) : tickers),
    [source, globalActive, metas, tickers]
  );

  const filteredTickers = useMemo(
    () => (active ? applyClassFilters(pool, classFilters, search, manualTickers) : tickers),
    [pool, tickers, active, classFilters, search, manualTickers]
  );

  const hasActiveFilters =
    Object.values(classFilters).some((s: any) => s.size > 0) ||
    search !== "" ||
    manualTickers.size > 0;

  const reset = useCallback(() => {
    setClassFilters(emptyClassFilters());
    setSearch("");
    setManualTickers(new Set());
  }, []);

  const setSource = useCallback((s: UniverseSource) => {
    setSourceState(s);
    setClassFilters(emptyClassFilters());
    setSearch("");
    setManualTickers(new Set());
  }, []);

  const workbookCount = tickers.length;

  const universeSourceUI = active
    ? createElement(
        "div",
        {
          className: "flex items-center gap-2 text-xs",
          "data-testid": `${testIdPrefix}-universe-source`,
        },
        createElement(
          "span",
          { className: "text-slate-400 uppercase tracking-wide" },
          "Universe Source:"
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => setSource("workbook"),
            className: `px-2 py-1 rounded border transition-colors ${
              source === "workbook"
                ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
                : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
            }`,
            "data-testid": `${testIdPrefix}-source-workbook`,
          },
          "REIT Workbook (",
          workbookCount,
          ")"
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => setSource("global"),
            className: `px-2 py-1 rounded border transition-colors ${
              source === "global"
                ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
                : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
            }`,
            "data-testid": `${testIdPrefix}-source-global`,
            title:
              "FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)",
          },
          "Global",
          " ",
          source === "global"
            ? loading
              ? "(loading…)"
              : `(${metas.length.toLocaleString()})`
            : "(~9k)"
        ),
        source === "global" && error
          ? createElement(
              "span",
              { className: "text-rose-400", title: error },
              "load error"
            )
          : null
    )
    : null;

  const classFilterUI = active
    ? createElement(ClassificationFilters, {
        filters: classFilters,
        onFiltersChange: setClassFilters,
        search,
        onSearchChange: setSearch,
        manualTickers,
        onManualTickersChange: setManualTickers,
        filteredCount: filteredTickers.length,
        totalCount: pool.length,
        testIdPrefix,
        tickerPoolOverride: source === "global" ? pool : undefined,
      })
    : null;

  return {
    filteredTickers,
    classFilterUI,
    universeSourceUI,
    source,
    globalLoading: source === "global" && loading,
    globalError: source === "global" ? error : null,
    hasActiveFilters,
    state: { classFilters, search, manualTickers, source },
    reset,
  };
}
