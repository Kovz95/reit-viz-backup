// Hand-written from call-site inference
// Used in PairOptimizer.tsx to map a weekly-series index back to the
// corresponding daily-series index for forward-return computation.

import type { OHLCVBar } from "@/lib/fetchTickerOHLCV";

/**
 * Given an index into a weekly-downsampled bar array, returns the index
 * of the corresponding bar in the original daily bar array.
 *
 * Strategy: the weekly bar's `date` matches the last daily bar of that week.
 * We do a binary search for the daily bar whose date == weekly bar's date.
 * Falls back to a linear scan for robustness.
 */
export function getDailyIndexFromWeekly(
  weeklyIdx: number,
  weeklyBars: OHLCVBar[] | { dailyIndexMap?: number[] } | any,
  dailyBars?: OHLCVBar[]
): number {
  // Bundle form (d0): (weeklyIdx, weeklyResult) → weeklyResult.dailyIndexMap[weeklyIdx].
  // Most optimizer pages call it this way with a resample result object.
  if (weeklyBars && Array.isArray(weeklyBars.dailyIndexMap)) {
    const map: number[] = weeklyBars.dailyIndexMap;
    return weeklyIdx >= 0 && weeklyIdx < map.length ? map[weeklyIdx] : weeklyIdx;
  }
  // Legacy 3-arg binary-search form (date-matched).
  if (weeklyIdx < 0 || weeklyIdx >= weeklyBars.length) return -1;
  if (!dailyBars || dailyBars.length === 0) return -1;

  const targetDate = weeklyBars[weeklyIdx].date;

  // Binary search
  let lo = 0;
  let hi = dailyBars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const d = dailyBars[mid].date;
    if (d === targetDate) return mid;
    if (d < targetDate) lo = mid + 1;
    else hi = mid - 1;
  }

  // Binary search found no exact match — return the closest index (hi = last date <= target)
  return hi >= 0 ? hi : 0;
}
