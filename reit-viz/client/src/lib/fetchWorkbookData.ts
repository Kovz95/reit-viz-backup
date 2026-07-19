// Hand-written from call-site inference
// fetchWorkbookData: used in PairOptimizer.tsx, PairRatios.tsx (returns raw workbook data for a ticker)
// fetchScatterData: used in Scatter.tsx
// computeBasketSeries: used in PatternScreener.tsx
//
// The live backend has no /api/workbook/data route; PairOptimizer/PairRatios read the
// result as a sparse-pair map (data[metric] = [[idx,val],...]), so it is derived from
// GET /api/ticker/<sym> via toSparseMetrics (gL). See lib/tickerData.ts.

import { fetchTickerRaw, toSparseMetrics, type SparsePair } from "@/lib/tickerData";
import { isDefaultMetricName } from "@/lib/defaultEarningsMetric";

export interface WorkbookDataResult {
  ticker: string;
  dates?: string[];
  closes?: number[];
  highs?: number[];
  lows?: number[];
  opens?: number[];
  volumes?: number[];
  metrics?: Record<string, number[]>;
  [key: string]: any;
}

export interface ScatterResultPoint {
  ticker: string;
  name?: string;
  x: number;
  y: number;
  z?: number | null;
  colorVal?: number | null;
  subindustry?: string;
  industry?: string;
  industryGroup?: string;
  subsector?: string;
  sector?: string;
  economy?: string;
  [key: string]: any;
}

export interface ScatterQueryResult {
  points: ScatterResultPoint[];
  resolvedDate?: string;
}

export async function fetchWorkbookData(
  ticker: string,
  _start?: string,
  _end?: string
): Promise<(Record<string, SparsePair[]> & WorkbookDataResult) | null> {
  const raw = await fetchTickerRaw(ticker);
  if (!raw) return null;
  // Consumers (computePairRatios) read this as a sparse-pair map: data[metric] pairs.
  const sparse = toSparseMetrics(raw.metrics) as Record<string, SparsePair[]> & WorkbookDataResult;
  sparse.ticker = ticker;
  sparse.dates = raw.dates;
  return sparse;
}

export async function fetchWorkbookTickers(): Promise<any[]> {
  const res = await fetch("/api/tickers");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.tickers ?? []);
}

export { fetchWorkbookSeriesForTicker } from "@/lib/fetchWorkbookSeriesForTicker";

async function fetchScatterRaw(
  metricX: string,
  metricY: string,
  metricZ?: string,
  asOf?: string,
  extra?: Record<string, string>,
  colorMetric?: string
): Promise<ScatterQueryResult> {
  // Param names must match the server route (GET /api/scatter reads x/y/z/date).
  // Previously sent metricX/metricY/metricZ/asOf, which the server ignored → 400.
  const params = new URLSearchParams({ x: metricX, y: metricY });
  if (metricZ) params.set("z", metricZ);
  if (asOf) params.set("date", asOf);
  if (colorMetric) params.set("colorMetric", colorMetric);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }

  const res = await fetch(`/api/scatter?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchScatterData: HTTP ${res.status}`);
  return res.json();
}

export async function fetchScatterData(
  metricX: string,
  metricY: string,
  metricZ?: string,
  asOf?: string,
  extra?: Record<string, string>,
  colorMetric?: string
): Promise<ScatterQueryResult> {
  const pseudoName = [metricX, metricY, metricZ, colorMetric].find((m) => isDefaultMetricName(m));
  if (!pseudoName) {
    return fetchScatterRaw(metricX, metricY, metricZ, asOf, extra, colorMetric);
  }

  // Default pseudo-metrics: the server resolves nothing per ticker, so fetch
  // once per referenced concrete metric (substituted on the axes carrying THIS
  // pseudo name) and stitch each ticker's values from its resolved metric's
  // call. Recursion handles a second pseudo name on other axes (e.g. X = EPS
  // (Default), Y = EPS Growth (Default)).
  const { referencedMetricsFor, resolveDefaultMetricFor } = await import("@/lib/defaultEarningsMetric");
  const { getTickers } = await import("@/lib/dataService");
  const metas = await getTickers();
  const resolvedBy = new Map(metas.map((t: any) => [t.ticker, resolveDefaultMetricFor(pseudoName, t)]));
  const referenced = referencedMetricsFor(pseudoName);
  const sub = (m: string | undefined, repl: string) => (m === pseudoName ? repl : m);

  const calls = await Promise.all(
    referenced.map((dm) =>
      fetchScatterData(sub(metricX, dm)!, sub(metricY, dm)!, sub(metricZ, dm), asOf, extra, sub(colorMetric, dm))
    )
  );
  const byMetric = new Map(
    referenced.map((dm, i) => [dm, new Map(calls[i].points.map((p) => [p.ticker, p]))])
  );
  const base = calls[0];
  const points = base.points.map((p) => {
    const src = byMetric.get(resolvedBy.get(p.ticker) ?? referenced[0])?.get(p.ticker);
    if (!src) return p;
    return {
      ...p,
      x: metricX === pseudoName ? src.x : p.x,
      y: metricY === pseudoName ? src.y : p.y,
      z: metricZ === pseudoName ? src.z : p.z,
      colorVal: colorMetric === pseudoName ? src.colorVal : p.colorVal,
    };
  });
  return { ...base, points };
}

export async function computeBasketSeries(
  basket: any,
  fetchFn: (ticker: string, selection?: any) => Promise<any>
): Promise<any | null> {
  const res = await fetch("/api/basket/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ basket }),
  });
  if (!res.ok) return null;
  return res.json();
}
