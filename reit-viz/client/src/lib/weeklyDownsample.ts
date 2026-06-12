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

/** Stub: downsamples a prices array to weekly. */
export function weeklyDownsamplePrices(...args: any[]): any { return null; }

/** Stub: expands weekly data back to daily. */
export function expandWeeklyToDaily(...args: any[]): any { return null; }
