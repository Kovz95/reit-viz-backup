/**
 * Master Universe Context
 * 
 * Provides a global ticker universe filter that propagates to:
 * Ranking, XY Scatter, Valuation, Div Spread, Rel Value (Heatmap), Performance
 * 
 * Stores classification filters, search, manual tickers, and the resulting
 * set of included ticker symbols. Tabs read `universeTickers` to pre-filter
 * their own data — if universeTickers is null (no filter active), all tickers pass.
 */
import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTickers } from "@/lib/dataService";
import type { ClassifiedBase } from "@/lib/dataService";
import {
  emptyClassFilters,
  applyClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useExcludedTickers } from "@/lib/excludedTickers";

export interface UniverseState {
  filters: ClassFilters;
  search: string;
  manualTickers: Set<string>;
}

export interface UniverseContextValue {
  /** The filter state (for the Universe tab UI) */
  filters: ClassFilters;
  setFilters: (f: ClassFilters) => void;
  search: string;
  setSearch: (s: string) => void;
  manualTickers: Set<string>;
  setManualTickers: (s: Set<string>) => void;
  /** If any universe filter is active, this is the set of allowed ticker symbols.
   *  If no filter is active, this is null (meaning "all tickers pass").
   *  Note: has both Set methods (.has, .size) and array-compatible .length property. */
  universeTickers: (Set<string> & { length: number }) | null;
  /** Whether any universe filter is active */
  isFiltered: boolean;
  /** Count of tickers passing the filter */
  filteredCount: number;
  /** Total ticker count */
  totalCount: number;
  /** All ticker metadata (for the Universe page grid) */
  allTickers: ClassifiedBase[];
  /** Filtered ticker metadata */
  filteredTickersList: ClassifiedBase[];
  /** Serialize for workspace save */
  serialize: () => any;
  /** Restore from workspace load */
  restore: (data: any) => void;
  /** Clear all filters */
  clearAll: () => void;
  /** Active (filtered) ticker symbols; null if no filter active (= all tickers). */
  activeTickers: string[] | null;
}

const UniverseContext = createContext<UniverseContextValue | null>(null);

export function UniverseProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());

  const { data: tickersMeta = [] } = useQuery({
    queryKey: ["/universe-tickers"],
    queryFn: getTickers,
  });

  const allTickers = tickersMeta as ClassifiedBase[];

  // Tickers the user hid via the Universe trash icon are excluded from the
  // universe everywhere (every tab reads filteredTickersList / universeTickers).
  // allTickers stays complete so the Universe page can list & restore them.
  const excludedTickers = useExcludedTickers("workbook");

  const filteredTickersList = useMemo(() => {
    const filtered = applyClassFilters(allTickers, filters, search, manualTickers);
    return excludedTickers.size > 0
      ? filtered.filter((t) => !excludedTickers.has(t.ticker.toUpperCase()))
      : filtered;
  }, [allTickers, filters, search, manualTickers, excludedTickers]);

  const isFiltered = useMemo(() => {
    return (
      Object.values(filters).some((s) => s.size > 0) ||
      search !== "" ||
      manualTickers.size > 0 ||
      excludedTickers.size > 0
    );
  }, [filters, search, manualTickers, excludedTickers]);

  const universeTickers = useMemo(() => {
    if (!isFiltered) return null;
    const s = new Set(filteredTickersList.map((t) => t.ticker));
    return s as unknown as (Set<string> & { length: number });
  }, [isFiltered, filteredTickersList]);

  const serialize = useCallback(() => {
    const filtersObj: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(filters)) {
      filtersObj[key] = [...val];
    }
    return {
      filters: filtersObj,
      search,
      manualTickers: [...manualTickers],
    };
  }, [filters, search, manualTickers]);

  const restore = useCallback((data: any) => {
    if (!data) return;
    if (data.filters) {
      const restored = emptyClassFilters();
      for (const [key, arr] of Object.entries(data.filters)) {
        if (Array.isArray(arr)) {
          (restored as any)[key] = new Set(arr);
        }
      }
      setFilters(restored);
    } else {
      setFilters(emptyClassFilters());
    }
    setSearch(data.search || "");
    setManualTickers(new Set(data.manualTickers || []));
  }, []);

  const clearAll = useCallback(() => {
    setFilters(emptyClassFilters());
    setSearch("");
    setManualTickers(new Set());
  }, []);

  const value: UniverseContextValue = {
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    universeTickers,
    isFiltered,
    filteredCount: filteredTickersList.length,
    totalCount: allTickers.length,
    allTickers,
    filteredTickersList,
    serialize,
    restore,
    clearAll,
    activeTickers: universeTickers ? [...universeTickers] : null,
  };

  return (
    <UniverseContext.Provider value={value}>
      {children}
    </UniverseContext.Provider>
  );
}

export function useUniverse(): UniverseContextValue {
  const ctx = useContext(UniverseContext);
  if (!ctx) throw new Error("useUniverse must be used within UniverseProvider");
  return ctx;
}
