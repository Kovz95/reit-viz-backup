// Hand-written stub
// Returns array of {time, value} points so call sites can use .length, .map(), etc.
export type MetricSeriesPoint = { time: string; value: number };

export async function fetchMetricSeries(
  ticker: string,
  metric: string,
  opts?: { start?: string; end?: string; [key: string]: any }
): Promise<MetricSeriesPoint[]> {
  const params = new URLSearchParams({ ticker, metric });
  if (opts?.start) params.set("start", opts.start);
  if (opts?.end) params.set("end", opts.end);
  const res = await fetch(`/api/metric-series?${params.toString()}`);
  if (!res.ok) return [];
  const raw: any = await res.json();
  // Support both {dates,values} object format and array format
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.dates)) {
    return raw.dates.map((d: string, i: number) => ({ time: d, value: raw.values?.[i] ?? 0 }));
  }
  return [];
}
