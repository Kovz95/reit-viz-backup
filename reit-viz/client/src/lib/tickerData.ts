// Shared per-ticker data loader.
//
// The LIVE production backend (the original server) serves per-ticker price +
// fundamental data at GET /api/ticker/<symbol>, returning
//   { dates: string[], metrics: Record<string, (number|null)[]> }
// (each metric array is index-aligned to `dates`; missing observations are null,
//  and may be run-length-encoded as "~N" for N consecutive nulls).
//
// The reconstruction had invented separate GET routes — /api/ohlcv,
// /api/ticker-data, /api/workbook/data, /api/workbook/series, /api/metric-series —
// that the live backend does not serve. Those routes returned the SPA index.html,
// which blew up res.json() as `Unexpected token '<' … is not valid JSON`.
//
// Following the globalUniverse.ts template (commit faa71ea): try the static export
// first (/data/tickers/<sym>.json), fall back to the API (/api/ticker/<sym>), and
// guard against an HTML response so a missing route degrades to a miss instead of
// crashing. Results are cached per ticker (these loaders run in tight per-ticker
// loops across hundreds of names).

export interface RawTicker {
  dates: string[];
  metrics: Record<string, any[]>;
}

export type SparsePair = [number, number];

const _cache = new Map<string, RawTicker | null>();
const _inFlight = new Map<string, Promise<RawTicker | null>>();

/** Drop the in-memory per-ticker records so the next fetch re-reads IDB/API.
 *  Called by dataService's cache clears (data uploads/wipes) — without this,
 *  pages on this loader path (Attribution, optimizers) keep serving records
 *  from before the upload for any ticker already visited this session. */
export function clearRawTickerCache() {
  _cache.clear();
  _inFlight.clear();
}

function looksLikeHtml(text: string): boolean {
  return !text || text.trimStart().startsWith("<");
}

async function tryFetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (looksLikeHtml(text)) return null; // SPA index.html, not JSON
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Fetch raw { dates, metrics } for a ticker, static-first with API fallback. */
export async function fetchTickerRaw(ticker: string): Promise<RawTicker | null> {
  const raw = await fetchTickerRawBase(ticker);
  if (!raw) return raw;
  // Alias the Universe-tab default pseudo-metrics onto the metrics record so
  // consumers of this path (fetchTickerData, fetchTickerOHLCV pages) resolve
  // them for free. Per call, not cached — the rules live in localStorage.
  try {
    const [{ DEFAULT_SLOT_KEYS, DEFAULT_METRIC_SLOTS, resolveDefaultMetricFor }, { getTickers }] =
      await Promise.all([import("@/lib/defaultEarningsMetric"), import("@/lib/dataService")]);
    const metas = await getTickers();
    const meta = metas.find((t: any) => String(t.ticker).toUpperCase() === ticker.toUpperCase());
    let metrics: Record<string, any[]> | null = null;
    for (const slot of DEFAULT_SLOT_KEYS) {
      const pseudo = DEFAULT_METRIC_SLOTS[slot].pseudo;
      const arr = raw.metrics[resolveDefaultMetricFor(pseudo, meta)];
      if (arr) {
        metrics = metrics ?? { ...raw.metrics };
        metrics[pseudo] = arr;
      }
    }
    return metrics ? { ...raw, metrics } : raw;
  } catch {
    return raw;
  }
}

// Off-universe symbols only: fetch daily OHLCV from Yahoo as a self-describing
// {dates, metrics} record. Returns null for a curated universe ticker (a gap
// there is genuine, not a Yahoo case) or when Yahoo has nothing.
async function yahooTickerRaw(ticker: string): Promise<RawTicker | null> {
  const key = ticker.toUpperCase();
  try {
    const { getTickers } = await import("@/lib/dataService");
    const metas = await getTickers();
    if (metas.some((t: any) => String(t.ticker).toUpperCase() === key)) return null;
  } catch { /* universe unknown — still attempt Yahoo */ }
  const { fetchYahooDaily } = await import("@/lib/yahooFallback");
  const y = await fetchYahooDaily(key);
  if (!y || !y.dates.length) return null;
  const metrics: Record<string, any[]> = {
    close: y.closes,
    open: y.opens,
    high: y.highs,
    low: y.lows,
  };
  if (y.volumes.length === y.dates.length) metrics.volume = y.volumes;
  return { dates: y.dates, metrics };
}

async function fetchTickerRawBase(ticker: string): Promise<RawTicker | null> {
  if (_cache.has(ticker)) return _cache.get(ticker)!;
  const existing = _inFlight.get(ticker);
  if (existing) return existing;

  const enc = encodeURIComponent(ticker);
  const p = (async () => {
    // Session-persistent cache first (TTL managed inside priceCacheIDB)
    try {
      const { idbGetFresh } = await import("@/lib/priceCacheIDB");
      const cached = (await idbGetFresh(`td:${ticker}`)) as RawTicker | null;
      if (cached && Array.isArray(cached.dates) && cached.dates.length > 0) {
        _cache.set(ticker, cached);
        _inFlight.delete(ticker);
        return cached;
      }
    } catch { /* fall through to network */ }
    const data =
      (await tryFetchJson(`/data/tickers/${enc}.json`)) ??
      (await tryFetchJson(`/api/ticker/${enc}`));
    let result: RawTicker | null = null;
    if (data && typeof data === "object") {
      result = {
        dates: Array.isArray(data.dates) ? data.dates : [],
        metrics: data.metrics && typeof data.metrics === "object" ? data.metrics : {},
      };
      if (result.dates.length > 0) {
        void import("@/lib/priceCacheIDB").then(({ idbPut }) => idbPut(`td:${ticker}`, result)).catch(() => {});
      }
    }

    // Off-universe Yahoo fallback: no workbook static/API data for a symbol that
    // isn't a curated universe ticker (AAPL, SPY, ^TNX typed into an optimizer
    // picker). This model is self-describing, so map Yahoo's arrays 1:1 onto
    // `dates` — no global-axis remap needed here.
    if (!result || result.dates.length === 0) {
      const y = await yahooTickerRaw(ticker);
      if (y) {
        result = y;
        void import("@/lib/priceCacheIDB").then(({ idbPut }) => idbPut(`td:${ticker}`, y)).catch(() => {});
      }
    }

    _cache.set(ticker, result);
    _inFlight.delete(ticker);
    return result;
  })();
  _inFlight.set(ticker, p);
  return p;
}

/** Expand "~N" run-length-encoded null runs into N explicit nulls. */
function expandRLE(arr: any[]): any[] {
  let hasRLE = false;
  for (const v of arr) {
    if (typeof v === "string") { hasRLE = true; break; }
  }
  if (!hasRLE) return arr;
  const out: any[] = [];
  for (const v of arr) {
    if (typeof v === "string" && v.startsWith("~")) {
      const n = parseInt(v.slice(1));
      for (let k = 0; k < n; k++) out.push(null);
    } else {
      out.push(v);
    }
  }
  return out;
}

/**
 * Port of the original bundle's gL(): turn each metric's index-aligned array into
 * compact [index, value] pairs (dropping null / NaN), expanding "~N" RLE null-runs
 * and tolerating arrays that are already pair-encoded.
 */
export function toSparseMetrics(
  metrics: Record<string, any[]>,
  cutoff?: number | null
): Record<string, SparsePair[]> {
  const out: Record<string, SparsePair[]> = {};
  for (const [name, raw] of Object.entries(metrics)) {
    if (!Array.isArray(raw)) { out[name] = []; continue; }

    let firstNonNull: any = null;
    for (const v of raw) if (v != null) { firstNonNull = v; break; }
    const isPairs =
      Array.isArray(firstNonNull) && firstNonNull.length === 2 &&
      typeof firstNonNull[0] === "number" && typeof firstNonNull[1] === "number";

    const pairs: SparsePair[] = [];
    if (isPairs) {
      for (const v of raw) {
        if (!Array.isArray(v) || v.length !== 2) continue;
        const idx = v[0], val = v[1];
        if (typeof idx !== "number" || typeof val !== "number") continue;
        if (val === null || Number.isNaN(val)) continue;
        if (cutoff != null && idx >= cutoff) continue;
        pairs.push([idx, val]);
      }
    } else {
      const arr = expandRLE(raw);
      const end = cutoff != null ? Math.min(arr.length, cutoff) : arr.length;
      for (let i = 0; i < end; i++) {
        const v = arr[i];
        if (v != null && typeof v === "number" && !Number.isNaN(v)) pairs.push([i, v]);
      }
    }
    out[name] = pairs;
  }
  return out;
}

export interface DenseOHLCV {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

/** Build dense parallel OHLCV arrays from raw, keeping only days with a valid close. */
export function toDenseOHLCV(raw: RawTicker): DenseOHLCV {
  const dates = raw.dates;
  const close = expandRLE(raw.metrics.close ?? raw.metrics.Close ?? []);
  const open = expandRLE(raw.metrics.open ?? raw.metrics.Open ?? []);
  const high = expandRLE(raw.metrics.high ?? raw.metrics.High ?? []);
  const low = expandRLE(raw.metrics.low ?? raw.metrics.Low ?? []);
  const vol = expandRLE(raw.metrics.volume ?? raw.metrics.Volume ?? []);

  const out: DenseOHLCV = { dates: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
  const n = Math.min(dates.length, close.length);
  const num = (v: any, fallback: number): number =>
    typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  for (let i = 0; i < n; i++) {
    const c = close[i];
    if (typeof c !== "number" || Number.isNaN(c)) continue;
    out.dates.push(dates[i]);
    out.closes.push(c);
    out.opens.push(num(open[i], c));
    out.highs.push(num(high[i], c));
    out.lows.push(num(low[i], c));
    out.volumes.push(num(vol[i], 0));
  }
  return out;
}

/** Dense [{time, value}] series for a single metric (drops null / NaN). */
export function getDenseSeries(
  raw: RawTicker,
  metric: string
): { time: string; value: number }[] {
  const dates = raw.dates;
  const arr = expandRLE(raw.metrics[metric] ?? []);
  const out: { time: string; value: number }[] = [];
  const n = Math.min(arr.length, dates.length);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (typeof v === "number" && !Number.isNaN(v)) out.push({ time: dates[i], value: v });
  }
  return extendStaleMultiple(raw, metric, out);
}

// "P/FFO FY2", "P/FFO (FY1)", "P/E LTM", "P/AFFO (FY0)", … → family + period.
const MULTIPLE_METRIC_RE = /^P\/(FFO|AFFO|E)\s*(?:\((FY\d|LTM)\)|(FY\d|LTM))\s*$/i;

/** Parse a stored price-multiple metric name into its family/period and the
 *  matching per-share estimate metric ("P/FFO FY2" → "FFO FY2"). Shared with
 *  dataService's sparse-pairs path so both read paths freshen stale tails. */
export function parseMultipleMetric(
  metric: string
): { family: string; period: string; estimateMetric: string } | null {
  const m = metric.trim().match(MULTIPLE_METRIC_RE);
  if (!m) return null;
  const family = m[1].toUpperCase() === "E" ? "EPS" : m[1].toUpperCase();
  const period = (m[2] ?? m[3] ?? "").toUpperCase();
  return { family, period, estimateMetric: `${family} ${period}` };
}

/** Stored price multiples sometimes stop updating days before the close
 *  series does (vendor lag — e.g. AHR's P/FFO columns froze at 2026-07-20
 *  while close and the FFO estimates kept printing through 2026-07-24). The
 *  stored columns equal close ÷ estimate exactly (verified to 4 decimals), so
 *  extend the stale tail with that same formula, forward-filling the estimate
 *  over gaps. Only APPENDS after the last stored point — stored values are
 *  never rewritten and mid-series gaps are left alone. */
function extendStaleMultiple(
  raw: RawTicker,
  metric: string,
  out: { time: string; value: number }[]
): { time: string; value: number }[] {
  if (out.length === 0) return out;
  const dates = raw.dates;
  const lastTime = out[out.length - 1].time;
  if (!dates.length || dates[dates.length - 1] <= lastTime) return out; // already fresh
  const pm = parseMultipleMetric(metric);
  if (!pm) return out;
  const estRaw = raw.metrics[pm.estimateMetric];
  const closeRaw = raw.metrics.close;
  if (!estRaw || !closeRaw) return out;
  let tailStart = dates.length - 1;
  while (tailStart > 0 && dates[tailStart - 1] > lastTime) tailStart--;
  const est = expandRLE(estRaw);
  const close = expandRLE(closeRaw);
  // Last known estimate at/before the tail (estimates are stepwise).
  let lastEst: number | null = null;
  for (let i = Math.min(tailStart, est.length) - 1; i >= 0; i--) {
    const e = est[i];
    if (typeof e === "number" && Number.isFinite(e) && e !== 0) { lastEst = e; break; }
  }
  for (let i = tailStart; i < dates.length; i++) {
    const e = est[i];
    if (typeof e === "number" && Number.isFinite(e) && e !== 0) lastEst = e;
    const c = close[i];
    if (lastEst != null && typeof c === "number" && Number.isFinite(c) && c > 0) {
      out.push({ time: dates[i], value: c / lastEst });
    }
  }
  return out;
}
