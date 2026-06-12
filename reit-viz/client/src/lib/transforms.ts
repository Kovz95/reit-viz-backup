/**
 * Data transforms: z-score and percentile over full history or rolling window.
 *
 * These operate on the entire series so every point is expressed
 * relative to its historical distribution (expanding or fixed-window).
 */

import type { DataPoint } from "./indicators";

/**
 * Convert a series to expanding-window z-scores.
 * Each point = (value - mean_of_all_prior) / std_of_all_prior.
 * Requires at least 2 points to produce a z-score; earlier points are dropped.
 */
export function toZScore(data: DataPoint[]): DataPoint[] {
  if (data.length < 2) return [];
  const result: DataPoint[] = [];

  // Expanding-window z-score: at each point, use all data from start to current
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i].value;
    sumSq += data[i].value * data[i].value;
    const n = i + 1;
    if (n < 2) continue; // need at least 2 points for std

    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));

    if (std === 0) {
      result.push({ time: data[i].time, value: 0 });
    } else {
      result.push({ time: data[i].time, value: (data[i].value - mean) / std });
    }
  }

  return result;
}

/**
 * Convert a series to rolling (fixed-window) z-scores.
 * Each point = (value - mean_of_window) / std_of_window.
 * Uses exactly `window` trailing data points (including current).
 * Points before the window is full are computed with an expanding window.
 */
export function toRollingZScore(data: DataPoint[], window: number): DataPoint[] {
  if (data.length < 2) return [];
  const result: DataPoint[] = [];
  const values = data.map(d => d.value);

  for (let i = 1; i < data.length; i++) {
    // Determine the window: use all available if fewer than `window` points
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const n = slice.length;

    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < n; j++) {
      sum += slice[j];
      sumSq += slice[j] * slice[j];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));

    if (std === 0) {
      result.push({ time: data[i].time, value: 0 });
    } else {
      result.push({ time: data[i].time, value: (data[i].value - mean) / std });
    }
  }

  return result;
}

/**
 * Convert a series to expanding percentile ranks (0–100).
 * Each point's percentile = % of all prior values (inclusive) that are ≤ current value.
 */
export function toPercentile(data: DataPoint[]): DataPoint[] {
  if (data.length < 1) return [];
  const result: DataPoint[] = [];

  // Keep a sorted copy of historical values seen so far
  const history: number[] = [];

  for (let i = 0; i < data.length; i++) {
    // Insert current value in sorted position
    const val = data[i].value;
    insertSorted(history, val);

    // Count how many values are ≤ current value
    const n = history.length;
    if (n < 2) {
      result.push({ time: data[i].time, value: 50 }); // only 1 point = 50th percentile
      continue;
    }

    // Find rightmost index where history[idx] <= val
    let countLessEqual = upperBound(history, val);
    const pct = ((countLessEqual - 1) / (n - 1)) * 100;
    result.push({ time: data[i].time, value: Math.round(pct * 100) / 100 });
  }

  return result;
}

/**
 * Convert a series to rolling (fixed-window) percentile ranks (0–100).
 * Uses exactly `window` trailing data points (including current).
 */
export function toRollingPercentile(data: DataPoint[], window: number): DataPoint[] {
  if (data.length < 1) return [];
  const result: DataPoint[] = [];
  const values = data.map(d => d.value);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const n = slice.length;
    if (n < 2) {
      result.push({ time: data[i].time, value: 50 });
      continue;
    }
    const sorted = slice.slice().sort((a, b) => a - b);
    const val = values[i];
    let countLE = 0;
    for (let j = 0; j < sorted.length; j++) {
      if (sorted[j] <= val) countLE++;
      else break;
    }
    const pct = ((countLE - 1) / (n - 1)) * 100;
    result.push({ time: data[i].time, value: Math.round(pct * 100) / 100 });
  }

  return result;
}

/** Insert val into sorted array (ascending) */
function insertSorted(arr: number[], val: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, val);
}

/** Return count of elements <= val in sorted array */
function upperBound(arr: number[], val: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type DataTransform = "raw" | "zscore" | "percentile";

/** Window = 0 or undefined means expanding (original behavior). */
export function applyTransform(
  data: DataPoint[],
  transform: DataTransform,
  window?: number
): DataPoint[] {
  const useRolling = window && window > 0;
  switch (transform) {
    case "zscore":
      return useRolling ? toRollingZScore(data, window) : toZScore(data);
    case "percentile":
      return useRolling ? toRollingPercentile(data, window) : toPercentile(data);
    case "raw":
    default:
      return data;
  }
}
