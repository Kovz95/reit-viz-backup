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
  if (_cache.has(ticker)) return _cache.get(ticker)!;
  const existing = _inFlight.get(ticker);
  if (existing) return existing;

  const enc = encodeURIComponent(ticker);
  const p = (async () => {
    const data =
      (await tryFetchJson(`/data/tickers/${enc}.json`)) ??
      (await tryFetchJson(`/api/ticker/${enc}`));
    let result: RawTicker | null = null;
    if (data && typeof data === "object") {
      result = {
        dates: Array.isArray(data.dates) ? data.dates : [],
        metrics: data.metrics && typeof data.metrics === "object" ? data.metrics : {},
      };
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
  return out;
}
