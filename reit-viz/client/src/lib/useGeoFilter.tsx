// Reusable Country (nation) + Exchange filter for any page that narrows a
// ticker universe. Additive to the classification filter bar (ClassFilters),
// which does NOT carry geography.
//
// The REIT workbook universe has no nation/exchange of its own, so geography is
// resolved per ticker via the global-universe geo map (useGlobalGeoMap). Global
// universe metas already carry nation/exchange, and the same map resolves them
// too, so this hook works for both universe sources.
//
// Usage:
//   const geo = useGeoFilter(tickers, "rerate-geo");
//   // render:  {geo.geoFilterUI}
//   // apply:   const filtered = geo.filterByGeo(tickers);

import { useState, useMemo, useCallback } from "react";
import { FilterDropdown } from "@/components/ClassificationFilters";
import { useGlobalGeoMap } from "@/lib/globalUniverse";

export interface GeoFilterResult {
  /** Keep only rows whose nation/exchange match the active selections. */
  filterByGeo: <T extends { ticker: string }>(rows: T[]) => T[];
  /** Predicate form for rows whose ticker is nested (e.g. row.meta.ticker). */
  matchesGeo: (ticker: string) => boolean;
  /** Country + Exchange dropdowns (render inside a filter bar). */
  geoFilterUI: React.ReactNode;
  /** True when a country or exchange selection is active. */
  hasActiveGeo: boolean;
  /** Clear both selections. */
  reset: () => void;
  /** True while the geo map is still loading. */
  loading: boolean;
  state: { nations: Set<string>; exchanges: Set<string> };
}

/**
 * @param tickers      Ticker pool used to derive the available country/exchange
 *                     options and per-option counts (each item needs `.ticker`).
 * @param testIdPrefix Prefix for the dropdowns' data-testid attributes.
 */
export function useGeoFilter(
  tickers: { ticker: string }[],
  testIdPrefix = "geo",
): GeoFilterResult {
  const { geoMap, loading } = useGlobalGeoMap();
  const [nations, setNations] = useState<Set<string>>(new Set());
  const [exchanges, setExchanges] = useState<Set<string>>(new Set());

  // Country/exchange options + counts, derived from the supplied ticker pool.
  const { nationOpts, exchangeOpts, nationCounts, exchangeCounts } = useMemo(() => {
    const nc: Record<string, number> = {};
    const ec: Record<string, number> = {};
    for (const t of tickers) {
      const g = geoMap.get(String(t.ticker).toUpperCase());
      if (g?.nation) nc[g.nation] = (nc[g.nation] || 0) + 1;
      if (g?.exchange) ec[g.exchange] = (ec[g.exchange] || 0) + 1;
    }
    return {
      nationOpts: Object.keys(nc).sort(),
      exchangeOpts: Object.keys(ec).sort(),
      nationCounts: nc,
      exchangeCounts: ec,
    };
  }, [tickers, geoMap]);

  const matchesGeo = useCallback(
    (ticker: string): boolean => {
      if (nations.size === 0 && exchanges.size === 0) return true;
      const g = geoMap.get(String(ticker).toUpperCase());
      if (nations.size > 0 && !(g?.nation && nations.has(g.nation))) return false;
      if (exchanges.size > 0 && !(g?.exchange && exchanges.has(g.exchange))) return false;
      return true;
    },
    [nations, exchanges, geoMap],
  );

  const filterByGeo = useCallback(
    <T extends { ticker: string }>(rows: T[]): T[] => {
      if (nations.size === 0 && exchanges.size === 0) return rows;
      return rows.filter((r) => matchesGeo(r.ticker));
    },
    [nations, exchanges, matchesGeo],
  );

  const hasActiveGeo = nations.size > 0 || exchanges.size > 0;

  const reset = useCallback(() => {
    setNations(new Set());
    setExchanges(new Set());
  }, []);

  const geoFilterUI = (
    <>
      <FilterDropdown
        label="Country"
        options={nationOpts}
        selected={nations}
        onChange={setNations}
        testId={`${testIdPrefix}-filter-nation`}
        counts={nationCounts}
      />
      <FilterDropdown
        label="Exchange"
        options={exchangeOpts}
        selected={exchanges}
        onChange={setExchanges}
        testId={`${testIdPrefix}-filter-exchange`}
        counts={exchangeCounts}
      />
    </>
  );

  return { filterByGeo, matchesGeo, geoFilterUI, hasActiveGeo, reset, loading, state: { nations, exchanges } };
}
