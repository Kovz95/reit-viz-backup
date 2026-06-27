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
import { useGlobalAdvMap } from "@/lib/globalUniverse";
import { useWorkbookAdv, type AdvEntry as RawAdvEntry } from "@/lib/workbookAdv";
import { parseNumericFilter } from "@/lib/numericFilter";

/** Effective per-ticker liquidity, with real trailing-90d ADV (Yahoo) preferred
 *  over the static global-universe estimate. */
export interface UniverseAdvInfo {
  /** Closing price ($). */
  price?: number | null;
  /** Average daily share volume, in millions of shares. */
  adv?: number | null;
  /** Average daily dollar volume ($ ADV), in $ millions. */
  dollarVolMM?: number | null;
  /** Where dollarVolMM came from. */
  source: "yahoo90" | "global" | "none";
  /** ISO date of the most recent bar (yahoo90 only). */
  asOf?: string | null;
  /** Bars averaged (yahoo90 only). */
  days?: number;
  /** Trading-day window (yahoo90 only). */
  window?: number;
}

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
  /** Liquidity ($ ADV) threshold expression, e.g. ">5", "5-50", "<100". Empty = no liquidity filter.
   *  Values are average daily dollar volume in $ millions, joined from the global universe dataset. */
  advFilter: string;
  setAdvFilter: (s: string) => void;
  /** Ticker → effective liquidity info keyed by UPPER-cased symbol. $ ADV is the
   *  real trailing-90-day figure from the Yahoo volume feed when available, else
   *  the static global-universe estimate. */
  advMap: Map<string, UniverseAdvInfo>;
  /** Ticker → real trailing-30-day ADV from the Yahoo feed (display-only; no
   *  global-estimate fallback since the global dataset isn't a 30-day window). */
  adv30Map: Map<string, RawAdvEntry>;
  /** Whether the real (Yahoo) ADV batches are still loading. */
  advLoading: boolean;
  /** Force a re-pull of the real ADV (both windows) from Yahoo (bypasses caches). */
  refreshAdv: () => void;
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
  const [advFilter, setAdvFilter] = useState("");

  const { data: tickersMeta = [] } = useQuery({
    queryKey: ["/universe-tickers"],
    queryFn: getTickers,
  });

  const allTickers = tickersMeta as ClassifiedBase[];

  // Workbook tickers carry no volume of their own. Two sources of $ ADV:
  //  • global-universe dataset (instant, static estimate, ~98% coverage)
  //  • real trailing-90-day ADV computed from the Yahoo volume feed (current,
  //    also covers names missing from the global dataset) — loaded async.
  // The effective map below prefers the real figure and falls back to the estimate.
  const { advMap: globalAdvMap } = useGlobalAdvMap();
  const [advRefreshToken, setAdvRefreshToken] = useState(0);
  const allSymbols = useMemo(() => allTickers.map((t) => t.ticker), [allTickers]);
  const { advMap: realAdvMap, loading: adv90Loading } = useWorkbookAdv(
    allSymbols,
    90,
    advRefreshToken,
  );
  const { advMap: adv30Map, loading: adv30Loading } = useWorkbookAdv(
    allSymbols,
    30,
    advRefreshToken,
  );
  const advLoading = adv90Loading || adv30Loading;
  const refreshAdv = useCallback(() => setAdvRefreshToken(Date.now()), []);

  const advMap = useMemo(() => {
    const merged = new Map<string, UniverseAdvInfo>();
    const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
    for (const t of allTickers) {
      const key = t.ticker.toUpperCase();
      const real = realAdvMap.get(key);
      const glob = globalAdvMap.get(key);
      if (real && fin(real.advUsdMM)) {
        merged.set(key, {
          price: real.lastClose,
          adv: real.advShares,
          dollarVolMM: real.advUsdMM,
          source: "yahoo90",
          asOf: real.asOf,
          days: real.days,
          window: real.window,
        });
      } else if (glob && fin(glob.dollarVolMM)) {
        merged.set(key, {
          price: glob.price,
          adv: glob.adv,
          dollarVolMM: glob.dollarVolMM,
          source: "global",
        });
      } else {
        merged.set(key, { dollarVolMM: null, source: "none" });
      }
    }
    return merged;
  }, [allTickers, realAdvMap, globalAdvMap]);

  // Tickers the user hid via the Universe trash icon are excluded from the
  // universe everywhere (every tab reads filteredTickersList / universeTickers).
  // allTickers stays complete so the Universe page can list & restore them.
  const excludedTickers = useExcludedTickers("workbook");

  // Liquidity predicate over $ ADV (avg daily dollar volume, $ millions). When
  // active, names with unknown ADV (not in the global dataset) drop out, since
  // their liquidity can't be confirmed against the threshold.
  const advPredicate = useMemo(() => parseNumericFilter(advFilter), [advFilter]);

  const filteredTickersList = useMemo(() => {
    let filtered = applyClassFilters(allTickers, filters, search, manualTickers);
    if (excludedTickers.size > 0) {
      filtered = filtered.filter((t) => !excludedTickers.has(t.ticker.toUpperCase()));
    }
    if (advPredicate) {
      filtered = filtered.filter((t) =>
        advPredicate(advMap.get(t.ticker.toUpperCase())?.dollarVolMM ?? null),
      );
    }
    return filtered;
  }, [allTickers, filters, search, manualTickers, excludedTickers, advPredicate, advMap]);

  const isFiltered = useMemo(() => {
    return (
      Object.values(filters).some((s) => s.size > 0) ||
      search !== "" ||
      manualTickers.size > 0 ||
      excludedTickers.size > 0 ||
      advPredicate !== null
    );
  }, [filters, search, manualTickers, excludedTickers, advPredicate]);

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
      advFilter,
    };
  }, [filters, search, manualTickers, advFilter]);

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
    setAdvFilter(typeof data.advFilter === "string" ? data.advFilter : "");
  }, []);

  const clearAll = useCallback(() => {
    setFilters(emptyClassFilters());
    setSearch("");
    setManualTickers(new Set());
    setAdvFilter("");
  }, []);

  const value: UniverseContextValue = {
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    advFilter,
    setAdvFilter,
    advMap,
    adv30Map,
    advLoading,
    refreshAdv,
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
