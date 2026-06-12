/**
 * Client-side data service — fetches static JSON files and performs
 * all data aggregation in the browser. No API server required.
 *
 * Data format: Each ticker JSON has metrics stored as arrays of [dateIndex, value] pairs.
 * Example: "close": [[0, 23.29], [1, 23.73], ...]
 */

// ---- Types ----
export interface TickerMeta {
  ticker: string;
  name: string;
  subindustry: string;
  industry: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  dates: number;
  metrics: string[];
}

export interface TimeValue {
  time: string;
  value: number;
}

export interface OhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Common classification fields shared by all row types */
export interface ClassifiedBase {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  metrics?: string[];
}

export const CLASSIFICATION_KEYS: (keyof ClassifiedBase)[] = [
  "economy", "sector", "subsector", "industryGroup", "industry", "subindustry",
];

export interface RankRow extends ClassifiedBase {
  value: number | null;
}

export interface ScatterPoint extends ClassifiedBase {
  x: number | null;
  y: number | null;
  z: number | null;
  colorVal: number | null;
}

export interface PairsData {
  priceA: TimeValue[];
  priceB: TimeValue[];
  ratio: TimeValue[];
  logRatio: TimeValue[];
  spread: TimeValue[];
  zScore: TimeValue[];
  spreadZ: TimeValue[];
  olsResidZ: TimeValue[];
  correlation: TimeValue[];
  rollingBeta: TimeValue[];
  betaAdjSpread: TimeValue[];
  rollingR2: TimeValue[];
  percentileRank: TimeValue[];
  cointStats: {
    adfStat: number;
    pValue: number;
    halfLife: number;
    hedgeRatio: number;
  } | null;
}

// ---- Raw data type: each metric is an array of [dateIndex, value] pairs ----
type RawMetricData = [number, number][];
type RawTickerData = Record<string, RawMetricData>;

// ---- Caching ----
let tickersCache: TickerMeta[] | null = null;
let datesCache: string[] | null = null;
let eventsCache: Record<string, any> | null = null;
const tickerDataCache = new Map<string, RawTickerData>();

// ---- Cache injection (for client-side parsed uploads) ----
export function injectTickers(tickers: TickerMeta[], mode: "replace" | "merge" = "replace") {
  if (mode === "merge" && tickersCache) {
    // Merge: overwrite existing tickers by symbol, add new ones
    const map = new Map(tickersCache.map(t => [t.ticker, t]));
    for (const t of tickers) map.set(t.ticker, t);
    tickersCache = [...map.values()];
  } else {
    tickersCache = tickers;
  }
}
export function injectDates(dates: string[], mode: "replace" | "merge" = "replace") {
  if (mode === "merge" && datesCache) {
    // Merge: union of all dates, sorted
    const set = new Set([...datesCache, ...dates]);
    datesCache = [...set].sort();
  } else {
    datesCache = dates;
  }
}
export function injectEvents(events: Record<string, any>, mode: "replace" | "merge" = "replace") {
  if (mode === "merge" && eventsCache) {
    eventsCache = { ...eventsCache, ...events };
  } else {
    eventsCache = events;
  }
}
export function injectTickerData(symbol: string, data: RawTickerData) {
  tickerDataCache.set(symbol.toUpperCase(), data);
}
export function clearTickerDataCache() {
  tickerDataCache.clear();
}
/** Clear ALL caches so next getTickers/getDates/getEvents re-fetches from API */
export function clearAllCaches() {
  tickersCache = null;
  datesCache = null;
  eventsCache = null;
  tickerDataCache.clear();
}
/** Returns the current in-memory ticker list (for immediate reads after injection) */
export function getTickersCacheSync(): TickerMeta[] | null {
  return tickersCache;
}

// ---- Fundamental upload injection ----
// Tracks custom metrics injected from fundamental Excel uploads so other tabs
// (Screener, Ranking, etc.) can discover them.
let _customFundamentalMetrics: string[] = [];

/** Returns the list of custom fundamental metric names injected from uploads */
export function getCustomFundamentalMetrics(): string[] {
  return _customFundamentalMetrics;
}

/**
 * Merge uploaded fundamental series into the ticker data cache so they're
 * accessible via getMetricSeries / getTickerRaw from any tab.
 * 
 * Each sheet maps to a ticker. Metrics are merged into the existing cache
 * entry (if any) so server-loaded data is preserved alongside custom uploads.
 * Date strings are converted to date indices using the global dates array.
 */
// Normalize quarter/annual strings to yyyy-mm-dd dates
function normalizeQuarterDate(dateStr: string): string {
  // Annual FY format: 2014FY, FY2014 → year-end 12-31
  let m = dateStr.match(/^(\d{4})\s*FY$/i);
  if (m) return `${m[1]}-12-31`;
  m = dateStr.match(/^FY\s*(\d{4})$/i);
  if (m) return `${m[1]}-12-31`;
  // Quarterly formats
  const qEnd: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
  // 2013Q2, 2013-Q2, FY2013Q2
  m = dateStr.match(/^(?:FY)?\s*(\d{4})[\s\-]?Q([1-4])$/i);
  if (m) return `${m[1]}-${qEnd[parseInt(m[2])]}`;
  // Q2-2013, Q2 2013
  m = dateStr.match(/^Q([1-4])[\s\-]?(\d{4})$/i);
  if (m) return `${m[2]}-${qEnd[parseInt(m[1])]}`;
  // 2Q2013
  m = dateStr.match(/^([1-4])Q(\d{4})$/i);
  if (m) return `${m[2]}-${qEnd[parseInt(m[1])]}`;
  return dateStr;
}

export async function injectFundamentalSheets(
  sheets: { sheetName: string; metrics: { name: string; data: { time: string; value: number }[] }[] }[]
) {
  const dates = await getDates();
  if (!dates.length) return;

  // Build a fast date → index lookup
  const dateToIdx = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) dateToIdx.set(dates[i], i);

  // Helper: find nearest date index (snap to closest trading date)
  // Used for quarterly data where end-of-quarter may fall on a weekend
  function findNearestIdx(dateStr: string): number | undefined {
    const exact = dateToIdx.get(dateStr);
    if (exact !== undefined) return exact;
    // Binary search for nearest date
    let lo = 0, hi = dates.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] < dateStr) lo = mid + 1;
      else if (dates[mid] > dateStr) hi = mid - 1;
      else return mid;
    }
    // lo is the insertion point; check lo and lo-1 for nearest
    const candidates: number[] = [];
    if (lo < dates.length) candidates.push(lo);
    if (lo - 1 >= 0) candidates.push(lo - 1);
    if (candidates.length === 0) return undefined;
    // Pick the closest by date difference, preferring earlier date (last trading day of quarter)
    let best = candidates[0];
    let bestDiff = Math.abs(new Date(dates[best]).getTime() - new Date(dateStr).getTime());
    for (let i = 1; i < candidates.length; i++) {
      const diff = Math.abs(new Date(dates[candidates[i]]).getTime() - new Date(dateStr).getTime());
      if (diff < bestDiff || (diff === bestDiff && dates[candidates[i]] <= dateStr)) {
        best = candidates[i]; bestDiff = diff;
      }
    }
    // Only snap within 5 days to avoid matching wildly wrong dates
    if (bestDiff > 5 * 86400000) return undefined;
    return best;
  }

  const newMetricNames = new Set<string>();

  for (const sheet of sheets) {
    // Strip common exchange suffixes (e.g. PSA-US → PSA, CUBE-US → CUBE)
    const symbol = sheet.sheetName.toUpperCase().replace(/-US$/i, "");

    // Get existing data (if already loaded) to merge with
    let existing: RawTickerData = {};
    if (tickerDataCache.has(symbol)) {
      existing = { ...tickerDataCache.get(symbol)! };
    }

    for (const metric of sheet.metrics) {
      // Convert {time, value} array to [dateIdx, value] tuples
      const tuples: [number, number][] = [];
      for (const pt of metric.data) {
        const normalized = normalizeQuarterDate(pt.time);
        const idx = findNearestIdx(normalized);
        if (idx !== undefined) {
          tuples.push([idx, pt.value]);
        }
      }
      if (tuples.length > 0) {
        // Prefix with "Fund:" to namespace and avoid collision with built-in metrics
        const metricKey = `Fund: ${metric.name}`;
        existing[metricKey] = tuples;
        newMetricNames.add(metricKey);
      }
    }

    tickerDataCache.set(symbol, existing);

    // Also update the ticker's metric list in tickersCache
    if (tickersCache) {
      const meta = tickersCache.find(t => t.ticker === symbol);
      if (meta) {
        const existingMetrics = new Set(meta.metrics);
        for (const name of newMetricNames) existingMetrics.add(name);
        meta.metrics = [...existingMetrics];
      }
    }
  }

  // Update global list of custom fundamental metrics
  const combined = new Set([..._customFundamentalMetrics, ...newMetricNames]);
  _customFundamentalMetrics = [...combined].sort();
}

// ---- Percentage conversion ----
// These metrics are stored as decimals in the Excel source (e.g. 0.04 = 4%).
// We multiply by 100 so they display as proper percentages.
const DECIMAL_TO_PERCENT_METRICS = new Set([
  // Growth rates
  "FY1 EPS Growth", "FY2 EPS Growth",
  "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  // Yields
  "Dividend Yield",
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  // Relative to 52-week range
  "% off 52wk High", "% off 52wk Low",
]);

/** Returns the multiplier for a metric (100 for decimals-that-are-percentages, 1 otherwise) */
export function metricMultiplier(metric: string): number {
  return DECIMAL_TO_PERCENT_METRICS.has(metric) ? 100 : 1;
}

/** Returns true if the metric should show a "%" suffix */
export function isPercentMetric(metric: string): boolean {
  return DECIMAL_TO_PERCENT_METRICS.has(metric)
    || metric.includes("Chg%")
    || metric.includes("Interest%")
    || SI_DELTA_METRICS.has(metric);
}

// ---- Computed Short Interest Delta Metrics ----
// These are derived on-the-fly from "Short Interest%" by computing the change
// over a lookback window (in trading days).
const SI_DELTA_DEFS: Record<string, { lookback: number; label: string }> = {
  "SI Δ 1W":  { lookback: 5,   label: "1-Week SI Change" },
  "SI Δ 1M":  { lookback: 21,  label: "1-Month SI Change" },
  "SI Δ 3M":  { lookback: 63,  label: "3-Month SI Change" },
  "SI Δ 6M":  { lookback: 126, label: "6-Month SI Change" },
};
export const SI_DELTA_METRICS = new Set(Object.keys(SI_DELTA_DEFS));
export const SI_DELTA_METRIC_NAMES = Object.keys(SI_DELTA_DEFS);

/** Check if a metric is a computed SI delta */
export function isSIDeltaMetric(metric: string): boolean {
  return SI_DELTA_METRICS.has(metric);
}

/** Compute the full SI delta time series from raw Short Interest% data */
function computeSIDeltaSeries(siPairs: RawMetricData, lookback: number): RawMetricData {
  // siPairs = [[dateIdx, value], ...] sorted by dateIdx
  const result: RawMetricData = [];
  const map = new Map<number, number>();
  for (const [idx, val] of siPairs) map.set(idx, val);

  // Build sorted index list
  const indices = Array.from(map.keys()).sort((a, b) => a - b);
  const idxPos = new Map<number, number>(); // dateIdx -> position in sorted array
  indices.forEach((idx, pos) => idxPos.set(idx, pos));

  for (const [idx, val] of siPairs) {
    const pos = idxPos.get(idx)!;
    if (pos >= lookback) {
      const prevIdx = indices[pos - lookback];
      const prevVal = map.get(prevIdx);
      if (prevVal !== undefined) {
        // Change in percentage points (e.g., SI went from 5% to 3% = -2pp)
        result.push([idx, val - prevVal]);
      }
    }
  }
  return result;
}

/** Get the SI delta value at a specific date index */
function getSIDeltaAtIdx(siPairs: RawMetricData, targetIdx: number, lookback: number): number | null {
  const map = new Map<number, number>();
  for (const [idx, val] of siPairs) map.set(idx, val);

  // Get current SI value at or before targetIdx
  let currentVal: number | null = null;
  let currentIdx = -1;
  for (const [idx, val] of siPairs) {
    if (idx <= targetIdx) { currentVal = val; currentIdx = idx; }
  }
  if (currentVal === null) return null;

  // Find the value ~lookback trading days before currentIdx
  const indices = Array.from(map.keys()).sort((a, b) => a - b);
  const pos = indices.indexOf(currentIdx);
  if (pos < lookback) return null;
  const prevIdx = indices[pos - lookback];
  const prevVal = map.get(prevIdx);
  if (prevVal === undefined) return null;
  return currentVal - prevVal;
}

// ---- Fetch helpers ----

function dataBase(): string {
  return "data";
}

async function fetchJSON<T>(relativePath: string): Promise<T> {
  const resp = await fetch(`${dataBase()}/${relativePath}`);
  if (!resp.ok) throw new Error(`Failed to fetch ${relativePath}: ${resp.status}`);
  return resp.json();
}

// ---- API fetch helper (tries API endpoint first, falls back to static) ----

async function fetchWithApiFallback<T>(apiPath: string, staticFile: string): Promise<T> {
  // Try the API endpoint first (returns live data including merges)
  try {
    const { API_BASE } = await import("@/lib/queryClient");
    const resp = await fetch(`${API_BASE}${apiPath}`);
    if (resp.ok) return resp.json();
  } catch (_) {
    // API not available, fall back to static file
  }
  return fetchJSON<T>(staticFile);
}

// ---- Core data loaders ----

export async function getTickers(): Promise<TickerMeta[]> {
  if (tickersCache) return tickersCache;
  tickersCache = await fetchWithApiFallback<TickerMeta[]>("/api/tickers", "tickers.json");
  return tickersCache;
}

export async function getDates(): Promise<string[]> {
  if (datesCache) return datesCache;
  datesCache = await fetchWithApiFallback<string[]>("/api/dates", "dates.json");
  return datesCache;
}

export async function getEvents(): Promise<Record<string, any>> {
  if (eventsCache) return eventsCache;
  eventsCache = await fetchWithApiFallback<Record<string, any>>("/api/events", "events.json");
  return eventsCache;
}

// ── Concurrency limiter for ticker data fetches ──
// Prevents browser freeze from 80+ simultaneous ticker data requests
const MAX_CONCURRENT_TICKER_FETCHES = 6;
let activeFetches = 0;
const fetchQueue: Array<{ resolve: () => void }> = [];

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_TICKER_FETCHES) {
    activeFetches++;
    return;
  }
  return new Promise((resolve) => {
    fetchQueue.push({ resolve });
  });
}

function releaseFetchSlot(): void {
  activeFetches--;
  const next = fetchQueue.shift();
  if (next) {
    activeFetches++;
    next.resolve();
  }
}

// In-flight request dedup: if two callers request the same ticker simultaneously,
// share a single fetch promise instead of firing two requests
const inFlightTickerFetches = new Map<string, Promise<RawTickerData>>();

// Helper: convert flat/RLE arrays → [dateIndex, value][] tuples
function flatToTuples(metrics: Record<string, (number | string | null)[]>): RawTickerData {
  const tupleData: RawTickerData = {};
  for (const [metric, encoded] of Object.entries(metrics)) {
    // Decode RLE nulls first: ~N means N consecutive nulls
    const flat: (number | null)[] = [];
    for (const item of encoded) {
      if (typeof item === "string" && item.startsWith("~")) {
        const count = parseInt(item.slice(1));
        for (let i = 0; i < count; i++) flat.push(null);
      } else {
        flat.push(item as number | null);
      }
    }
    // Convert to tuples (skip nulls)
    const pairs: RawMetricData = [];
    for (let i = 0; i < flat.length; i++) {
      if (flat[i] !== null && flat[i] !== undefined) {
        pairs.push([i, flat[i] as number]);
      }
    }
    tupleData[metric] = pairs;
  }
  return tupleData;
}

export async function getTickerRaw(symbol: string): Promise<RawTickerData> {
  const key = symbol.toUpperCase();
  if (tickerDataCache.has(key)) return tickerDataCache.get(key)!;

  // Dedup: if this ticker is already being fetched, wait for that promise
  const existing = inFlightTickerFetches.get(key);
  if (existing) return existing;

  const fetchPromise = (async (): Promise<RawTickerData> => {
    await acquireFetchSlot();
    try {
      // Try API first (returns {dates, metrics} with decoded flat arrays)
      try {
        const { API_BASE } = await import("@/lib/queryClient");
        const resp = await fetch(`${API_BASE}/api/ticker/${key}`);
        if (resp.ok) {
          const apiData = await resp.json() as { dates: string[]; metrics: Record<string, (number | null)[]> };
          const tupleData = flatToTuples(apiData.metrics);
          tickerDataCache.set(key, tupleData);
          return tupleData;
        }
      } catch (_) {
        // API not available, fall back to static file
      }

      // Static file: contains raw RLE-encoded metric data (NOT tuple format)
      // Format: { close: [v1, v2, "~3", v3, ...], open: [...], ... }
      const raw = await fetchJSON<Record<string, (number | string | null)[]>>(`tickers/${key}.json`);
      const tupleData = flatToTuples(raw);
      tickerDataCache.set(key, tupleData);
      return tupleData;
    } finally {
      releaseFetchSlot();
      inFlightTickerFetches.delete(key);
    }
  })();

  inFlightTickerFetches.set(key, fetchPromise);
  return fetchPromise;
}

// ---- Decoding helpers ----

/** Convert [dateIndex, value][] pairs into an index→value Map */
function toIndexMap(pairs: RawMetricData): Map<number, number> {
  const map = new Map<number, number>();
  for (const [idx, val] of pairs) {
    map.set(idx, val);
  }
  return map;
}

/** Get value at a specific date index (or last non-null before it) */
function getValueAtDateIdx(metricMap: Map<number, number>, targetIdx: number): number | null {
  if (metricMap.has(targetIdx)) return metricMap.get(targetIdx)!;
  let best: number | null = null;
  for (const [idx, val] of metricMap.entries()) {
    if (idx <= targetIdx) best = val;
  }
  return best;
}

/** Get average of last N trading days ending at targetIdx */
function getAverageOverDays(metricMap: Map<number, number>, targetIdx: number, avgDays: number): number | null {
  const entries = Array.from(metricMap.entries())
    .filter(([idx]) => idx <= targetIdx)
    .sort((a, b) => b[0] - a[0])
    .slice(0, avgDays);
  if (entries.length === 0) return null;
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  return sum / entries.length;
}

// ---- High-level data functions (replicate server API endpoints) ----

/** Get OHLC candle data for a ticker */
export async function getOhlcData(symbol: string): Promise<OhlcPoint[]> {
  const rawData = await getTickerRaw(symbol);
  const dates = await getDates();

  const openMap = rawData.open ? toIndexMap(rawData.open) : new Map();
  const highMap = rawData.high ? toIndexMap(rawData.high) : new Map();
  const lowMap = rawData.low ? toIndexMap(rawData.low) : new Map();
  const closeMap = rawData.close ? toIndexMap(rawData.close) : new Map();

  const ohlc: OhlcPoint[] = [];
  for (const [idx, closeVal] of closeMap.entries()) {
    if (idx < dates.length) {
      ohlc.push({
        time: dates[idx],
        open: openMap.get(idx) ?? closeVal,
        high: highMap.get(idx) ?? closeVal,
        low: lowMap.get(idx) ?? closeVal,
        close: closeVal,
      });
    }
  }
  // Sort by time to ensure correct ordering
  ohlc.sort((a, b) => a.time.localeCompare(b.time));
  return ohlc;
}

/** Get time series for a specific metric of a ticker */
export async function getMetricSeries(symbol: string, metric: string): Promise<TimeValue[]> {
  const rawData = await getTickerRaw(symbol);
  const dates = await getDates();

  // Handle computed SI delta metrics
  if (SI_DELTA_DEFS[metric]) {
    const siPairs = rawData["Short Interest%"];
    if (!siPairs) return [];
    const deltaPairs = computeSIDeltaSeries(siPairs, SI_DELTA_DEFS[metric].lookback);
    const data: TimeValue[] = [];
    for (const [idx, val] of deltaPairs) {
      if (idx < dates.length) data.push({ time: dates[idx], value: val });
    }
    return data;
  }

  if (!rawData[metric]) return [];

  const mult = metricMultiplier(metric);
  const pairs = rawData[metric];
  const data: TimeValue[] = [];
  for (const [idx, val] of pairs) {
    if (idx < dates.length) {
      data.push({ time: dates[idx], value: val * mult });
    }
  }
  return data;
}

/** Get a metric value for ALL tickers at a specific date, with optional averaging */
export async function getMetricForAllTickers(
  metric: string,
  dateParam?: string,
  avgDays?: number
): Promise<RankRow[]> {
  const tickersMeta = await getTickers();
  const dates = await getDates();

  // Find target date index
  let targetIdx = dates.length - 1;
  if (dateParam) {
    const found = dates.indexOf(dateParam);
    if (found >= 0) {
      targetIdx = found;
    } else {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i] <= dateParam) { targetIdx = i; break; }
      }
    }
  }

  const mult = metricMultiplier(metric);
  const tickerMetaMap = new Map(tickersMeta.map(t => [t.ticker, t]));

  // Try server-side batch first (single request vs 82 per-ticker fetches)
  // Server now handles SI delta metrics natively, so always send the metric directly
  const batchData = await batchGetMetricValues([metric], targetIdx, avgDays);

  if (batchData) {
    // Fast path: build results from batch data
    const results: RankRow[] = tickersMeta.map(t => {
      const values = batchData[t.ticker];
      const raw = values ? (values[metric] ?? null) : null;
      return {
        ticker: t.ticker, name: t.name,
        subindustry: t.subindustry || "", industry: t.industry || "",
        economy: t.economy || "", sector: t.sector || "",
        subsector: t.subsector || "", industryGroup: t.industryGroup || "",
        value: raw !== null ? raw * mult : null,
      };
    });
    return results;
  }

  // Fallback: client-side per-ticker loading
  const results: RankRow[] = [];
  const batchSize = 20;
  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const base: RankRow = {
          ticker: t.ticker, name: t.name,
          subindustry: t.subindustry || "", industry: t.industry || "",
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          value: null,
        };
        try {
          const rawData = await getTickerRaw(t.ticker);
          if (SI_DELTA_DEFS[metric]) {
            const siPairs = rawData["Short Interest%"];
            if (siPairs) base.value = getSIDeltaAtIdx(siPairs, targetIdx, SI_DELTA_DEFS[metric].lookback);
            return base;
          }
          if (!rawData[metric]) return base;
          const metricMap = toIndexMap(rawData[metric]);
          const raw = (avgDays && avgDays > 1)
            ? getAverageOverDays(metricMap, targetIdx, avgDays)
            : getValueAtDateIdx(metricMap, targetIdx);
          base.value = raw !== null ? raw * mult : null;
        } catch { /* skip */ }
        return base;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

/** Get scatter data for all tickers (x, y, optional z) at a specific date */
// ── Server-side batch metric fetching (avoids loading all ticker files client-side) ──
async function batchGetMetricValues(
  metrics: string[],
  dateIdx: number,
  avgDays?: number
): Promise<Record<string, Record<string, number | null>> | null> {
  try {
    const { API_BASE, apiRequest } = await import("@/lib/queryClient");
    const resp = await apiRequest("POST", "/api/batch-metrics", {
      metrics,
      dateIdx,
      avgDays: avgDays || 0,
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function getScatterData(
  metricX: string,
  metricY: string,
  metricZ?: string,
  dateParam?: string,
  avgDays?: number,
  colorMetric?: string,
): Promise<{ points: ScatterPoint[]; resolvedDate: string }> {
  const tickersMeta = await getTickers();
  const dates = await getDates();

  let targetIdx = dates.length - 1;
  if (dateParam) {
    const found = dates.indexOf(dateParam);
    if (found >= 0) {
      targetIdx = found;
    } else {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i] <= dateParam) { targetIdx = i; break; }
      }
    }
  }

  // Collect all metrics needed (filter out SI delta computed metrics — those need raw data)
  const allMetrics = [metricX, metricY, ...(metricZ ? [metricZ] : []), ...(colorMetric ? [colorMetric] : [])];
  const directMetrics = allMetrics.filter(m => !SI_DELTA_DEFS[m]);
  const hasSIDelta = allMetrics.some(m => SI_DELTA_DEFS[m]);
  if (hasSIDelta) directMetrics.push("Short Interest%");
  const uniqueMetrics = [...new Set(directMetrics)];

  // Try server-side batch first (single request, returns ~10KB instead of ~100MB)
  const batchData = await batchGetMetricValues(uniqueMetrics, targetIdx, avgDays);

  if (batchData) {
    // Fast path: build scatter points from batch data
    const tickerMetaMap = new Map(tickersMeta.map(t => [t.ticker, t]));
    const results: ScatterPoint[] = [];

    for (const [ticker, values] of Object.entries(batchData)) {
      const t = tickerMetaMap.get(ticker);
      if (!t) continue;

      const getValue = (metricName: string): number | null => {
        if (SI_DELTA_DEFS[metricName]) {
          // SI delta needs raw SI% data — batch doesn't support this directly
          // Fall back to null for now (rare use case)
          return null;
        }
        const raw = values[metricName] ?? null;
        return raw !== null ? raw * metricMultiplier(metricName) : null;
      };

      results.push({
        ticker: t.ticker,
        name: t.name,
        subindustry: t.subindustry || "",
        industry: t.industry || "",
        economy: t.economy || "",
        sector: t.sector || "",
        subsector: t.subsector || "",
        industryGroup: t.industryGroup || "",
        x: getValue(metricX),
        y: getValue(metricY),
        z: metricZ ? getValue(metricZ) : null,
        colorVal: colorMetric ? getValue(colorMetric) : null,
      });
    }

    // Add tickers that weren't in batch (no data)
    for (const t of tickersMeta) {
      if (!batchData[t.ticker]) {
        results.push({
          ticker: t.ticker, name: t.name,
          subindustry: t.subindustry || "", industry: t.industry || "",
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          x: null, y: null, z: null, colorVal: null,
        });
      }
    }

    return { points: results, resolvedDate: dates[targetIdx] };
  }

  // Fallback: client-side per-ticker loading (static deployment)
  const results: ScatterPoint[] = [];
  const batchSize = 20;
  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const base: ScatterPoint = {
          ticker: t.ticker,
          name: t.name,
          subindustry: t.subindustry || "",
          industry: t.industry || "",
          economy: t.economy || "",
          sector: t.sector || "",
          subsector: t.subsector || "",
          industryGroup: t.industryGroup || "",
          x: null,
          y: null,
          z: null,
          colorVal: null,
        };

        try {
          const rawData = await getTickerRaw(t.ticker);
          const getValue = (metricName: string): number | null => {
            if (SI_DELTA_DEFS[metricName]) {
              const siPairs = rawData["Short Interest%"];
              return siPairs ? getSIDeltaAtIdx(siPairs, targetIdx, SI_DELTA_DEFS[metricName].lookback) : null;
            }
            if (!rawData[metricName]) return null;
            const metricMap = toIndexMap(rawData[metricName]);
            const raw = (avgDays && avgDays > 1)
              ? getAverageOverDays(metricMap, targetIdx, avgDays)
              : getValueAtDateIdx(metricMap, targetIdx);
            return raw !== null ? raw * metricMultiplier(metricName) : null;
          };
          base.x = getValue(metricX);
          base.y = getValue(metricY);
          if (metricZ) base.z = getValue(metricZ);
          if (colorMetric) base.colorVal = getValue(colorMetric);
        } catch {
          // skip
        }
        return base;
      })
    );
    results.push(...batchResults);
  }

  return { points: results, resolvedDate: dates[targetIdx] };
}

/** Compute formula: seriesA op seriesB (or seriesA op constant) */
export async function computeFormula(
  tickerA: string,
  metricA: string,
  operator: string,
  tickerB?: string,
  metricB?: string,
  constant?: number
): Promise<TimeValue[]> {
  const dates = await getDates();

  const pairsToDateMap = (pairs: RawMetricData): Map<string, number> => {
    const map = new Map<string, number>();
    for (const [idx, val] of pairs) {
      if (idx < dates.length) {
        map.set(dates[idx], val);
      }
    }
    return map;
  };

  const rawA = await getTickerRaw(tickerA);
  if (!rawA[metricA]) throw new Error(`Metric ${metricA} not found for ${tickerA}`);
  const mapA = pairsToDateMap(rawA[metricA]);

  const useConstant = constant !== undefined && constant !== null;
  let mapB: Map<string, number> | null = null;
  if (!useConstant && tickerB && metricB) {
    const rawB = await getTickerRaw(tickerB);
    if (!rawB[metricB]) throw new Error(`Metric ${metricB} not found for ${tickerB}`);
    mapB = pairsToDateMap(rawB[metricB]);
  }

  const result: TimeValue[] = [];
  for (const [date, valA] of mapA.entries()) {
    let valB: number | undefined;
    if (useConstant) {
      valB = constant!;
    } else if (mapB) {
      valB = mapB.get(date);
    }
    if (valB === undefined) continue;

    let computed: number;
    switch (operator) {
      case "+": computed = valA + valB; break;
      case "-": computed = valA - valB; break;
      case "*": computed = valA * valB; break;
      case "/":
        if (valB === 0) continue;
        computed = valA / valB;
        break;
      default: continue;
    }
    if (!isFinite(computed)) continue;
    result.push({ time: date, value: computed });
  }
  return result;
}

/** Compute pairs trading data (ratio, log ratio, spread, z-score, correlation) */
export async function getPairsData(
  tickerA: string,
  tickerB: string,
  metricA: string = "close",
  metricB: string = "close",
  zWindow: number = 60,
  betaLookback: number = 52,
  spreadZWindow: number = 8,
  olsResidWindow: number = 52
): Promise<PairsData> {
  const dates = await getDates();
  const rawA = await getTickerRaw(tickerA);
  const rawB = await getTickerRaw(tickerB);

  if (!rawA[metricA]) throw new Error(`${metricA} not found for ${tickerA}`);
  if (!rawB[metricB]) throw new Error(`${metricB} not found for ${tickerB}`);

  const mapA = toIndexMap(rawA[metricA]);
  const mapB = toIndexMap(rawB[metricB]);

  const priceA: TimeValue[] = [];
  const priceB: TimeValue[] = [];
  const ratio: TimeValue[] = [];
  const logRatio: TimeValue[] = [];
  const spread: TimeValue[] = [];

  for (let i = 0; i < dates.length; i++) {
    const a = mapA.get(i);
    const b = mapB.get(i);
    if (a !== undefined && b !== undefined && b !== 0 && a > 0 && b > 0) {
      const t = dates[i];
      priceA.push({ time: t, value: a });
      priceB.push({ time: t, value: b });
      ratio.push({ time: t, value: a / b });
      logRatio.push({ time: t, value: Math.log(a / b) });
      spread.push({ time: t, value: a - b });
    }
  }

  // Rolling z-score of log ratio
  const zScore: TimeValue[] = [];
  for (let i = 0; i < logRatio.length; i++) {
    if (i < zWindow - 1) continue;
    let sum = 0;
    let sumSq = 0;
    for (let j = i - zWindow + 1; j <= i; j++) {
      sum += logRatio[j].value;
      sumSq += logRatio[j].value ** 2;
    }
    const mean = sum / zWindow;
    const variance = sumSq / zWindow - mean ** 2;
    const std = Math.sqrt(Math.max(0, variance));
    const z = std === 0 ? 0 : (logRatio[i].value - mean) / std;
    zScore.push({ time: logRatio[i].time, value: Math.round(z * 10000) / 10000 });
  }

  // Rolling correlation of log returns
  const corrWindow = zWindow;
  const correlation: TimeValue[] = [];
  const retA: TimeValue[] = [];
  const retB: TimeValue[] = [];
  for (let i = 1; i < priceA.length; i++) {
    retA.push({ time: priceA[i].time, value: Math.log(priceA[i].value / priceA[i - 1].value) });
    retB.push({ time: priceB[i].time, value: Math.log(priceB[i].value / priceB[i - 1].value) });
  }
  for (let i = corrWindow - 1; i < retA.length; i++) {
    let sumA2 = 0, sumB2 = 0;
    for (let j = i - corrWindow + 1; j <= i; j++) { sumA2 += retA[j].value; sumB2 += retB[j].value; }
    const meanA2 = sumA2 / corrWindow;
    const meanB2 = sumB2 / corrWindow;
    let covAB = 0, varAA = 0, varBB = 0;
    for (let j = i - corrWindow + 1; j <= i; j++) {
      const da = retA[j].value - meanA2;
      const db = retB[j].value - meanB2;
      covAB += da * db;
      varAA += da * da;
      varBB += db * db;
    }
    const denom = Math.sqrt(varAA * varBB);
    const corr = denom === 0 ? 0 : covAB / denom;
    correlation.push({ time: retA[i].time, value: Math.round(corr * 10000) / 10000 });
  }

  // Rolling beta (hedge ratio) via rolling OLS of log returns A on B
  const rollingBeta: TimeValue[] = [];
  const rollingR2: TimeValue[] = [];
  const betaWindow = zWindow;
  for (let i = betaWindow - 1; i < retA.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let j = i - betaWindow + 1; j <= i; j++) {
      const x = retB[j].value;
      const y = retA[j].value;
      sumX += x; sumY += y;
      sumXY += x * y; sumXX += x * x; sumYY += y * y;
    }
    const n = betaWindow;
    const meanX = sumX / n;
    const meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssXY = sumXY - n * meanX * meanY;
    const ssYY = sumYY - n * meanY * meanY;
    const beta = ssXX === 0 ? 0 : ssXY / ssXX;
    const r2 = (ssXX === 0 || ssYY === 0) ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
    rollingBeta.push({ time: retA[i].time, value: Math.round(beta * 10000) / 10000 });
    rollingR2.push({ time: retA[i].time, value: Math.round(r2 * 10000) / 10000 });
  }

  // Beta-adjusted spread: Price_A - beta * Price_B (using full-sample OLS on log prices)
  const betaAdjSpread: TimeValue[] = [];
  // Full-sample OLS: log(A) = alpha + hedgeRatio * log(B)
  let fullSumX2 = 0, fullSumY2 = 0, fullSumXY2 = 0, fullSumXX2 = 0;
  for (let i = 0; i < priceA.length; i++) {
    const x = Math.log(priceB[i].value);
    const y = Math.log(priceA[i].value);
    fullSumX2 += x; fullSumY2 += y;
    fullSumXY2 += x * y; fullSumXX2 += x * x;
  }
  const fullN = priceA.length;
  const fullMeanX = fullSumX2 / fullN;
  const fullMeanY = fullSumY2 / fullN;
  const fullSSXX = fullSumXX2 - fullN * fullMeanX * fullMeanX;
  const fullSSXY = fullSumXY2 - fullN * fullMeanX * fullMeanY;
  const hedgeRatio = fullSSXX === 0 ? 1 : fullSSXY / fullSSXX;
  const fullAlpha = fullMeanY - hedgeRatio * fullMeanX;

  // Compute residual (beta-adjusted spread)
  const residuals: number[] = [];
  for (let i = 0; i < priceA.length; i++) {
    const resid = Math.log(priceA[i].value) - hedgeRatio * Math.log(priceB[i].value) - fullAlpha;
    residuals.push(resid);
    betaAdjSpread.push({ time: priceA[i].time, value: Math.round(resid * 10000) / 10000 });
  }

  // Engle-Granger cointegration: ADF test on residuals
  // Simplified ADF: fit resid[t] = rho * resid[t-1] + eps, test H0: rho=1
  let cointStats: PairsData["cointStats"] = null;
  if (residuals.length > 30) {
    // OLS: delta_resid = (rho-1) * resid_lag
    let sumXr = 0, sumYr = 0, sumXYr = 0, sumXXr = 0;
    for (let i = 1; i < residuals.length; i++) {
      const x = residuals[i - 1];
      const y = residuals[i] - residuals[i - 1];
      sumXr += x; sumYr += y;
      sumXYr += x * y; sumXXr += x * x;
    }
    const nr = residuals.length - 1;
    const mXr = sumXr / nr;
    const mYr = sumYr / nr;
    const ssXXr = sumXXr - nr * mXr * mXr;
    const ssXYr = sumXYr - nr * mXr * mYr;
    const gamma = ssXXr === 0 ? 0 : ssXYr / ssXXr; // gamma = rho - 1

    // Standard error of gamma
    let sse = 0;
    for (let i = 1; i < residuals.length; i++) {
      const predicted = gamma * residuals[i - 1];
      const actual = residuals[i] - residuals[i - 1];
      sse += (actual - predicted) ** 2;
    }
    const sigmaHat = Math.sqrt(sse / (nr - 1));
    const seGamma = ssXXr === 0 ? Infinity : sigmaHat / Math.sqrt(ssXXr);
    const adfStat = seGamma === 0 ? 0 : gamma / seGamma;

    // Approximate p-value using MacKinnon critical values for n=2
    // CV: 1%=-3.96, 5%=-3.37, 10%=-3.07
    let pValue: number;
    if (adfStat < -3.96) pValue = 0.01;
    else if (adfStat < -3.37) pValue = 0.05;
    else if (adfStat < -3.07) pValue = 0.10;
    else if (adfStat < -2.57) pValue = 0.25;
    else pValue = 0.50;

    // Half-life of mean reversion: -ln(2) / ln(1 + gamma)
    const rho = 1 + gamma;
    const halfLife = rho >= 1 || rho <= 0 ? Infinity : -Math.log(2) / Math.log(Math.abs(rho));

    cointStats = {
      adfStat: Math.round(adfStat * 100) / 100,
      pValue,
      halfLife: Math.round(halfLife * 10) / 10,
      hedgeRatio: Math.round(hedgeRatio * 1000) / 1000,
    };
  }

  // ── Model 1: Short-term Spread Z (dual-window) ──
  // spread_t = log(A_t) - beta_t * log(B_t) where beta from rolling OLS with betaLookback
  // z = (spread - SMA(spread, spreadZWindow)) / StdDev(spread, spreadZWindow)
  const spreadZ: TimeValue[] = [];
  if (priceA.length >= betaLookback) {
    // Build arrays of log prices aligned with priceA/priceB
    const logA: number[] = priceA.map(d => Math.log(d.value));
    const logB: number[] = priceB.map(d => Math.log(d.value));

    // Rolling beta on log prices (not returns) — regress log(A) on log(B)
    const rollingSpread: { time: string; value: number }[] = [];
    for (let i = betaLookback - 1; i < logA.length; i++) {
      let sX = 0, sY = 0, sXY = 0, sXX = 0;
      for (let j = i - betaLookback + 1; j <= i; j++) {
        sX += logB[j]; sY += logA[j];
        sXY += logB[j] * logA[j]; sXX += logB[j] * logB[j];
      }
      const mX = sX / betaLookback;
      const mY = sY / betaLookback;
      const dXX = sXX - betaLookback * mX * mX;
      const dXY = sXY - betaLookback * mX * mY;
      const b = dXX === 0 ? 1 : dXY / dXX;
      const sprd = logA[i] - b * logB[i];
      rollingSpread.push({ time: priceA[i].time, value: sprd });
    }

    // Z-score the spread over spreadZWindow
    for (let i = spreadZWindow - 1; i < rollingSpread.length; i++) {
      let sum = 0, sumSq = 0;
      for (let j = i - spreadZWindow + 1; j <= i; j++) {
        sum += rollingSpread[j].value;
        sumSq += rollingSpread[j].value ** 2;
      }
      const mean = sum / spreadZWindow;
      const variance = sumSq / spreadZWindow - mean ** 2;
      const std = Math.sqrt(Math.max(0, variance));
      const z = std === 0 ? 0 : (rollingSpread[i].value - mean) / std;
      spreadZ.push({ time: rollingSpread[i].time, value: Math.round(z * 10000) / 10000 });
    }
  }

  // ── Model 2: OLS Residual Z (rolling OLS with intercept) ──
  // residual_t = log(A_t) - (alpha_t + beta_t * log(B_t)) from rolling window
  // z = residual_t / StdDev(residuals over window)
  const olsResidZ: TimeValue[] = [];
  if (priceA.length >= olsResidWindow) {
    const logA2: number[] = priceA.map(d => Math.log(d.value));
    const logB2: number[] = priceB.map(d => Math.log(d.value));

    for (let i = olsResidWindow - 1; i < logA2.length; i++) {
      let sX = 0, sY = 0, sXY = 0, sXX = 0;
      for (let j = i - olsResidWindow + 1; j <= i; j++) {
        sX += logB2[j]; sY += logA2[j];
        sXY += logB2[j] * logA2[j]; sXX += logB2[j] * logB2[j];
      }
      const n = olsResidWindow;
      const mX = sX / n;
      const mY = sY / n;
      const dXX = sXX - n * mX * mX;
      const dXY = sXY - n * mX * mY;
      const beta = dXX === 0 ? 1 : dXY / dXX;
      const alpha = mY - beta * mX;

      // Compute residuals within the window to get StdDev
      let sumResidSq = 0;
      for (let j = i - olsResidWindow + 1; j <= i; j++) {
        const resid = logA2[j] - (alpha + beta * logB2[j]);
        sumResidSq += resid * resid;
      }
      const residStd = Math.sqrt(sumResidSq / n);

      // Current residual
      const currentResid = logA2[i] - (alpha + beta * logB2[i]);
      const z = residStd === 0 ? 0 : currentResid / residStd;
      olsResidZ.push({ time: priceA[i].time, value: Math.round(z * 10000) / 10000 });
    }
  }

  // ── Historical Percentile Rank of Ratio ──
  // At each point, what % of all prior ratio observations are <= current value?
  // This gives a 0–100 score that moves in the same direction as the ratio.
  const percentileRank: TimeValue[] = [];
  if (ratio.length > 0) {
    // Use a sorted array approach for efficiency
    const sortedHistory: number[] = [];
    const binaryInsert = (arr: number[], val: number) => {
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] < val) lo = mid + 1; else hi = mid;
      }
      arr.splice(lo, 0, val);
      return lo;
    };
    const binaryRank = (arr: number[], val: number): number => {
      // Count how many values in sorted arr are <= val
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] <= val) lo = mid + 1; else hi = mid;
      }
      return lo;
    };
    for (let i = 0; i < ratio.length; i++) {
      binaryInsert(sortedHistory, ratio[i].value);
      // Percentile = (# values <= current) / total * 100
      const rank = binaryRank(sortedHistory, ratio[i].value);
      const pct = (rank / sortedHistory.length) * 100;
      percentileRank.push({ time: ratio[i].time, value: Math.round(pct * 100) / 100 });
    }
  }

  return { priceA, priceB, ratio, logRatio, spread, zScore, spreadZ, olsResidZ,
           correlation, rollingBeta, betaAdjSpread, rollingR2, percentileRank, cointStats };
}

/** Get multiple metrics for all tickers at a specific date (for composite screener) */
export async function getMultiMetricForAllTickers(
  metrics: string[],
  dateParam?: string,
  avgDays?: number
): Promise<(ClassifiedBase & { values: Record<string, number | null> })[]> {
  const tickersMeta = await getTickers();
  const dates = await getDates();

  let targetIdx = dates.length - 1;
  if (dateParam) {
    const found = dates.indexOf(dateParam);
    if (found >= 0) targetIdx = found;
    else {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i] <= dateParam) { targetIdx = i; break; }
      }
    }
  }

  // Separate SI delta metrics (need client-side computation) from direct metrics
  const directMetrics = metrics.filter(m => !SI_DELTA_DEFS[m]);
  const siDeltaMetrics = metrics.filter(m => SI_DELTA_DEFS[m]);
  const fetchMetrics = [...directMetrics];
  if (siDeltaMetrics.length > 0) fetchMetrics.push("Short Interest%");
  const uniqueFetchMetrics = [...new Set(fetchMetrics)];

  // Try server-side batch first
  const batchData = uniqueFetchMetrics.length > 0
    ? await batchGetMetricValues(uniqueFetchMetrics, targetIdx, avgDays)
    : null;

  if (batchData && siDeltaMetrics.length === 0) {
    // Fast path: all metrics are direct (no SI delta)
    return tickersMeta.map(t => {
      const values: Record<string, number | null> = {};
      const tickerData = batchData[t.ticker];
      for (const metric of metrics) {
        const raw = tickerData ? (tickerData[metric] ?? null) : null;
        values[metric] = raw !== null ? raw * metricMultiplier(metric) : null;
      }
      return {
        ticker: t.ticker, name: t.name,
        economy: t.economy || "", sector: t.sector || "",
        subsector: t.subsector || "", industryGroup: t.industryGroup || "",
        industry: t.industry || "", subindustry: t.subindustry || "",
        values,
      };
    });
  }

  // Fallback: client-side per-ticker loading
  const results: (ClassifiedBase & { values: Record<string, number | null> })[] = [];
  const batchSize = 20;
  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const row: ClassifiedBase & { values: Record<string, number | null> } = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          values: {},
        };
        try {
          const rawData = await getTickerRaw(t.ticker);
          for (const metric of metrics) {
            if (SI_DELTA_DEFS[metric]) {
              const siPairs = rawData["Short Interest%"];
              row.values[metric] = siPairs ? getSIDeltaAtIdx(siPairs, targetIdx, SI_DELTA_DEFS[metric].lookback) : null;
              continue;
            }
            if (!rawData[metric]) { row.values[metric] = null; continue; }
            const metricMap = toIndexMap(rawData[metric]);
            const raw = (avgDays && avgDays > 1)
              ? getAverageOverDays(metricMap, targetIdx, avgDays)
              : getValueAtDateIdx(metricMap, targetIdx);
            row.values[metric] = raw !== null ? raw * metricMultiplier(metric) : null;
          }
        } catch { /* skip */ }
        return row;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

/** Get trailing N values of a metric for a ticker (for sparklines / historical percentile) */
export async function getMetricTrailing(
  symbol: string,
  metric: string,
  trailingDays: number = 250
): Promise<number[]> {
  const rawData = await getTickerRaw(symbol);
  const dates = await getDates();

  // Handle computed SI delta metrics
  if (SI_DELTA_DEFS[metric]) {
    const siPairs = rawData["Short Interest%"];
    if (!siPairs) return [];
    const deltaPairs = computeSIDeltaSeries(siPairs, SI_DELTA_DEFS[metric].lookback);
    const sorted = deltaPairs.filter(([idx]) => idx < dates.length)
      .sort((a, b) => a[0] - b[0]);
    const lastN = sorted.slice(-trailingDays);
    return lastN.map(([, val]) => val);
  }

  if (!rawData[metric]) return [];

  const mult = metricMultiplier(metric);
  const pairs = rawData[metric];
  // Get last trailingDays values
  const sorted = pairs.filter(([idx]: [number, number]) => idx < dates.length)
    .sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
  const lastN = sorted.slice(-trailingDays);
  return lastN.map(([, val]: [number, number]) => val * mult);
}

/** Get full trailing time series for a metric for ALL tickers (for valuation overview stats) */
export async function getMetricTrailingAllTickers(
  metric: string,
  trailingDays: number = 1260
): Promise<(ClassifiedBase & { current: number | null; values: number[]; dates: string[] })[]> {
  const tickersMeta = await getTickers();

  // Try server-side batch endpoint first
  try {
    const { apiRequest } = await import("@/lib/queryClient");
    const resp = await apiRequest("POST", "/api/batch-trailing", { metric, trailingDays });
    if (resp.ok) {
      const json = await resp.json();
      const batchData = json.data as Record<string, { current: number | null; values: number[]; dates: string[] }>;
      if (batchData) {
        return tickersMeta.map(t => {
          const d = batchData[t.ticker];
          return {
            ticker: t.ticker, name: t.name,
            economy: t.economy || "", sector: t.sector || "",
            subsector: t.subsector || "", industryGroup: t.industryGroup || "",
            industry: t.industry || "", subindustry: t.subindustry || "",
            current: d ? d.current : null,
            values: d ? d.values : [],
            dates: d ? d.dates : [],
          };
        });
      }
    }
  } catch { /* fall through to client-side */ }

  // Fallback: client-side per-ticker loading
  const allDates = await getDates();
  const mult = metricMultiplier(metric);
  const results: (ClassifiedBase & { current: number | null; values: number[]; dates: string[] })[] = [];
  const batchSize = 20;
  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const base: ClassifiedBase & { current: number | null; values: number[]; dates: string[] } = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          current: null, values: [], dates: [],
        };
        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData[metric]) return base;
          const pairs = rawData[metric]
            .filter(([idx]: [number, number]) => idx < allDates.length)
            .sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
          const lastN = pairs.slice(-trailingDays);
          base.values = lastN.map(([, val]: [number, number]) => val * mult);
          base.dates = lastN.map(([idx]: [number, number]) => allDates[idx]);
          base.current = base.values.length > 0 ? base.values[base.values.length - 1] : null;
        } catch { /* skip */ }
        return base;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

// ---- Estimate Revision Momentum ----

export interface RevisionData {
  ticker: string;
  name: string;
  subindustry: string;
  industry: string;
  // Current estimate values
  currentEstimate: number | null;
  // Revision momentum: % change from N days ago
  rev30d: number | null;
  rev60d: number | null;
  rev90d: number | null;
  // Trailing 90d of the estimate for sparkline
  trailValues: number[];
  trailDates: string[];
}

/** Compute revision momentum for a given estimate metric across all tickers.
 *  revNd = (current - Nd_ago) / Nd_ago * 100 */
export async function getRevisionMomentumAll(
  metric: string = "FFO FY2"
): Promise<RevisionData[]> {
  const tickersMeta = await getTickers();

  // Try server-side batch endpoint first
  try {
    const { apiRequest } = await import("@/lib/queryClient");
    const resp = await apiRequest("POST", "/api/batch-revision-momentum", { metric });
    if (resp.ok) {
      const json = await resp.json();
      const batchData = json.data as Record<string, {
        currentEstimate: number | null;
        rev30d: number | null; rev60d: number | null; rev90d: number | null;
        trailValues: number[]; trailDates: string[];
      }>;
      if (batchData) {
        return tickersMeta.map(t => {
          const d = batchData[t.ticker];
          return {
            ticker: t.ticker, name: t.name,
            subindustry: t.subindustry || "", industry: t.industry || "",
            currentEstimate: d ? d.currentEstimate : null,
            rev30d: d ? d.rev30d : null,
            rev60d: d ? d.rev60d : null,
            rev90d: d ? d.rev90d : null,
            trailValues: d ? d.trailValues : [],
            trailDates: d ? d.trailDates : [],
          };
        });
      }
    }
  } catch { /* fall through to client-side */ }

  // Fallback: client-side per-ticker loading
  const allDates = await getDates();
  const results: RevisionData[] = [];
  const batchSize = 20;
  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const base: RevisionData = {
          ticker: t.ticker, name: t.name,
          subindustry: t.subindustry || "", industry: t.industry || "",
          currentEstimate: null, rev30d: null, rev60d: null, rev90d: null,
          trailValues: [], trailDates: [],
        };
        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData[metric]) return base;
          const pairs = rawData[metric]
            .filter(([idx]: [number, number]) => idx < allDates.length)
            .sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
          if (pairs.length === 0) return base;

          const lastPair = pairs[pairs.length - 1];
          const latestVal = lastPair[1];
          base.currentEstimate = latestVal;

          for (const lb of [30, 60, 90] as const) {
            const targetIdx = pairs.length - 1 - lb;
            if (targetIdx >= 0) {
              const pastVal = pairs[targetIdx][1];
              if (pastVal !== 0) {
                const rev = ((latestVal - pastVal) / Math.abs(pastVal)) * 100;
                if (lb === 30) base.rev30d = rev;
                else if (lb === 60) base.rev60d = rev;
                else if (lb === 90) base.rev90d = rev;
              }
            }
          }

          const trail = pairs.slice(-120);
          base.trailValues = trail.map(([, val]: [number, number]) => val);
          base.trailDates = trail.map(([idx]: [number, number]) => allDates[idx]);
        } catch { /* skip */ }
        return base;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

/** Get events for a specific ticker */
export async function getTickerEvents(symbol: string): Promise<Record<string, any>> {
  const events = await getEvents();
  return events[symbol.toUpperCase()] || {};
}

/** Get macro event dates (CPI, NFP, FOMC, GDP) as YYYY-MM-DD strings */
export async function getMacroEventDates(): Promise<Record<string, string[]>> {
  const events = await getEvents();
  return (events["__macro__"] || {}) as Record<string, string[]>;
}

// ---- Performance data ----

export interface PerformanceRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  /** Preset period returns as % (e.g. 5.2 = +5.2%) */
  "1W": number | null;
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  "12M": number | null;
  /** Custom date range return */
  custom: number | null;
  /** Quarterly seasonality returns: Q1..Q4 averages across available years */
  Q1: number | null;
  Q2: number | null;
  Q3: number | null;
  Q4: number | null;
  /** Latest close price */
  lastClose: number | null;
}

/** Map a date string to its index in the dates array using binary search */
function findDateIdx(dates: string[], target: string): number {
  // Find the index of the target date or the closest date <= target
  let lo = 0, hi = dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= target) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

/** Subtract calendar days from a date string (YYYY-MM-DD) */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Compute price return between two date indices */
function priceReturn(closeMap: Map<number, number>, fromIdx: number, toIdx: number): number | null {
  // Find closest available values
  let fromVal: number | null = null;
  let toVal: number | null = null;
  // Walk forward from fromIdx to find first available
  for (let i = fromIdx; i <= Math.min(fromIdx + 5, toIdx); i++) {
    if (closeMap.has(i)) { fromVal = closeMap.get(i)!; break; }
  }
  // Walk backward from toIdx to find last available
  for (let i = toIdx; i >= Math.max(toIdx - 5, fromIdx); i--) {
    if (closeMap.has(i)) { toVal = closeMap.get(i)!; break; }
  }
  if (fromVal === null || toVal === null || fromVal === 0) return null;
  return ((toVal - fromVal) / fromVal) * 100;
}

/** Get performance data for all tickers with preset periods, custom range, and quarterly seasonality */
export async function getPerformanceData(
  customStart?: string,
  customEnd?: string
): Promise<PerformanceRow[]> {
  const tickersMeta = await getTickers();

  // Try server-side batch endpoint first
  try {
    const { apiRequest } = await import("@/lib/queryClient");
    const resp = await apiRequest("POST", "/api/batch-performance", {
      customStart: customStart || undefined,
      customEnd: customEnd || undefined,
    });
    if (resp.ok) {
      const json = await resp.json();
      const serverRows = json.data as PerformanceRow[];
      if (serverRows && serverRows.length > 0) {
        // Merge with ticker metadata for any tickers not in server response
        const serverTickers = new Set(serverRows.map(r => r.ticker));
        const extras: PerformanceRow[] = tickersMeta
          .filter(t => !serverTickers.has(t.ticker))
          .map(t => ({
            ticker: t.ticker, name: t.name,
            economy: t.economy || "", sector: t.sector || "",
            subsector: t.subsector || "", industryGroup: t.industryGroup || "",
            industry: t.industry || "", subindustry: t.subindustry || "",
            "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
            custom: null, Q1: null, Q2: null, Q3: null, Q4: null, lastClose: null,
          }));
        return [...serverRows, ...extras];
      }
    }
  } catch { /* fall through to client-side */ }

  // Fallback: client-side per-ticker loading
  const dates = await getDates();
  const lastIdx = dates.length - 1;
  const lastDate = dates[lastIdx];

  // Compute period start indices (calendar day offsets: 1W=7d, 1M=30d, 3M=91d, 6M=182d, 12M=365d)
  const periodOffsets: Record<string, number> = {
    "1W": 7, "1M": 30, "3M": 91, "6M": 182, "12M": 365,
  };
  const periodStartIdx: Record<string, number> = {};
  for (const [key, days] of Object.entries(periodOffsets)) {
    const startDate = subtractDays(lastDate, days);
    periodStartIdx[key] = Math.max(0, findDateIdx(dates, startDate));
  }

  // Custom range indices
  let customFromIdx = -1, customToIdx = -1;
  if (customStart && customEnd) {
    customFromIdx = findDateIdx(dates, customStart);
    customToIdx = findDateIdx(dates, customEnd);
  }

  // Precompute quarter date ranges for seasonality
  // For each year in the dataset, compute Q1-Q4 returns and average across years
  const firstYear = parseInt(dates[0].slice(0, 4));
  const lastYear = parseInt(lastDate.slice(0, 4));
  const quarterRanges: { quarter: number; fromDate: string; toDate: string }[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    quarterRanges.push(
      { quarter: 1, fromDate: `${y}-01-01`, toDate: `${y}-03-31` },
      { quarter: 2, fromDate: `${y}-04-01`, toDate: `${y}-06-30` },
      { quarter: 3, fromDate: `${y}-07-01`, toDate: `${y}-09-30` },
      { quarter: 4, fromDate: `${y}-10-01`, toDate: `${y}-12-31` },
    );
  }
  const qRangeIndices = quarterRanges.map(qr => ({
    quarter: qr.quarter,
    fromIdx: findDateIdx(dates, qr.fromDate),
    toIdx: findDateIdx(dates, qr.toDate),
  })).filter(q => q.fromIdx >= 0 && q.toIdx > q.fromIdx);

  const results: PerformanceRow[] = [];
  const batchSize = 20;

  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const row: PerformanceRow = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
          custom: null, Q1: null, Q2: null, Q3: null, Q4: null,
          lastClose: null,
        };

        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData.close) return row;
          const closeMap = toIndexMap(rawData.close);

          // Latest close
          for (let i = lastIdx; i >= Math.max(0, lastIdx - 10); i--) {
            if (closeMap.has(i)) { row.lastClose = closeMap.get(i)!; break; }
          }

          // Preset period returns
          for (const key of Object.keys(periodOffsets)) {
            row[key as keyof PerformanceRow] = priceReturn(closeMap, periodStartIdx[key], lastIdx) as any;
          }

          // Custom range return
          if (customFromIdx >= 0 && customToIdx >= 0) {
            row.custom = priceReturn(closeMap, customFromIdx, customToIdx);
          }

          // Quarterly seasonality: average return for each quarter across all years
          const qReturns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
          for (const qr of qRangeIndices) {
            const ret = priceReturn(closeMap, qr.fromIdx, qr.toIdx);
            if (ret !== null) qReturns[qr.quarter].push(ret);
          }
          for (const q of [1, 2, 3, 4]) {
            const arr = qReturns[q];
            if (arr.length > 0) {
              const key = `Q${q}` as keyof PerformanceRow;
              (row as any)[key] = arr.reduce((s, v) => s + v, 0) / arr.length;
            }
          }
        } catch { /* skip */ }
        return row;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Monthly Seasonality
// ────────────────────────────────────────────────────────────────────────────

export const MONTH_KEYS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
export type MonthKey = typeof MONTH_KEYS[number];

export interface MonthlySeasonalityRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  Jan: number | null; Feb: number | null; Mar: number | null;
  Apr: number | null; May: number | null; Jun: number | null;
  Jul: number | null; Aug: number | null; Sep: number | null;
  Oct: number | null; Nov: number | null; Dec: number | null;
  /** Number of years of data used */
  yearsOfData: number;
}

export async function getMonthlySeasonality(): Promise<MonthlySeasonalityRow[]> {
  const tickersMeta = await getTickers();
  const dates = await getDates();

  // Build month ranges: for each year, compute returns from 1st to last trading day of each month
  const firstYear = parseInt(dates[0].slice(0, 4));
  const lastYear = parseInt(dates[dates.length - 1].slice(0, 4));
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const monthRanges: { month: number; fromDate: string; toDate: string }[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    for (let m = 0; m < 12; m++) {
      const mm = String(m + 1).padStart(2, "0");
      const lastDay = m === 1 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : daysInMonth[m];
      monthRanges.push({
        month: m,
        fromDate: `${y}-${mm}-01`,
        toDate: `${y}-${mm}-${lastDay}`,
      });
    }
  }

  const mRangeIndices = monthRanges.map(mr => ({
    month: mr.month,
    fromIdx: findDateIdx(dates, mr.fromDate),
    toIdx: findDateIdx(dates, mr.toDate),
  })).filter(m => m.fromIdx >= 0 && m.toIdx > m.fromIdx);

  const results: MonthlySeasonalityRow[] = [];
  const batchSize = 20;

  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const row: MonthlySeasonalityRow = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          Jan: null, Feb: null, Mar: null, Apr: null, May: null, Jun: null,
          Jul: null, Aug: null, Sep: null, Oct: null, Nov: null, Dec: null,
          yearsOfData: 0,
        };

        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData.close) return row;
          const closeMap = toIndexMap(rawData.close);

          const monthReturns: Record<number, number[]> = {};
          for (let i = 0; i < 12; i++) monthReturns[i] = [];

          for (const mr of mRangeIndices) {
            const ret = priceReturn(closeMap, mr.fromIdx, mr.toIdx);
            if (ret !== null) monthReturns[mr.month].push(ret);
          }

          let maxYears = 0;
          for (let i = 0; i < 12; i++) {
            const arr = monthReturns[i];
            if (arr.length > 0) {
              (row as any)[MONTH_KEYS[i]] = arr.reduce((s, v) => s + v, 0) / arr.length;
              maxYears = Math.max(maxYears, arr.length);
            }
          }
          row.yearsOfData = maxYears;
        } catch { /* skip */ }
        return row;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Event-Driven Returns (Post-Earnings, Post-Ex-Div)
// ────────────────────────────────────────────────────────────────────────────

export type EventType = "earnings" | "ex_div" | "CPI" | "NFP" | "FOMC" | "GDP";
export const MACRO_EVENT_TYPES: EventType[] = ["CPI", "NFP", "FOMC", "GDP"];
export function isMacroEvent(et: EventType): boolean { return MACRO_EVENT_TYPES.includes(et); }
export const EVENT_WINDOWS_POST = [1, 5, 10, 21, 63] as const; // post-event: 1D, 1W, 2W, 1M, 3M
export const EVENT_WINDOWS_PRE = [-21, -10, -5, -1] as const; // pre-event: -1M, -2W, -1W, -1D
export const EVENT_WINDOWS = [...EVENT_WINDOWS_PRE, ...EVENT_WINDOWS_POST] as const;
export const EVENT_WINDOW_LABELS: Record<number, string> = {
  "-21": "-1M", "-10": "-2W", "-5": "-1W", "-1": "-1D",
  1: "+1D", 5: "+1W", 10: "+2W", 21: "+1M", 63: "+3M",
} as any;
/** Whether the event type supports pre-event windows */
export function eventHasPreWindows(et: EventType): boolean {
  return et === "earnings";
}

export interface EventReturnRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  eventType: EventType;
  /** Number of events used for averaging */
  eventCount: number;
  /** Average return for each window */
  avg: Record<number, number | null>;
  /** Win rate (% of events with positive return) for each window */
  winRate: Record<number, number | null>;
  /** Median return for each window */
  median: Record<number, number | null>;
}

/** Convert MM/DD/YYYY to YYYY-MM-DD */
function convertEventDate(d: string): string {
  const parts = d.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  return d; // already YYYY-MM-DD
}

export async function getEventReturns(eventType: EventType): Promise<EventReturnRow[]> {
  const tickersMeta = await getTickers();
  const dates = await getDates();
  const allEvents = await getEvents();

  // Build a date->index map for fast lookup
  const dateToIdx = new Map<string, number>();
  dates.forEach((d, i) => dateToIdx.set(d, i));

  // Also build sorted index array for "N trading days after" lookup
  const indexArray = dates.map((_, i) => i);

  // For macro events, get the shared date array from __macro__
  const macroEvents = allEvents["__macro__"] || {};
  const isMacro = isMacroEvent(eventType);
  const sharedMacroDates: string[] = isMacro
    ? (macroEvents[eventType] || []).map((d: string) => d.includes("/") ? convertEventDate(d) : d)
    : [];

  const results: EventReturnRow[] = [];
  const batchSize = 20;

  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const row: EventReturnRow = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          eventType,
          eventCount: 0,
          avg: {}, winRate: {}, median: {},
        };
        const hasPre = eventHasPreWindows(eventType);
        const windowsToUse = hasPre ? EVENT_WINDOWS : EVENT_WINDOWS_POST;
        for (const w of windowsToUse) {
          row.avg[w] = null;
          row.winRate[w] = null;
          row.median[w] = null;
        }

        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData.close) return row;
          const closeMap = toIndexMap(rawData.close);

          // For macro events use the shared dates; for ticker events use per-ticker dates
          let eventDates: string[];
          if (isMacro) {
            eventDates = sharedMacroDates;
          } else {
            const tickerEvents = allEvents[t.ticker] || allEvents[t.ticker.toUpperCase()] || {};
            // Map EventType to actual JSON key (ex_div -> ex_dividend)
            const jsonKey = eventType === "ex_div" ? "ex_dividend" : eventType;
            eventDates = (tickerEvents[jsonKey] || tickerEvents[eventType] || []).map(convertEventDate);
          }

          if (eventDates.length === 0) return row;

          // For each event date, find the date index, then compute return for each window
          const windowReturns: Record<number, number[]> = {};
          for (const w of windowsToUse) windowReturns[w] = [];

          let counted = 0;
          for (const ed of eventDates) {
            // Find the event date index (or closest trading day on/after)
            let eventIdx = dateToIdx.get(ed);
            if (eventIdx === undefined) {
              // Find next trading day
              const found = findDateIdx(dates, ed);
              if (found < 0) continue;
              // findDateIdx returns last date <= target; we want on or after
              eventIdx = found;
              if (dates[found] < ed && found + 1 < dates.length) eventIdx = found + 1;
            }

            // Check we have close data at this point
            let eventClose: number | undefined;
            for (let i = eventIdx; i <= Math.min(eventIdx + 3, dates.length - 1); i++) {
              if (closeMap.has(i)) { eventClose = closeMap.get(i)!; eventIdx = i; break; }
            }
            if (eventClose === undefined) continue;

            counted++;
            for (const w of windowsToUse) {
              if (w > 0) {
                // Post-event: return from event close to future close
                const futureIdx = eventIdx + w;
                if (futureIdx >= dates.length) continue;
                let futureClose: number | undefined;
                for (let i = futureIdx; i >= Math.max(futureIdx - 3, eventIdx + 1); i--) {
                  if (closeMap.has(i)) { futureClose = closeMap.get(i)!; break; }
                }
                if (futureClose !== undefined && eventClose !== 0) {
                  windowReturns[w].push(((futureClose - eventClose) / eventClose) * 100);
                }
              } else {
                // Pre-event: return from past close to event close
                const pastIdx = eventIdx + w; // w is negative
                if (pastIdx < 0) continue;
                let pastClose: number | undefined;
                for (let i = pastIdx; i <= Math.min(pastIdx + 3, eventIdx - 1); i++) {
                  if (closeMap.has(i)) { pastClose = closeMap.get(i)!; break; }
                }
                if (pastClose !== undefined && pastClose !== 0) {
                  windowReturns[w].push(((eventClose - pastClose) / pastClose) * 100);
                }
              }
            }
          }

          row.eventCount = counted;

          for (const w of windowsToUse) {
            const arr = windowReturns[w];
            if (arr.length === 0) continue;
            row.avg[w] = arr.reduce((s, v) => s + v, 0) / arr.length;
            row.winRate[w] = (arr.filter(v => v > 0).length / arr.length) * 100;
            const sorted = [...arr].sort((a, b) => a - b);
            row.median[w] = sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)];
          }
        } catch { /* skip */ }
        return row;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────────
// Seasonal Pattern Detection
// ────────────────────────────────────────────────────────────────────────────────

export interface SeasonalWindow {
  /** Start month-day as "MMM DD" e.g. "Dec 15" */
  startLabel: string;
  /** End month-day as "MMM DD" e.g. "Jan 28" */
  endLabel: string;
  /** Start as MM-DD for sorting */
  startMMDD: string;
  /** End as MM-DD for sorting */
  endMMDD: string;
  /** Average return across all years in this window (%) */
  avgReturn: number;
  /** Median return across all years (%) */
  medianReturn: number;
  /** Fraction of years where return was positive (0-100) */
  winRate: number;
  /** Number of years used */
  years: number;
  /** Approximate t-statistic (avgReturn * sqrt(N) / stdev) */
  tStat: number;
  /** Individual year returns for drill-down */
  yearReturns: { year: number; ret: number }[];
  /** Approximate calendar days in this window */
  calendarDays: number;
}

export interface SeasonalPatternRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  /** Top bullish (positive) seasonal windows, ranked by t-stat */
  bullish: SeasonalWindow[];
  /** Top bearish (negative) seasonal windows, ranked by |t-stat| */
  bearish: SeasonalWindow[];
  /** Number of years of price data available */
  yearsOfData: number;
}

const MONTH_ABBRS_SEASONAL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function mmddToLabel(mmdd: string): string {
  const [mm, dd] = mmdd.split("-");
  return `${MONTH_ABBRS_SEASONAL[parseInt(mm) - 1]} ${parseInt(dd)}`;
}

/**
 * Detect seasonal patterns for all tickers.
 * Scans candidate start/end day-of-year windows, computes cross-year returns,
 * and surfaces the strongest recurring patterns.
 * @param topN - max number of bullish/bearish windows to return per ticker
 * @param minDays - minimum calendar days for a window (default 5)
 * @param maxDays - maximum calendar days for a window (default 180)
 */
export async function getSeasonalPatterns(
  topN: number = 5,
  minDays: number = 5,
  maxDays: number = 180,
): Promise<SeasonalPatternRow[]> {
  const tickersMeta = await getTickers();
  const dates = await getDates();
  if (dates.length === 0) return [];

  const firstYear = parseInt(dates[0].slice(0, 4));
  const lastYear = parseInt(dates[dates.length - 1].slice(0, 4));

  // Create anchor MM-DD pairs stepping ~5 days through the year (73 anchors)
  const anchors: string[] = [];
  for (let d = 0; d < 366; d += 5) {
    const dt = new Date(Date.UTC(2024, 0, 1 + d));
    if (dt.getUTCFullYear() !== 2024) break;
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    anchors.push(`${mm}-${dd}`);
  }

  // Pre-compute: for each year and each anchor, find the closest date index
  const yearRange = lastYear - firstYear + 1;
  const anchorIdxArr: number[][] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const yRow: number[] = [];
    for (const a of anchors) {
      const dateStr = `${y}-${a}`;
      const idx = findDateIdx(dates, dateStr);
      if (idx >= 0 && dates[idx]) {
        const foundYear = parseInt(dates[idx].slice(0, 4));
        if (foundYear === y || foundYear === y - 1) {
          yRow.push(idx);
        } else {
          yRow.push(-1);
        }
      } else {
        yRow.push(-1);
      }
    }
    anchorIdxArr.push(yRow);
  }

  // Define candidate windows: compute offset range from minDays/maxDays
  // Each anchor step ≈ 5 calendar days
  const minOffset = Math.max(1, Math.floor(minDays / 5));
  const maxOffset = Math.min(anchors.length - 1, Math.ceil(maxDays / 5));
  const candidates: { startA: number; endA: number; startMMDD: string; endMMDD: string; approxDays: number }[] = [];
  for (let s = 0; s < anchors.length; s++) {
    for (let offset = minOffset; offset <= maxOffset; offset++) {
      const e = (s + offset) % anchors.length;
      const approxDays = offset * 5;
      if (approxDays < minDays || approxDays > maxDays) continue;
      candidates.push({
        startA: s,
        endA: e,
        startMMDD: anchors[s],
        endMMDD: anchors[e],
        approxDays,
      });
    }
  }

  const results: SeasonalPatternRow[] = [];
  const batchSize = 20;

  for (let b = 0; b < tickersMeta.length; b += batchSize) {
    const batch = tickersMeta.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const row: SeasonalPatternRow = {
          ticker: t.ticker, name: t.name,
          economy: t.economy || "", sector: t.sector || "",
          subsector: t.subsector || "", industryGroup: t.industryGroup || "",
          industry: t.industry || "", subindustry: t.subindustry || "",
          bullish: [], bearish: [], yearsOfData: 0,
        };

        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData.close) return row;
          const closeMap = toIndexMap(rawData.close);

          // Determine years of data
          const firstDataIdx = rawData.close[0]?.[0] ?? 0;
          const lastDataIdx = rawData.close[rawData.close.length - 1]?.[0] ?? 0;
          const firstDataYear = parseInt(dates[firstDataIdx]?.slice(0, 4) || "9999");
          const lastDataYear = parseInt(dates[lastDataIdx]?.slice(0, 4) || "0");
          row.yearsOfData = lastDataYear - firstDataYear + 1;

          if (row.yearsOfData < 3) return row;

          // Evaluate each candidate window across years
          type ScoredWindow = SeasonalWindow & { absT: number };
          const scored: ScoredWindow[] = [];

          for (const cand of candidates) {
            const yearReturns: { year: number; ret: number }[] = [];

            for (let yi = 0; yi < yearRange; yi++) {
              const y = firstYear + yi;
              let sIdx: number, eIdx: number;

              if (cand.endA > cand.startA) {
                // Same-year window (e.g., Mar 1 → May 15)
                sIdx = anchorIdxArr[yi][cand.startA];
                eIdx = anchorIdxArr[yi][cand.endA];
              } else {
                // Cross-year window (e.g., Dec 15 → Jan 28)
                sIdx = anchorIdxArr[yi][cand.startA];
                if (yi + 1 >= yearRange) continue;
                eIdx = anchorIdxArr[yi + 1][cand.endA];
              }

              if (sIdx < 0 || eIdx < 0 || eIdx <= sIdx) continue;

              const ret = priceReturn(closeMap, sIdx, eIdx);
              if (ret !== null) {
                yearReturns.push({ year: y, ret });
              }
            }

            if (yearReturns.length < 3) continue;

            const rets = yearReturns.map(yr => yr.ret);
            const n = rets.length;
            const mean = rets.reduce((s, v) => s + v, 0) / n;
            const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
            const stdev = Math.sqrt(variance);
            const tStat = stdev > 0.001 ? (mean * Math.sqrt(n)) / stdev : 0;

            const sortedRets = [...rets].sort((a2, b2) => a2 - b2);
            const median = n % 2 === 0
              ? (sortedRets[n / 2 - 1] + sortedRets[n / 2]) / 2
              : sortedRets[Math.floor(n / 2)];

            const winRate = (rets.filter(r => r > 0).length / n) * 100;

            scored.push({
              startLabel: mmddToLabel(cand.startMMDD),
              endLabel: mmddToLabel(cand.endMMDD),
              startMMDD: cand.startMMDD,
              endMMDD: cand.endMMDD,
              avgReturn: mean,
              medianReturn: median,
              winRate,
              years: n,
              tStat,
              yearReturns,
              calendarDays: cand.approxDays,
              absT: Math.abs(tStat),
            });
          }

          // Deduplicate overlapping windows: keep strongest |t-stat|
          scored.sort((a2, b2) => b2.absT - a2.absT);

          const isOverlapping = (wa: ScoredWindow, wb: ScoredWindow): boolean => {
            const sa = anchors.indexOf(wa.startMMDD);
            const sb = anchors.indexOf(wb.startMMDD);
            const ea = anchors.indexOf(wa.endMMDD);
            const eb = anchors.indexOf(wb.endMMDD);
            const startDist = Math.min(Math.abs(sa - sb), anchors.length - Math.abs(sa - sb));
            const endDist = Math.min(Math.abs(ea - eb), anchors.length - Math.abs(ea - eb));
            return startDist <= 2 && endDist <= 2;
          };

          for (const w of scored) {
            if (w.tStat > 0 && row.bullish.length < topN) {
              const overlaps = row.bullish.some(existing =>
                isOverlapping(w, existing as unknown as ScoredWindow)
              );
              if (!overlaps) {
                const { absT: _absT, ...windowData } = w;
                row.bullish.push(windowData);
              }
            }
            if (w.tStat < 0 && row.bearish.length < topN) {
              const overlaps = row.bearish.some(existing =>
                isOverlapping(w, existing as unknown as ScoredWindow)
              );
              if (!overlaps) {
                const { absT: _absT2, ...windowData2 } = w;
                row.bearish.push(windowData2);
              }
            }
          }
        } catch { /* skip */ }
        return row;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── ClassFilters helpers ─────────────────────────────────────────────────────
// Re-exported here so pages can import from a single "@/lib/dataService" entry
// point rather than reaching into "@/components/ClassificationFilters" directly.
export type { ClassFilters } from "@/components/ClassificationFilters";
export {
  emptyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  applyClassFilters,
} from "@/components/ClassificationFilters";

// ─── Extra utilities used by optimizer pages ────────────────────────────────

/**
 * Filter an array of objects that have a `date` string property to a
 * [startDate, endDate] range (inclusive). Both bounds are optional.
 */
export function filterByDateRange(rows: any, startDate?: any, endDate?: any): any;
export function filterByDateRange<T extends { date: string }>(rows: T[], startDate?: string | null, endDate?: string | null): T[];
export function filterByDateRange(rows: any, startDate?: any, endDate?: any): any {
  if (Array.isArray(rows)) {
    let result = rows;
    if (startDate) result = result.filter((r: any) => r.date >= startDate);
    if (endDate) result = result.filter((r: any) => r.date <= endDate);
    return result;
  }
  // Object format (RawTickerData with dates, adjCloses, etc.)
  return rows;
}

/**
 * Invalidate cached ticker data so the next fetch re-hits the server.
 * No-op in the current implementation — retained for API compatibility.
 */
export async function refreshTickerData(ticker: string): Promise<void> {
  // Invalidate queryClient cache for this ticker if available
  try {
    const { queryClient: qc } = await import("./queryClient");
    qc.invalidateQueries({ queryKey: ["ticker", ticker] });
  } catch {
    // silently ignore if queryClient not available
  }
}

// ── Missing stubs referenced by multiple pages ────────────────────────────

export { weeklyDownsample } from "@/lib/weeklyDownsample";

/** Alias for getMetricForAllTickers */
export async function getLatestMetricForAllTickers(metric: string, _opts?: any): Promise<any[]> {
  return getMetricForAllTickers(metric);
}

/** Filter tickers by a classification dimension value */
export function filterTickersByDimension(
  tickers: any[],
  dimension: string,
  value: string
): any[] {
  return tickers.filter((t) => t[dimension] === value);
}

/** Get a group median series for a basket of tickers */
export async function getGroupMedianSeries(
  _tickers: string[],
  _metric: string,
  _getMetricSeries?: any
): Promise<any> {
  return { dates: [], values: [] };
}

/** Fetch close series for a ticker (alias for fetchCloseSeries pattern) */
export async function getCloseSeries(
  _ticker: string,
  _field?: string
): Promise<any[]> {
  return [];
}

/** Get earnings dates for a ticker */
export async function getEarningsDates(_ticker: string): Promise<string[]> {
  return [];
}

/** Classification dimension keys (alias for CLASSIFICATION_KEYS) */
export const CLASSIFICATION_DIMENSIONS: string[] = [
  "economy", "sector", "subsector", "industryGroup", "industry", "subindustry",
];
export const CLASSIFICATION_DIMENSION_KEYS = CLASSIFICATION_DIMENSIONS;

/** Get group median by index */
export async function getGroupMedianByIndex(
  _tickers: string[],
  _metric: string,
  _opts?: any
): Promise<any> {
  return null;
}

/** Stub: fetch raw ticker data for workbook input selection */
export async function getTickerRawWorkbook(...args: any[]): Promise<any> { return null; }
