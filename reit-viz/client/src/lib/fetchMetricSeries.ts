// fetchMetricSeries: returns a dense [{time, value}] series for one metric.
// Used in EvaluatorPanel, Attribution, Distributions, FactorBacktest, MacroRegime,
// RelativeStrength, SigmaMove, signalUtils.
//
// The live backend has no /api/metric-series route; the metric comes from
// GET /api/ticker/<sym> ({ dates, metrics }). See lib/tickerData.ts.

import { fetchTickerRaw, getDenseSeries } from "@/lib/tickerData";

export type MetricSeriesPoint = { time: string; value: number };

export async function fetchMetricSeries(
  ticker: string,
  metric: string,
  _opts?: { start?: string; end?: string; [key: string]: any }
): Promise<MetricSeriesPoint[]> {
  const raw = await fetchTickerRaw(ticker);
  if (!raw) return [];
  let series = getDenseSeries(raw, metric);

  // Optional client-side date-range trim (the original API accepted start/end).
  const start = _opts?.start;
  const end = _opts?.end;
  if (start || end) {
    series = series.filter(
      (p) => (!start || p.time >= start) && (!end || p.time <= end)
    );
  }
  return series;
}
