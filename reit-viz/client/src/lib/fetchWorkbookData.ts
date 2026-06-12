// Hand-written from call-site inference
// fetchWorkbookData: used in PairOptimizer.tsx, PairRatios.tsx (returns raw workbook data for a ticker)
// fetchScatterData: used in Scatter.tsx
// computeBasketSeries: used in PatternScreener.tsx

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
  start?: string,
  end?: string
): Promise<WorkbookDataResult | null> {
  const params = new URLSearchParams({ ticker });
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const res = await fetch(`/api/workbook/data?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWorkbookTickers(): Promise<any[]> {
  const res = await fetch("/api/tickers");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.tickers ?? []);
}

export async function fetchWorkbookSeriesForTicker(
  ticker: string,
  selection?: { kind?: string; metric?: string; [key: string]: any }
): Promise<any | null> {
  const params = new URLSearchParams({ ticker });
  if (selection?.metric) params.set("metric", selection.metric);
  if (selection?.kind) params.set("kind", selection.kind);

  const res = await fetch(`/api/workbook/series?${params.toString()}`);
  if (!res.ok) return null;
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
  const params = new URLSearchParams({ metricX, metricY });
  if (metricZ) params.set("metricZ", metricZ);
  if (asOf) params.set("asOf", asOf);
  if (colorMetric) params.set("colorMetric", colorMetric);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }

  const res = await fetch(`/api/scatter?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchScatterData: HTTP ${res.status}`);
  return res.json();
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
