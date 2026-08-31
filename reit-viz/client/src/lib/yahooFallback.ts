// Shared off-universe Yahoo price fallback.
//
// The REIT workbook only carries ~99 curated tickers. When a symbol that is NOT
// in the workbook is requested (e.g. AAPL, SPY, ^TNX typed into a Charts / optimizer
// picker), the two raw loaders — dataService.getTickerRawBase (global-index tuple
// model) and tickerData.fetchTickerRawBase (self-describing {dates,metrics}) — have
// no static file and the API 404s, so they returned empty and the chart stayed blank.
//
// This helper fetches daily OHLCV from the same /api/yahoo-prices/:ticker route the
// MTF scanner already uses (mtfData.fetchDailyAnySymbol), normalized once and
// promise-cached so the two loaders + repeated calls share a single network hit.

export interface YahooDaily {
  dates: string[]; // ISO YYYY-MM-DD, ascending
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  adjCloses: number[];
  volumes: number[];
}

import { boundedSet } from "@/lib/boundedCache";

// Bounded: full-history OHLCV per symbol; eviction just refetches later.
const YAHOO_CACHE_CAP = 150;
const yahooCache = new Map<string, Promise<YahooDaily | null>>();

/** Fetch normalized daily OHLCV for an arbitrary Yahoo symbol, or null if none. */
export function fetchYahooDaily(symbol: string): Promise<YahooDaily | null> {
  const key = symbol.toUpperCase();
  let p = yahooCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`/api/yahoo-prices/${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json")) return null; // SPA index.html, not JSON
        const d = await res.json();
        if (!Array.isArray(d?.dates) || !d.dates.length || !Array.isArray(d?.closes)) return null;
        return {
          dates: d.dates,
          opens: Array.isArray(d.opens) ? d.opens : d.closes,
          highs: Array.isArray(d.highs) ? d.highs : d.closes,
          lows: Array.isArray(d.lows) ? d.lows : d.closes,
          closes: d.closes,
          adjCloses:
            Array.isArray(d.adjCloses) && d.adjCloses.length === d.dates.length ? d.adjCloses : d.closes,
          volumes: Array.isArray(d.volumes) ? d.volumes : [],
        } as YahooDaily;
      } catch {
        return null;
      }
    })();
    boundedSet(yahooCache, key, p, YAHOO_CACHE_CAP);
  }
  return p;
}
