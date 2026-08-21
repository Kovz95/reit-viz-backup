/**
 * Static-mode macro data helpers.
 * When deployed as a static site (no backend), fetches macro data from
 * pre-bundled JSON files in /data/macro/ instead of /api/macro/* endpoints.
 */
import { apiRequest } from "./queryClient";

/** 
 * Always use static mode for macro/correlation data.
 * The pre-bundled JSON files in /data/macro/ are the canonical data source.
 * This works both in local dev (server serves the static files) and deployed.
 */
function isStaticMode(): boolean {
  return true;
}

export interface MacroSeriesMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
  freq?: string;
  cached?: boolean;
  lastUpdate?: string | null;
  computed?: boolean;
}

export interface DataPoint {
  time: string;
  value: number;
}

interface ComputedSpec {
  label: string;
  category: string;
  unit: string;
  seriesA: string;
  seriesB: string;
  op: "subtract";
}

let _catalogCache: MacroSeriesMeta[] | null = null;
let _computedSpecCache: Record<string, ComputedSpec> | null = null;

/** Fetch the macro catalog (list of all available series) */
export async function fetchMacroCatalog(): Promise<MacroSeriesMeta[]> {
  if (_catalogCache) return _catalogCache;

  if (isStaticMode()) {
    // Same guard as fetchStaticSeries: a MISSING static path answers with the
    // SPA's index.html (200 text/html), so resp.ok alone is not enough —
    // unguarded, that json() throw killed the whole Macro page (0 panes).
    // Fall back to /api/macro/catalog, which builds the catalog server-side.
    try {
      const resp = await fetch("data/macro/catalog.json");
      if (resp.ok && (resp.headers.get("content-type") ?? "").includes("json")) {
        const j = await resp.json();
        if (Array.isArray(j) && j.length > 0) {
          _catalogCache = j;
          return _catalogCache!;
        }
      }
    } catch { /* fall through to the API */ }
  }
  const resp = await apiRequest("GET", "/api/macro/catalog");
  _catalogCache = await resp.json();
  return _catalogCache!;
}

/** Fetch computed series specs (for computing spreads client-side) */
async function getComputedSpecs(): Promise<Record<string, ComputedSpec>> {
  if (_computedSpecCache) return _computedSpecCache;
  if (isStaticMode()) {
    try {
      const resp = await fetch("data/macro/computed-spec.json");
      if (resp.ok) {
        _computedSpecCache = await resp.json();
        return _computedSpecCache!;
      }
    } catch {}
  }
  _computedSpecCache = {};
  return _computedSpecCache;
}

/** Fetch a single static macro series JSON */
export async function fetchStaticSeries(id: string): Promise<DataPoint[]> {
  // Static file first (cron-prefetched). The prod server answers MISSING
  // static paths with the SPA's index.html (200 text/html) — resp.ok alone
  // is not enough, so guard the content type (this was crashing
  // /rates-forward with "Unexpected token '<'"). When the file is missing
  // or its tail is stale, fall back to /api/macro/series, which curls FRED
  // live on the server and caches to disk.
  let staticData: DataPoint[] = [];
  try {
    const resp = await fetch(`data/macro/${id}.json`);
    if (resp.ok && (resp.headers.get("content-type") ?? "").includes("json")) {
      const j = await resp.json();
      if (Array.isArray(j)) staticData = j;
    }
  } catch { /* fall through to the API */ }
  const freshEnough =
    staticData.length > 0 &&
    Date.now() - new Date(String(staticData[staticData.length - 1].time)).getTime() < 7 * 86400000;
  if (freshEnough) return staticData;
  try {
    const resp = await fetch(`api/macro/series?ids=${encodeURIComponent(id)}`);
    if (resp.ok && (resp.headers.get("content-type") ?? "").includes("json")) {
      const j = await resp.json();
      const d = j?.[id]?.data;
      // Prefer whichever copy runs later (monthly/quarterly series are
      // legitimately "stale" by the 7-day test — keep the longer tail).
      if (Array.isArray(d) && d.length > 0) {
        if (!staticData.length) return d;
        return String(d[d.length - 1].time) >= String(staticData[staticData.length - 1].time) ? d : staticData;
      }
    }
  } catch { /* server unreachable */ }
  return staticData;
}

/** Compute spread between two series */
function computeSpread(dataA: DataPoint[], dataB: DataPoint[]): DataPoint[] {
  const mapB = new Map(dataB.map(d => [d.time, d.value]));
  return dataA
    .filter(d => mapB.has(d.time))
    .map(d => ({ time: d.time, value: +(d.value - mapB.get(d.time)!).toFixed(4) }));
}

/** Fetch one or more macro series by ID. Returns same shape as /api/macro/series response. */
export async function fetchMacroSeries(
  ids: string[]
): Promise<Record<string, { data: DataPoint[]; meta: MacroSeriesMeta }>> {
  if (isStaticMode()) {
    const catalog = await fetchMacroCatalog();
    const catalogMap = new Map(catalog.map(c => [c.id, c]));
    const computedSpecs = await getComputedSpecs();
    const result: Record<string, { data: DataPoint[]; meta: MacroSeriesMeta }> = {};

    for (const id of ids) {
      if (computedSpecs[id]) {
        // Compute spread client-side
        const spec = computedSpecs[id];
        const [dataA, dataB] = await Promise.all([
          fetchStaticSeries(spec.seriesA),
          fetchStaticSeries(spec.seriesB),
        ]);
        const spread = computeSpread(dataA, dataB);
        result[id] = {
          data: spread,
          meta: catalogMap.get(id) || { id, label: id, category: "", unit: "" },
        };
      } else {
        const data = await fetchStaticSeries(id);
        result[id] = {
          data,
          meta: catalogMap.get(id) || { id, label: id, category: "", unit: "" },
        };
      }
    }
    return result;
  } else {
    const resp = await apiRequest("GET", `/api/macro/series?ids=${ids.join(",")}`);
    return resp.json();
  }
}

/** Resolve a single series spec (MACRO:ID or TICKER:metric) to data points.
 *  Used by the correlation engine client-side. */
export async function resolveSeriesDataStatic(
  seriesSpec: string
): Promise<DataPoint[]> {
  const parts = seriesSpec.split(":");
  if (parts.length < 2) throw new Error(`Invalid series spec: ${seriesSpec}`);
  const source = parts[0].toUpperCase();
  const metricOrId = parts.slice(1).join(":");

  if (source === "MACRO") {
    const computedSpecs = await getComputedSpecs();
    if (computedSpecs[metricOrId]) {
      const spec = computedSpecs[metricOrId];
      const [dataA, dataB] = await Promise.all([
        fetchStaticSeries(spec.seriesA),
        fetchStaticSeries(spec.seriesB),
      ]);
      return computeSpread(dataA, dataB);
    }
    return fetchStaticSeries(metricOrId);
  } else {
    // Stock ticker:metric — read from static /data/tickers/TICKER.json
    const ticker = source;
    let metric = metricOrId;

    // Default pseudo-metrics ("EPS (Default)" / "EPS Growth (Default)"):
    // resolve per ticker via the Universe-tab rules before reading the data.
    const { isDefaultMetricName, resolveDefaultMetricFor } = await import("./defaultEarningsMetric");
    if (isDefaultMetricName(metric)) {
      const { getTickers } = await import("./dataService");
      const metas = await getTickers();
      metric = resolveDefaultMetricFor(metric, metas.find((t: any) => t.ticker === ticker));
    }

    // Load via the same /api/ticker path the rest of the app uses. The old
    // direct fetch of data/tickers/<T>.json only works on a fully static
    // deployment — the server deployment statically mounts /data/macro ONLY,
    // so that fetch returned the SPA's index.html on prod and stock legs of
    // the correlation engine silently failed.
    const { fetchTickerRaw, getDenseSeries } = await import("./tickerData");
    const raw = await fetchTickerRaw(ticker);
    if (!raw) return [];
    return getDenseSeries(raw, metric) as DataPoint[];
  }
}

/** Clear caches (useful after refresh) */
export function clearMacroCache() {
  _catalogCache = null;
  _computedSpecCache = null;
}

export { isStaticMode };

// ─── Additional aliases used by various pages ──────────────────────────────

/**
 * Alias for fetchStaticSeries — named `fetchFredSeries` in some pages because
 * early versions used FRED as the primary data source before macro data was
 * bundled as static JSON.
 */
export async function fetchFredSeries(id: string): Promise<DataPoint[]> {
  return fetchStaticSeries(id);
}

/**
 * Batch fetch multiple macro series in parallel.
 * Returns a map of id → DataPoint[].
 */
export async function fetchMacroSeriesBatch(
  ids: string[]
): Promise<Record<string, { data: DataPoint[]; meta?: MacroSeriesMeta }>> {
  try {
    return await fetchMacroSeries(ids);
  } catch {
    return {};
  }
}
