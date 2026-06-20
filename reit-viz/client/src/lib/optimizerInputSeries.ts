// Hand-written stub — various optimizer utility functions used across optimizer tabs

import { isBasketTicker } from "@/lib/basketUtils";
import type { OHLCVResult } from "@/lib/fetchTickerOHLCV";
import { fetchTickerRaw, toDenseOHLCV, getDenseSeries } from "@/lib/tickerData";
import { weeklyDownsample, weeklyDownsamplePrices, expandWeeklyToDaily } from "@/lib/weeklyDownsample";

export { isBasketTicker };

// Canonical InputSelection/InputSeriesKind live in inputSeriesSelector; re-export
// them here so optimizer state and the picker component share one type.
export type { InputSeriesKind, InputSelection } from "@/lib/inputSeriesSelector";
import type { InputSelection } from "@/lib/inputSeriesSelector";

export const defaultInputSelection: InputSelection = {
  kind: "close",
  series: "close",
};

export interface FilteredResult extends OHLCVResult {
  adjCloses: number[];
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  dates: string[];
  volumes: number[];
  dailyIndexMap: Map<string, number>;
}

/**
 * Filters raw ticker data (or an OHLCVResult or any OHLCV object) to a date range.
 * Accepts the date range as a single object { start, end } or null.
 * Returns a FilteredResult with parallel arrays.
 */
export function filterByDateRange(
  raw: any,
  dateRange?: { start?: any; end?: any; startDate?: string; endDate?: string } | string | null,
  _mode?: string
): FilteredResult {
  // If raw is already a FilteredResult / OHLCVResult with parallel arrays, slice them
  let dates: string[] = [];
  let closes: number[] = [];
  let adjCloses: number[] = [];
  let highs: number[] = [];
  let lows: number[] = [];
  let opens: number[] = [];
  let volumes: number[] = [];
  let existingMap: Map<string, number> | null = null;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.dates) {
      dates = raw.dates as string[];
      closes = raw.closes ?? [];
      adjCloses = raw.adjCloses ?? closes;
      highs = raw.highs ?? closes;
      lows = raw.lows ?? closes;
      opens = raw.opens ?? closes;
      volumes = raw.volumes ?? new Array(closes.length).fill(0);
      existingMap = raw.dailyIndexMap ?? null;
    }
    // Otherwise it's RawTickerData — empty, data has to come from elsewhere
  }

  if (Array.isArray(raw)) {
    const bars = raw as any[];
    dates = bars.map((b) => b.date ?? "");
    closes = bars.map((b) => b.close ?? 0);
    adjCloses = bars.map((b) => b.adjClose ?? b.close ?? 0);
    highs = bars.map((b) => b.high ?? 0);
    lows = bars.map((b) => b.low ?? 0);
    opens = bars.map((b) => b.open ?? 0);
    volumes = bars.map((b) => b.volume ?? 0);
  }

  // Filter by date range if provided
  if (dateRange && typeof dateRange === "object") {
    const dr = dateRange as any;
    let startStr: string | null = null;
    let endStr: string | null = null;
    if (dr.start instanceof Date) startStr = dr.start.toISOString().slice(0, 10);
    else if (typeof dr.start === "string") startStr = dr.start;
    else if (typeof dr.startDate === "string") startStr = dr.startDate;
    if (dr.end instanceof Date) endStr = dr.end.toISOString().slice(0, 10);
    else if (typeof dr.end === "string") endStr = dr.end;
    else if (typeof dr.endDate === "string") endStr = dr.endDate;

    if (startStr || endStr) {
      const mask: boolean[] = dates.map((d) => {
        if (startStr && d < startStr) return false;
        if (endStr && d > endStr) return false;
        return true;
      });
      dates = dates.filter((_, i) => mask[i]);
      closes = closes.filter((_, i) => mask[i]);
      adjCloses = adjCloses.filter((_, i) => mask[i]);
      highs = highs.filter((_, i) => mask[i]);
      lows = lows.filter((_, i) => mask[i]);
      opens = opens.filter((_, i) => mask[i]);
      volumes = volumes.filter((_, i) => mask[i]);
    }
  }

  const dailyIndexMap = new Map<string, number>();
  dates.forEach((d, i) => dailyIndexMap.set(d, i));

  return { dates, closes, adjCloses, highs, lows, opens, volumes, dailyIndexMap };
}

/**
 * Resamples daily data to weekly (Friday-ending).
 * Accepts OHLCVBar[] or a parallel-arrays object.
 */
export function resampleWeekly(
  bars: any,
  mode?: string
): any {
  // Match the bundle's resampler (Ss/Uk): ONLY "weekly" downsamples; every other
  // mode ("daily", "weekly_on_daily", undefined) returns the input unchanged with
  // an identity dailyIndexMap. Previously this always downsampled, which corrupted
  // daily-mode optimizer runs.
  if (mode === "weekly") {
    return weeklyDownsample(bars, mode);
  }
  // Identity (daily) — normalise to parallel arrays with a 1:1 dailyIndexMap.
  let dates: string[], closes: number[], adjCloses: number[], highs: number[], lows: number[], opens: number[], volumes: number[];
  if (Array.isArray(bars)) {
    dates = bars.map((b: any) => b.date ?? "");
    closes = bars.map((b: any) => b.close ?? 0);
    adjCloses = bars.map((b: any) => b.adjClose ?? b.close ?? 0);
    highs = bars.map((b: any) => b.high ?? 0);
    lows = bars.map((b: any) => b.low ?? 0);
    opens = bars.map((b: any) => b.open ?? 0);
    volumes = bars.map((b: any) => b.volume ?? 0);
  } else {
    const o = bars ?? {};
    dates = o.dates ?? [];
    closes = o.closes ?? [];
    adjCloses = o.adjCloses ?? closes;
    highs = o.highs ?? closes;
    lows = o.lows ?? closes;
    opens = o.opens ?? closes;
    volumes = o.volumes ?? new Array(closes.length).fill(0);
  }
  return { dates, closes, adjCloses, highs, lows, opens, volumes, dailyIndexMap: dates.map((_, i) => i) };
}

// Some optimizer pages access the weekly_on_daily expander as a property of
// resampleWeekly (e.g. RSIRegimeOptimizer's `resampleWeekly.expandWeeklyToDaily`).
(resampleWeekly as any).expandWeeklyToDaily = expandWeeklyToDaily;
(resampleWeekly as any).aggregate = weeklyDownsamplePrices;

/**
 * Creates a date range object.
 * With no args returns a default (all-time) range.
 */
export function createDateRange(start?: string | Date, end?: string | Date): { start: Date; end: Date } {
  const endDate = end ? (end instanceof Date ? end : new Date(end)) : new Date();
  const startDate = start ? (start instanceof Date ? start : new Date(start)) : new Date("2000-01-01");
  return { start: startDate, end: endDate };
}

/**
 * Creates a date range object from a preset key like "10y".
 */
export function createDateRangeFromPreset(preset: string): { start: Date; end: Date } {
  const presetDays: Record<string, number> = {
    "1y": 365, "2y": 730, "3y": 1095, "5y": 1825, "7y": 2555, "10y": 3650, "15y": 5475,
  };
  const days = presetDays[preset] ?? 3650;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Fetches workbook series for a ticker and selection config.
 */
export async function getWorkbookSeries(
  ticker: string,
  selection: InputSelection,
  opts?: { dateRange?: any }
): Promise<{ closes: number[]; highs: number[]; lows: number[]; opens: number[]; dates: string[]; priceDates: string[]; volumes: number[] } | null> {
  // The live backend has no /api/workbook/series route; derive from /api/ticker/<sym>.
  const raw = await fetchTickerRaw(ticker);
  if (!raw) return null;

  const metric = selection.metric;
  // A fundamental-metric selection: that metric's values are the series.
  if (selection.kind === "workbook" && metric && metric !== "close" && Array.isArray(raw.metrics[metric])) {
    const series = getDenseSeries(raw, metric);
    if (series.length === 0) return null;
    const closes = series.map((p) => p.value);
    const dates = series.map((p) => p.time);
    return {
      closes,
      highs: closes,
      lows: closes,
      opens: closes,
      dates,
      priceDates: dates,
      volumes: new Array(closes.length).fill(0),
    };
  }

  const d = toDenseOHLCV(raw);
  if (d.closes.length === 0) return null;
  return {
    closes: d.closes,
    highs: d.highs,
    lows: d.lows,
    opens: d.opens,
    dates: d.dates,
    priceDates: d.dates,
    volumes: d.volumes,
  };
}

/**
 * Fetches input series for a ticker and input selection.
 */
export async function fetchInputSeries(
  ticker: string,
  selection: InputSelection,
  opts?: { dateRange?: any }
): Promise<{ closes: number[]; highs: number[]; lows: number[]; priceDates: string[]; dates: string[]; volumes: number[] } | null> {
  return getWorkbookSeries(ticker, selection, opts);
}
