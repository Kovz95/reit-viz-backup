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
    const resp = await fetch("data/macro/catalog.json");
    if (!resp.ok) throw new Error("Failed to load macro catalog");
    _catalogCache = await resp.json();
    return _catalogCache!;
  } else {
    const resp = await apiRequest("GET", "/api/macro/catalog");
    _catalogCache = await resp.json();
    return _catalogCache!;
  }
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
  const resp = await fetch(`data/macro/${id}.json`);
  if (!resp.ok) return [];
  return resp.json();
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
    const metric = metricOrId;
    
    // Fetch dates and ticker data
    const [datesResp, tickerResp] = await Promise.all([
      fetch("data/dates.json"),
      fetch(`data/tickers/${ticker}.json`),
    ]);
    
    if (!datesResp.ok || !tickerResp.ok) return [];
    
    const dates: string[] = await datesResp.json();
    const rawData = await tickerResp.json();
    
    if (!rawData[metric]) return [];
    
    const arr = rawData[metric] as any[];
    const data: DataPoint[] = [];
    
    if (arr.length === 0) return data;
    
    // Detect format: tuples [[dateIdx, value], ...] vs flat [value, value, ...]
    const isTupleFormat = Array.isArray(arr[0]);
    
    if (isTupleFormat) {
      for (const item of arr) {
        const [dateIdx, value] = item;
        if (dateIdx < dates.length && value != null) {
          data.push({ time: dates[dateIdx], value });
        }
      }
    } else {
      // Flat array: index position maps to dates.json
      for (let i = 0; i < arr.length && i < dates.length; i++) {
        if (arr[i] != null) {
          data.push({ time: dates[i], value: arr[i] });
        }
      }
    }
    return data;
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
): Promise<Record<string, { data: DataPoint[]; meta?: MacroSeriesMeta } | DataPoint[]>> {
  const results = await Promise.allSettled(
    ids.map(async (id) => ({ id, data: await fetchMacroSeries(id) }))
  );
  const out: Record<string, { data: DataPoint[]; meta?: MacroSeriesMeta }> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      out[r.value.id] = { data: r.value.data };
    }
  }
  return out;
}
