// Hand-written from call-site inference
// weeklyDownsample: collapses daily OHLCV bars into weekly Friday-ending bars.
// Callers pass either OHLCVBar[] or a parallel-arrays object, with optional mode string.

import type { OHLCVBar } from "@/lib/fetchTickerOHLCV";
import type { OHLCVResult } from "@/lib/fetchTickerOHLCV";

export { OHLCVBar };

export interface WeeklyResult {
  dates: string[];
  closes: number[];
  adjCloses: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  /** For each weekly bar, the daily index of the Friday close bar */
  dailyIndexMap: number[];
  bars?: OHLCVBar[];
}

/**
 * Down-samples daily OHLCV data into weekly bars ending on Friday
 * (or the last trading day of the week when Friday is missing).
 *
 * Accepts either:
 *  - An array of OHLCVBar objects
 *  - A parallel-arrays object { dates, closes, adjCloses?, highs?, lows?, volumes? }
 * Second argument is optional and ignored (mode string preserved for call-site compat).
 */
export function weeklyDownsample(
  bars: OHLCVBar[] | { dates: string[]; closes: number[]; adjCloses?: number[]; highs?: number[]; lows?: number[]; opens?: number[]; volumes?: number[] } | any,
  _mode?: string
): WeeklyResult {
  // Normalise input into parallel arrays
  let dates: string[];
  let closes: number[];
  let adjCloses: number[];
  let highs: number[];
  let lows: number[];
  let opens: number[];
  let volumes: number[];

  if (Array.isArray(bars)) {
    const barArr = bars as OHLCVBar[];
    dates = barArr.map((b) => b.date);
    closes = barArr.map((b) => b.close);
    adjCloses = closes;
    highs = barArr.map((b) => b.high);
    lows = barArr.map((b) => b.low);
    opens = barArr.map((b) => b.open);
    volumes = barArr.map((b) => b.volume ?? 0);
  } else {
    const obj = bars as any;
    dates = obj.dates ?? [];
    closes = obj.closes ?? [];
    adjCloses = obj.adjCloses ?? closes;
    highs = obj.highs ?? closes;
    lows = obj.lows ?? closes;
    opens = obj.opens ?? closes;
    volumes = obj.volumes ?? new Array(closes.length).fill(0);
  }

  if (!dates || dates.length === 0) {
    return { dates: [], closes: [], adjCloses: [], highs: [], lows: [], opens: [], volumes: [], dailyIndexMap: [] };
  }

  const n = dates.length;
  const wDates: string[] = [];
  const wCloses: number[] = [];
  const wAdjCloses: number[] = [];
  const wHighs: number[] = [];
  const wLows: number[] = [];
  const wOpens: number[] = [];
  const wVolumes: number[] = [];
  const wDailyIndexMap: number[] = [];

  let weekStart = 0;

  function flush(endIdx: number) {
    if (weekStart > endIdx) return;
    let wHigh = -Infinity, wLow = Infinity, wVol = 0;
    for (let i = weekStart; i <= endIdx; i++) {
      if (highs[i] > wHigh) wHigh = highs[i];
      if (lows[i] < wLow) wLow = lows[i];
      wVol += volumes[i] ?? 0;
    }
    wDates.push(dates[endIdx]);
    wCloses.push(closes[endIdx]);
    wAdjCloses.push(adjCloses[endIdx]);
    wHighs.push(isFinite(wHigh) ? wHigh : closes[endIdx]);
    wLows.push(isFinite(wLow) ? wLow : closes[endIdx]);
    wOpens.push(opens[weekStart]);
    wVolumes.push(wVol);
    wDailyIndexMap.push(endIdx);
    weekStart = endIdx + 1;
  }

  for (let i = 0; i < n; i++) {
    const d = new Date(dates[i] + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun, 5=Fri
    const isLastBar = i === n - 1;
    const isFriday = dow === 5;

    if (isFriday || isLastBar) {
      flush(i);
    } else if (i < n - 1) {
      const nextD = new Date(dates[i + 1] + "T00:00:00Z");
      const currSunday = new Date(d);
      currSunday.setUTCDate(d.getUTCDate() + (7 - dow) % 7);
      const nextSunday = new Date(nextD);
      const nextDow = nextD.getUTCDay();
      nextSunday.setUTCDate(nextD.getUTCDate() + (7 - nextDow) % 7);
      if (currSunday.getTime() !== nextSunday.getTime()) {
        flush(i);
      }
    }
  }

  return {
    dates: wDates,
    closes: wCloses,
    adjCloses: wAdjCloses,
    highs: wHighs,
    lows: wLows,
    opens: wOpens,
    volumes: wVolumes,
    dailyIndexMap: wDailyIndexMap,
  };
}


/** Alias for weeklyDownsample (used by some optimizer pages). */
export const downsampleWeekly = weeklyDownsample;

/** 
 * Map a weekly bar index back to the corresponding daily bar index.
 * weeklyResult.dailyIndexMap[weeklyIdx] gives the daily end-of-week index.
 */
export function mapWeeklyIndexToDaily(
  weeklyResult: WeeklyResult,
  weeklyIdx: number
): number {
  return weeklyResult.dailyIndexMap[weeklyIdx] ?? weeklyIdx;
}

// ── weekly_on_daily helpers (recovered verbatim from weeklyDownsample-BzVm8wGH.js) ──

/** ISO week key like "2024-W05" for grouping daily bars into weeks (bundle `u`). */
function isoWeekKey(dateStr: string): string {
  const a = new Date(dateStr + "T00:00:00Z");
  if (isNaN(a.getTime())) return dateStr;
  const t = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const r = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const e = Math.ceil(((t.getTime() - r.getTime()) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(e).padStart(2, "0")}`;
}

/**
 * weekly_on_daily aggregate (bundle export `d`/`T`): collapse a daily price series into
 * one value per ISO week (the last bar of each week), returning the weekly prices and,
 * for each weekly bar, the DAILY index of that week's last bar.
 */
export function weeklyDownsamplePrices(
  prices: number[],
  dates: string[]
): { prices: number[]; weekIndex: number[] } {
  const outPrices: number[] = [];
  const weekIndex: number[] = [];
  let curWeek = "";
  let lastPrice = NaN;
  let lastIdx = -1;
  for (let o = 0; o < prices.length; o++) {
    const wk = isoWeekKey(dates[o]);
    if (wk !== curWeek) {
      if (lastIdx >= 0) { outPrices.push(lastPrice); weekIndex.push(lastIdx); }
      curWeek = wk;
    }
    lastPrice = prices[o];
    lastIdx = o;
  }
  if (lastIdx >= 0) { outPrices.push(lastPrice); weekIndex.push(lastIdx); }
  return { prices: outPrices, weekIndex };
}

/**
 * Expand weekly values back to a daily-length array (bundle export `e`/`g`): forward-fill,
 * so each daily bar carries the value of the most recent completed week.
 * `weekIndex` is the per-week daily end-index array from weeklyDownsamplePrices.
 */
export function expandWeeklyToDaily(
  values: number[],
  weekIndex: number[],
  dailyLength: number
): number[] {
  const out = new Array(dailyLength).fill(NaN);
  if (values.length === 0) return out;
  let e = -1;
  for (let i = 0; i < dailyLength; i++) {
    while (e + 1 < weekIndex.length && weekIndex[e + 1] <= i) e++;
    if (e >= 0 && Number.isFinite(values[e])) out[i] = values[e];
  }
  return out;
}

// Some pages call these as properties of the weeklyDownsample function
// (e.g. `(weeklyDownsample as any).aggregate`, `resampleWeekly.expandWeeklyToDaily`).
(weeklyDownsample as any).aggregate = weeklyDownsamplePrices;
(weeklyDownsample as any).expandWeeklyToDaily = expandWeeklyToDaily;
