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
import { getTickers, CLASSIFICATION_KEYS } from "@/lib/dataService";
import type { ClassifiedBase } from "@/lib/dataService";
import { useReclassificationOverrides } from "@/lib/reclassificationOverrides";
import {
  emptyClassFilters,
  applyClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useExcludedTickers } from "@/lib/excludedTickers";
import { useBaskets } from "@/lib/useBaskets";
import { useGlobalAdvMap, useGlobalGeoMap, type GeoInfo } from "@/lib/globalUniverse";
import { useWorkbookAdv, type AdvEntry as RawAdvEntry } from "@/lib/workbookAdv";
import { parseNumericFilter } from "@/lib/numericFilter";

/** Effective per-ticker liquidity, with real trailing-90d ADV (Yahoo) preferred
 *  over the static global-universe estimate. */
export interface UniverseAdvInfo {
  /** Closing price (in the listing currency). */
  price?: number | null;
  /** Listing currency the price is quoted in (e.g. "USD", "GBp", "EUR"). */
  currency?: string | null;
  /** Average daily share volume, in millions of shares. */
  adv?: number | null;
  /** Average daily dollar volume ($ ADV), in $ millions. */
  dollarVolMM?: number | null;
  /** Where dollarVolMM came from. */
  source: "yahoo90" | "global" | "none";
  /** Yahoo reports the symbol as not found / delisted. */
  delisted?: boolean;
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
  /** Whitelist of nations (countries) to keep. Empty = no nation filter.
   *  Joined from the global universe dataset. */
  nationFilter: Set<string>;
  setNationFilter: (s: Set<string>) => void;
  /** Whitelist of stock exchanges to keep. Empty = no exchange filter.
   *  Joined from the global universe dataset. */
  exchangeFilter: Set<string>;
  setExchangeFilter: (s: Set<string>) => void;
  /** Restrict the whole universe to a saved basket. "" = off. Accepts a basket
   *  id or name (resolved via useBaskets().getBasket). */
  universeBasketId: string;
  setUniverseBasketId: (id: string) => void;
  /** Resolved name of the active universe basket, or null when none/not found. */
  universeBasketName: string | null;
  /** Ticker → { nation, exchange } keyed by UPPER-cased symbol, from the global dataset. */
  geoMap: Map<string, GeoInfo>;
  /** The nation (country) for a ticker, or null if unknown. */
  nationOf: (ticker: string) => string | null;
  /** The listing stock exchange for a ticker, or null if unknown. */
  exchangeOf: (ticker: string) => string | null;
  /** Sorted unique nations present in the workbook universe (filter options). */
  nationOptions: string[];
  /** Sorted unique exchanges present in the workbook universe (filter options). */
  exchangeOptions: string[];
  /** Liquidity ($ ADV) threshold expression, e.g. ">5", "5-50", "<100". Empty = no liquidity filter.
   *  Values are average daily dollar volume in $ millions, joined from the global universe dataset. */
  advFilter: string;
  setAdvFilter: (s: string) => void;
  /** Which ADV window the liquidity filter (and its bulk-exclude) targets. */
  advWindow: 30 | 90;
  setAdvWindow: (w: 30 | 90) => void;
  /** The selected-window $ ADV ($MM) for a ticker — what the filter compares against. */
  advValueOf: (ticker: string) => number | null;
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
  /** All ticker metadata with reclassification overrides applied (for the Universe page grid) */
  allTickers: ClassifiedBase[];
  /** Workbook ticker metadata WITHOUT overrides — the classification baseline */
  rawTickers: ClassifiedBase[];
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
  // Which ADV window the liquidity filter (and its bulk-exclude) targets.
  const [advWindow, setAdvWindow] = useState<30 | 90>(90);
  // Nation / exchange whitelists (joined from the global universe dataset).
  const [nationFilter, setNationFilter] = useState<Set<string>>(new Set());
  const [exchangeFilter, setExchangeFilter] = useState<Set<string>>(new Set());
  // Restrict the whole universe to a saved basket ("" = off).
  const [universeBasketId, setUniverseBasketId] = useState("");
  const { getBasket } = useBaskets();

  const { data: tickersMeta = [] } = useQuery({
    queryKey: ["/universe-tickers"],
    queryFn: getTickers,
  });

  // User reclassifications are applied here, at the universe choke point, so
  // every consumer (Universe table, classification filters, group-bys) sees the
  // effective taxonomy. rawTickers keeps the workbook originals — the Universe
  // editor needs them to tell "override" apart from "back to the default".
  const overrides = useReclassificationOverrides();
  const rawTickers = tickersMeta as ClassifiedBase[];
  const allTickers = useMemo(() => {
    if (Object.keys(overrides).length === 0) return rawTickers;
    return rawTickers.map((t) => {
      const o = overrides[t.ticker];
      if (!o) return t;
      const merged: any = { ...t };
      for (const key of CLASSIFICATION_KEYS) {
        if (o[key] !== undefined) merged[key] = o[key];
      }
      return merged as ClassifiedBase;
    });
  }, [rawTickers, overrides]);

  // Workbook tickers carry no volume of their own. Two sources of $ ADV:
  //  • global-universe dataset (instant, static estimate, ~98% coverage)
  //  • real trailing-90-day ADV computed from the Yahoo volume feed (current,
  //    also covers names missing from the global dataset) — loaded async.
  // The effective map below prefers the real figure and falls back to the estimate.
  const { advMap: globalAdvMap } = useGlobalAdvMap();
  // Nation + stock exchange per ticker, joined from the global universe dataset.
  const { geoMap } = useGlobalGeoMap();
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
      const delisted = real?.delisted === true;
      if (real && fin(real.advUsdMM)) {
        merged.set(key, {
          price: real.lastClose,
          currency: real.currency ?? null,
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
          delisted,
        });
      } else {
        merged.set(key, { dollarVolMM: null, source: "none", delisted });
      }
    }
    return merged;
  }, [allTickers, realAdvMap, globalAdvMap]);

  // The selected-window $ ADV for a ticker ($ millions): 30-day uses the real
  // Yahoo figure only; 90-day uses the effective map (real, else global estimate).
  const advValueOf = useCallback(
    (ticker: string): number | null => {
      const key = String(ticker).toUpperCase();
      return advWindow === 30
        ? adv30Map.get(key)?.advUsdMM ?? null
        : advMap.get(key)?.dollarVolMM ?? null;
    },
    [advWindow, adv30Map, advMap],
  );

  const nationOf = useCallback(
    (ticker: string): string | null =>
      geoMap.get(String(ticker).toUpperCase())?.nation ?? null,
    [geoMap],
  );
  const exchangeOf = useCallback(
    (ticker: string): string | null =>
      geoMap.get(String(ticker).toUpperCase())?.exchange ?? null,
    [geoMap],
  );

  // Unique nation / exchange values present in the workbook universe — the
  // options offered in the Universe tab's filter dropdowns.
  const { nationOptions, exchangeOptions } = useMemo(() => {
    const nations = new Set<string>();
    const exchanges = new Set<string>();
    for (const t of allTickers) {
      const geo = geoMap.get(t.ticker.toUpperCase());
      if (geo?.nation) nations.add(geo.nation);
      if (geo?.exchange) exchanges.add(geo.exchange);
    }
    return {
      nationOptions: [...nations].sort((a, b) => a.localeCompare(b)),
      exchangeOptions: [...exchanges].sort((a, b) => a.localeCompare(b)),
    };
  }, [allTickers, geoMap]);

  // Tickers the user hid via the Universe trash icon are excluded from the
  // universe everywhere (every tab reads filteredTickersList / universeTickers).
  // allTickers stays complete so the Universe page can list & restore them.
  const excludedTickers = useExcludedTickers("workbook");

  // Liquidity predicate over $ ADV (avg daily dollar volume, $ millions) for the
  // selected window. When active, names with unknown ADV drop out, since their
  // liquidity can't be confirmed against the threshold.
  const advPredicate = useMemo(() => parseNumericFilter(advFilter), [advFilter]);

  // Resolved basket restriction (uppercased symbols); null when off/not found.
  const activeBasket = universeBasketId ? getBasket(universeBasketId) : undefined;
  const basketSet = useMemo(() => {
    if (!activeBasket) return null;
    return new Set(activeBasket.tickers.map((t) => t.toUpperCase()));
  }, [activeBasket]);

  const filteredTickersList = useMemo(() => {
    const pool = basketSet
      ? allTickers.filter((t) => basketSet.has(t.ticker.toUpperCase()))
      : allTickers;
    let filtered = applyClassFilters(pool, filters, search, manualTickers);
    if (excludedTickers.size > 0) {
      filtered = filtered.filter((t) => !excludedTickers.has(t.ticker.toUpperCase()));
    }
    if (nationFilter.size > 0) {
      filtered = filtered.filter((t) => {
        const n = geoMap.get(t.ticker.toUpperCase())?.nation;
        return n != null && nationFilter.has(n);
      });
    }
    if (exchangeFilter.size > 0) {
      filtered = filtered.filter((t) => {
        const x = geoMap.get(t.ticker.toUpperCase())?.exchange;
        return x != null && exchangeFilter.has(x);
      });
    }
    if (advPredicate) {
      filtered = filtered.filter((t) => advPredicate(advValueOf(t.ticker)));
    }
    return filtered;
  }, [allTickers, basketSet, filters, search, manualTickers, excludedTickers, nationFilter, exchangeFilter, geoMap, advPredicate, advValueOf]);

  const isFiltered = useMemo(() => {
    return (
      basketSet != null ||
      Object.values(filters).some((s) => s.size > 0) ||
      search !== "" ||
      manualTickers.size > 0 ||
      excludedTickers.size > 0 ||
      nationFilter.size > 0 ||
      exchangeFilter.size > 0 ||
      advPredicate !== null
    );
  }, [basketSet, filters, search, manualTickers, excludedTickers, nationFilter, exchangeFilter, advPredicate]);

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
      nationFilter: [...nationFilter],
      exchangeFilter: [...exchangeFilter],
      advFilter,
      advWindow,
      universeBasketId,
    };
  }, [filters, search, manualTickers, nationFilter, exchangeFilter, advFilter, advWindow, universeBasketId]);

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
    setNationFilter(new Set(Array.isArray(data.nationFilter) ? data.nationFilter : []));
    setExchangeFilter(new Set(Array.isArray(data.exchangeFilter) ? data.exchangeFilter : []));
    setAdvFilter(typeof data.advFilter === "string" ? data.advFilter : "");
    setAdvWindow(data.advWindow === 30 ? 30 : 90);
    setUniverseBasketId(typeof data.universeBasketId === "string" ? data.universeBasketId : "");
  }, []);

  const clearAll = useCallback(() => {
    setFilters(emptyClassFilters());
    setSearch("");
    setManualTickers(new Set());
    setNationFilter(new Set());
    setExchangeFilter(new Set());
    setAdvFilter("");
    setUniverseBasketId("");
  }, []);

  const value: UniverseContextValue = {
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    nationFilter,
    setNationFilter,
    exchangeFilter,
    setExchangeFilter,
    universeBasketId,
    setUniverseBasketId,
    universeBasketName: activeBasket?.name ?? null,
    geoMap,
    nationOf,
    exchangeOf,
    nationOptions,
    exchangeOptions,
    advFilter,
    setAdvFilter,
    advWindow,
    setAdvWindow,
    advValueOf,
    advMap,
    adv30Map,
    advLoading,
    refreshAdv,
    universeTickers,
    isFiltered,
    filteredCount: filteredTickersList.length,
    totalCount: allTickers.length,
    allTickers,
    rawTickers,
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
