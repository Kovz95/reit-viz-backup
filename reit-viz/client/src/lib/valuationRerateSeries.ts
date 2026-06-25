// Rolling, as-of versions of the Re-Rating stats for charting over time.
//
// The Re-Rating table shows point-in-time numbers: where today's multiple sits
// in its history, and the implied price moves to re-rate to the cheap/rich
// extremes. To plot those *through time* without look-ahead bias, at each date
// t we recompute the stats using ONLY the trailing window ending at t. At the
// final date the window equals the table's lookback, so the last point of each
// rolling series reproduces the table value exactly.

import {
  quantile, percentileRank, impliedMoveToMultiple, type RerateMetric,
} from "@/lib/valuationRerate";

export interface TimeValue { time: string; value: number }

export interface RerateSeries {
  /** rolling historical median of the multiple (same units as the multiple) */
  median: TimeValue[];
  /** rolling 10th percentile of the multiple */
  p10: TimeValue[];
  /** rolling 90th percentile of the multiple */
  p90: TimeValue[];
  /** rolling percentile rank (0–100) of the current multiple in its window */
  percentile: TimeValue[];
  /** rolling z-score of the current multiple vs its window */
  zscore: TimeValue[];
  /** rolling reward:risk = implied move-to-rich ÷ |implied move-to-cheap| */
  rr: TimeValue[];
}

/**
 * Build the rolling Re-Rating series from a time-aligned multiple series.
 *
 * @param series   the multiple over time ({time, value}[], ascending by time)
 * @param window   trailing window length in observations (≈ trading days);
 *                 a huge value (e.g. "Max") makes the window expand to all
 *                 history up to each date
 * @param metric   orientation metadata (direct vs inverse, lowIsCheap)
 */
export function buildRerateSeries(
  series: TimeValue[],
  window: number,
  metric: RerateMetric,
): RerateSeries {
  const out: RerateSeries = { median: [], p10: [], p90: [], percentile: [], zscore: [], rr: [] };
  const pts = series.filter((p) => Number.isFinite(p.value));
  const n = pts.length;
  if (n === 0) return out;

  // Need a minimum sample before percentiles/z mean anything; this leaves a
  // short gap at the left edge rather than emitting noise off 2–3 points.
  const minWindow = Math.min(window, 30);
  const vals = pts.map((p) => p.value);

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - window + 1);
    const count = i - lo + 1;
    if (count < minWindow) continue;

    const win = vals.slice(lo, i + 1);
    const sorted = [...win].sort((a, b) => a - b);
    const mean = win.reduce((s, x) => s + x, 0) / win.length;
    const variance = win.reduce((s, x) => s + (x - mean) ** 2, 0) / (win.length - 1);
    const std = Math.sqrt(variance);

    const median = quantile(sorted, 0.5);
    const p10 = quantile(sorted, 0.1);
    const p90 = quantile(sorted, 0.9);
    const v = vals[i];
    const time = pts[i].time;

    out.median.push({ time, value: median });
    out.p10.push({ time, value: p10 });
    out.p90.push({ time, value: p90 });
    out.percentile.push({ time, value: percentileRank(v, win) });
    if (std > 0) out.zscore.push({ time, value: (v - mean) / std });

    // Cheap/rich extremes flip for yields (high yield = cheap), mirroring the table.
    const cheapTarget = metric.lowIsCheap ? p10 : p90;
    const richTarget = metric.lowIsCheap ? p90 : p10;
    const toRich = impliedMoveToMultiple(v, richTarget, metric.dir);
    const toCheap = impliedMoveToMultiple(v, cheapTarget, metric.dir);
    if (Number.isFinite(toRich) && Number.isFinite(toCheap) && Math.abs(toCheap) > 0) {
      out.rr.push({ time, value: toRich / Math.abs(toCheap) });
    }
  }
  return out;
}
