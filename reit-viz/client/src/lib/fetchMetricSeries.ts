// Hand-written stub
export async function fetchMetricSeries(
  ticker: string,
  metric: string,
  opts?: { start?: string; end?: string }
): Promise<{ dates: string[]; values: number[] } | null> {
  const params = new URLSearchParams({ ticker, metric });
  if (opts?.start) params.set("start", opts.start);
  if (opts?.end) params.set("end", opts.end);
  const res = await fetch(`/api/metric-series?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}
