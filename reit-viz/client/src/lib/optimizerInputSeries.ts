// Hand-written stub — various optimizer utility functions used across optimizer tabs

import { isBasketTicker } from "@/lib/basketUtils";
import type { OHLCVResult } from "@/lib/fetchTickerOHLCV";

export { isBasketTicker };

export interface InputSelection {
  kind: "ohlcv" | "workbook" | "close" | string;
  series?: string;
  metric?: string;
}

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
  _mode?: string
): FilteredResult {
  const { weeklyDownsample } = require("@/lib/weeklyDownsample");
  return weeklyDownsample(bars, _mode);
}

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
  const params = new URLSearchParams({ ticker });
  if (selection.metric) params.set("metric", selection.metric);
  if (selection.series) params.set("series", selection.series);
  const res = await fetch(`/api/workbook/series?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const closes = data.closes ?? [];
  const dates = data.priceDates ?? data.dates ?? [];
  return {
    closes,
    highs: data.highs ?? closes,
    lows: data.lows ?? closes,
    opens: data.opens ?? closes,
    dates,
    priceDates: dates,
    volumes: data.volumes ?? new Array(closes.length).fill(0),
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
