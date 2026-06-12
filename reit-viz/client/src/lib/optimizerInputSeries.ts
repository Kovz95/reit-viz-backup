// Hand-written stub — various optimizer utility functions used in DualMAOptimizer.tsx

import { isBasketTicker } from "@/lib/basketUtils";
import type { OHLCVBar } from "@/lib/fetchTickerOHLCV";

export { isBasketTicker };

export interface InputSelection {
  kind: "ohlcv" | "workbook";
  series?: string;
  metric?: string;
}

export const defaultInputSelection: InputSelection = {
  kind: "ohlcv",
  series: "close",
};

/**
 * Filters an array of OHLCV bars to a date range.
 */
export function filterByDateRange(
  bars: OHLCVBar[],
  start: string,
  end: string
): OHLCVBar[] {
  return bars.filter((b) => b.date >= start && b.date <= end);
}

/**
 * Resamples daily bars to weekly (Friday-ending).
 */
export function resampleWeekly(bars: OHLCVBar[]): OHLCVBar[] {
  // Delegate to weeklyDownsample
  const { weeklyDownsample } = require("@/lib/weeklyDownsample");
  return weeklyDownsample(bars);
}

/**
 * Creates a date range object from start/end ISO strings.
 */
export function createDateRange(start: string, end: string): { start: string; end: string } {
  return { start, end };
}

/**
 * Fetches workbook series for a ticker and selection config.
 */
export async function getWorkbookSeries(
  ticker: string,
  selection: InputSelection
): Promise<{ closes: number[]; highs: number[]; lows: number[]; opens: number[]; dates: string[] } | null> {
  const params = new URLSearchParams({ ticker });
  if (selection.metric) params.set("metric", selection.metric);
  const res = await fetch(`/api/workbook/series?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    closes: data.closes ?? [],
    highs:  data.highs  ?? [],
    lows:   data.lows   ?? [],
    opens:  data.opens  ?? [],
    dates:  data.priceDates ?? data.dates ?? [],
  };
}
