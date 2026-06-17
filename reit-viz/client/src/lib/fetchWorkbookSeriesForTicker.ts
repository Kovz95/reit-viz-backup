// Hand-written from call-site inference (AutoTrendlineBacktest.tsx, PatternScreener.tsx,
// ComboOptimizer, HarsiOptimizer, MomentumOptimizer, RSIRegimeOptimizer)
//
// The live backend has no /api/workbook/series route; the series is derived from
// GET /api/ticker/<sym> ({ dates, metrics }). For a fundamental-metric selection the
// metric's values become `closes` (the series the optimizers consume); otherwise the
// daily close is used. See lib/tickerData.ts.

import { fetchTickerRaw, toDenseOHLCV, getDenseSeries } from "@/lib/tickerData";

export interface WorkbookSeriesResult {
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  priceDates: string[];
  metric?: string;
}

const PRICE_KINDS = new Set(["close", "price", "ohlcv"]);

export async function fetchWorkbookSeriesForTicker(
  ticker: string,
  selection?: { kind?: string; metric?: string; [key: string]: any }
): Promise<WorkbookSeriesResult | null> {
  const raw = await fetchTickerRaw(ticker);
  if (!raw) return null;

  const metric = selection?.metric;
  const wantMetric =
    metric && !PRICE_KINDS.has(metric) && Array.isArray(raw.metrics[metric]);

  if (wantMetric) {
    const series = getDenseSeries(raw, metric!);
    if (series.length === 0) return null;
    const closes = series.map((p) => p.value);
    return {
      closes,
      highs: closes,
      lows: closes,
      opens: closes,
      priceDates: series.map((p) => p.time),
      metric,
    };
  }

  const d = toDenseOHLCV(raw);
  if (d.closes.length === 0) return null;
  return {
    closes: d.closes,
    highs: d.highs,
    lows: d.lows,
    opens: d.opens,
    priceDates: d.dates,
    metric: "close",
  };
}
