// Pair-ratio series builder: A ÷ B aligned to the global trading-date axis.
//
// Every call site expects { prices, indices } where `indices` point into the
// global getDates() axis (callers map them back with globalDates[idx]).
// The series is assembled client-side from the same per-ticker metric data the
// rest of the app uses (getTickerRaw tuples are already keyed by global date
// index), with a /api/yahoo-prices fallback for symbols outside the workbook
// (the UnifiedTickerPicker lets users type arbitrary Yahoo symbols).

import { getDates, getTickerRaw } from "@/lib/dataService";

export interface RatioBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PairRatioData {
  prices: number[];
  indices: number[];
  dates: string[];
  /** Ratio values (alias for prices) */
  ratio: number[];
}

// Yahoo fallback results are cached per ticker so a pair-combo run over many
// pairs sharing a leg doesn't refetch it. Workbook data is already cached
// inside dataService.
const yahooLegCache = new Map<string, Promise<{ dates: string[]; closes: number[] } | null>>();

function fetchYahooLeg(ticker: string): Promise<{ dates: string[]; closes: number[] } | null> {
  const key = ticker.toUpperCase();
  let p = yahooLegCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`/api/yahoo-prices/${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const data = await res.json();
        const closes: number[] =
          Array.isArray(data?.adjCloses) && data.adjCloses.length
            ? data.adjCloses
            : data?.closes;
        if (!Array.isArray(data?.dates) || !Array.isArray(closes) || !closes.length) return null;
        return { dates: data.dates, closes };
      } catch {
        return null;
      }
    })();
    yahooLegCache.set(key, p);
  }
  return p;
}

/** Load one leg as a Map of global-date-index → value, or null if unavailable. */
async function loadLegMap(
  ticker: string,
  metric: string,
  globalDates: string[],
  globalDateIdx: () => Map<string, number>
): Promise<Map<number, number> | null> {
  // Workbook tuples first — already keyed by global date index.
  try {
    const raw = await getTickerRaw(ticker);
    const tuples = raw?.[metric];
    if (Array.isArray(tuples) && tuples.length) {
      const map = new Map<number, number>();
      for (const [idx, val] of tuples) {
        if (Number.isFinite(val) && idx >= 0 && idx < globalDates.length) map.set(idx, val);
      }
      if (map.size) return map;
    }
  } catch {
    // fall through to Yahoo
  }

  // Yahoo fallback only makes sense for price data.
  if (metric !== "close") return null;
  const yahoo = await fetchYahooLeg(ticker);
  if (!yahoo) return null;
  const dateIdx = globalDateIdx();
  const map = new Map<number, number>();
  for (let i = 0; i < yahoo.dates.length; i++) {
    const idx = dateIdx.get(yahoo.dates[i]);
    const v = yahoo.closes[i];
    if (idx !== undefined && Number.isFinite(v)) map.set(idx, v);
  }
  return map.size ? map : null;
}

/**
 * Build the price-ratio series for tickerA / tickerB.
 *
 * Call signatures in the wild:
 *   getYahooPairsRatio(a, b, globalDates)            — indices into globalDates
 *   getYahooPairsRatio(a, b, metricA, metricB)       — metric field selectors
 *   getYahooPairsRatio(a, b)                         — indices into getDates()
 *
 * Returns parallel arrays { prices, indices, dates, ratio } (ratio === prices),
 * or null when either leg has no usable data.
 */
export async function getYahooPairsRatio(
  tickerA: string,
  tickerB: string,
  globalDatesOrMetricA?: string[] | string,
  optsOrMetricB?: Record<string, any> | string
): Promise<PairRatioData | null> {
  try {
    if (!tickerA || !tickerB) return null;
    const a = tickerA.toUpperCase();
    const b = tickerB.toUpperCase();

    const opts =
      optsOrMetricB && typeof optsOrMetricB === "object" ? optsOrMetricB : undefined;
    const metricA =
      typeof globalDatesOrMetricA === "string"
        ? globalDatesOrMetricA
        : (opts?.metricA as string) || "close";
    const metricB =
      typeof optsOrMetricB === "string"
        ? optsOrMetricB
        : (opts?.metricB as string) || "close";

    const globalDates = Array.isArray(globalDatesOrMetricA)
      ? globalDatesOrMetricA
      : await getDates();
    if (!globalDates.length) return null;

    // Lazily built date→index map, shared by both legs (Yahoo fallback only).
    let dateIdxMap: Map<string, number> | null = null;
    const globalDateIdx = () => {
      if (!dateIdxMap) {
        dateIdxMap = new Map<string, number>();
        for (let i = 0; i < globalDates.length; i++) dateIdxMap.set(globalDates[i], i);
      }
      return dateIdxMap;
    };

    const [mapA, mapB] = await Promise.all([
      loadLegMap(a, metricA, globalDates, globalDateIdx),
      loadLegMap(b, metricB, globalDates, globalDateIdx),
    ]);
    if (!mapA || !mapB) return null;

    // Intersect on dates where both legs have a usable value.
    const [small, other] = mapA.size <= mapB.size ? [mapA, mapB] : [mapB, mapA];
    const indices: number[] = [];
    for (const idx of small.keys()) {
      if (other.has(idx)) indices.push(idx);
    }
    indices.sort((x, y) => x - y);

    const prices: number[] = [];
    const outIndices: number[] = [];
    for (const idx of indices) {
      const va = mapA.get(idx)!;
      const vb = mapB.get(idx)!;
      if (vb === 0) continue;
      prices.push(va / vb);
      outIndices.push(idx);
    }

    return {
      prices,
      indices: outIndices,
      dates: outIndices.map((i) => globalDates[i]),
      ratio: prices,
    };
  } catch {
    return null;
  }
}

// Named export alias for destructured import `{ g as getYahooPairsRatio }`
export { getYahooPairsRatio as g };

/** Alias for getYahooPairsRatio */
export const yahooPairsRatio = getYahooPairsRatio;
