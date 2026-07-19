// fetchMetricSeries: returns a dense [{time, value}] series for one metric.
// Used in EvaluatorPanel, Attribution, Distributions, FactorBacktest, MacroRegime,
// RelativeStrength, SigmaMove, signalUtils.
//
// The live backend has no /api/metric-series route; the metric comes from
// GET /api/ticker/<sym> ({ dates, metrics }). See lib/tickerData.ts.

import { fetchTickerRaw, getDenseSeries } from "@/lib/tickerData";
import { isDefaultEpsMetric, resolveDefaultEps } from "@/lib/defaultEarningsMetric";
import { getTickers } from "@/lib/dataService";

export type MetricSeriesPoint = { time: string; value: number };

export async function fetchMetricSeries(
  ticker: string,
  metric: string,
  _opts?: { start?: string; end?: string; [key: string]: any }
): Promise<MetricSeriesPoint[]> {
  // "EPS (Default)" pseudo-metric: resolve per ticker via the Universe-tab rules.
  if (isDefaultEpsMetric(metric)) {
    const metas = await getTickers();
    metric = resolveDefaultEps(metas.find((t) => t.ticker === ticker));
  }
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
