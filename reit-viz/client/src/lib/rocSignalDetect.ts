/**
 * rocSignalDetect.ts
 *
 * Real implementations reconstructed from:
 *   - ROCOptimizer-BRhXmIfg.js  (imports: c=computeROC, R=ROC_SIGNAL_HANDLERS,
 *                                           d=detectSignals, a=SIGNAL_META)
 *   - ComboOptimizer-DeA6DroV.js (same module)
 *
 * Consumer usage from ROCOptimizer.tsx:
 *   computeROC(closes, period)                          → (number|null)[]
 *   ROC_SIGNAL_HANDLERS["zero_cross"]                   → string[] (iterable, has .filter)
 *   detectSignals(closes, handler, opts, startIdx)      → Record<category, number[]>
 *   SIGNAL_META["roc_zero_up"]                          → { label, direction, description }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RocSignalHandler extends Iterable<string> {
  key: string;
  label: string;
  [key: string]: any;
}

export interface SignalMetaEntry {
  label: string;
  direction: "buy" | "sell" | "neutral";
  category?: string;
  description?: string;
  [key: string]: any;
}

export interface DetectedSignal {
  index: number;
  category: string;
  value: number;
  date?: string;
  [key: string]: any;
}

// ─── computeROC ──────────────────────────────────────────────────────────────

/**
 * Rate-of-Change indicator.
 *
 * Formula (confirmed from ROCOptimizer bundle and task spec):
 *   ROC[i] = ((values[i] - values[i-period]) / values[i-period]) * 100
 *
 * Returns null for the first `period` entries where a lookback isn't available,
 * and null where the denominator is 0.
 *
 * @param values  Price series
 * @param period  Lookback period
 */
export function computeROC(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    const prev = values[i - period];
    if (!Number.isFinite(prev) || prev === 0) continue;
    const cur = values[i];
    if (!Number.isFinite(cur)) continue;
    out[i] = ((cur - prev) / prev) * 100;
  }
  return out;
}

// ─── ROC_SIGNAL_HANDLERS ─────────────────────────────────────────────────────
//
// Each handler is an array of category strings that supports:
//   • for...of (Iterable)
//   • .filter(fn)
//   • direct index access [cat]
//   • .key / .label metadata
//
// Category naming from ROCOptimizer-BRhXmIfg.js lines 85-89 (Zr / Qr constants):
//   BULL: roc_zero_up, roc_thresh_up, roc_thresh_down_rev, roc_fast_above, roc_slope_up, roc_curv_up
//   BEAR: roc_zero_down, roc_thresh_down, roc_thresh_up_rev, roc_fast_below, roc_slope_down, roc_curv_down

function makeHandler(key: string, label: string, categories: string[]): string[] & RocSignalHandler {
  const arr = [...categories] as string[] & RocSignalHandler;
  arr.key = key;
  arr.label = label;
  return arr;
}

export const ROC_SIGNAL_HANDLERS: Record<string, string[] & RocSignalHandler> = {
  /** ROC crosses zero — simplest trend-following signal. */
  zero_cross: makeHandler("zero_cross", "Zero Cross", [
    "roc_zero_up",
    "roc_zero_down",
  ]),

  /** ROC crosses a fixed threshold — continuation breakout / breakdown. */
  threshold_cross: makeHandler("threshold_cross", "Threshold Cross", [
    "roc_thresh_up",
    "roc_thresh_down",
  ]),

  /** ROC was beyond threshold and now reverts back inside — mean-reversion. */
  threshold_reversion: makeHandler("threshold_reversion", "Threshold Reversion", [
    "roc_thresh_down_rev",
    "roc_thresh_up_rev",
  ]),

  /** Fast ROC crosses slow ROC — momentum divergence signal. */
  fast_slow_cross: makeHandler("fast_slow_cross", "Fast/Slow Cross", [
    "roc_fast_above",
    "roc_fast_below",
  ]),

  /** ROC slope (first derivative) and curvature (second derivative) signals. */
  slope_curvature: makeHandler("slope_curvature", "Slope/Curvature", [
    "roc_slope_up",
    "roc_slope_down",
    "roc_curv_up",
    "roc_curv_down",
  ]),
};

// ─── SIGNAL_META ─────────────────────────────────────────────────────────────

/**
 * Human-readable labels and directional classification for each signal category.
 * Reconstructed from SIGNAL_META usage in ROCOptimizer-BRhXmIfg.js (Ye).
 */
export const SIGNAL_META: Record<string, SignalMetaEntry> = {
  // ── zero_cross ─────────────────────────────────────────────────────────────
  roc_zero_up: {
    label: "ROC Cross Above 0 (Bull)",
    description: "ROC crosses from negative to positive — trend turning bullish.",
    direction: "buy",
    category: "roc_zero_up",
  },
  roc_zero_down: {
    label: "ROC Cross Below 0 (Bear)",
    description: "ROC crosses from positive to negative — trend turning bearish.",
    direction: "sell",
    category: "roc_zero_down",
  },

  // ── threshold_cross ────────────────────────────────────────────────────────
  roc_thresh_up: {
    label: "ROC Breaks Above +Threshold (Bull Breakout)",
    description: "ROC crosses above the positive threshold — bullish breakout continuation.",
    direction: "buy",
    category: "roc_thresh_up",
  },
  roc_thresh_down: {
    label: "ROC Breaks Below -Threshold (Bear Breakdown)",
    description: "ROC crosses below the negative threshold — bearish breakdown continuation.",
    direction: "sell",
    category: "roc_thresh_down",
  },

  // ── threshold_reversion ────────────────────────────────────────────────────
  roc_thresh_down_rev: {
    label: "ROC Falls Back From +Threshold (Fade Short)",
    description: "ROC was above +threshold and now reverts — mean-reversion sell signal.",
    direction: "sell",
    category: "roc_thresh_down_rev",
  },
  roc_thresh_up_rev: {
    label: "ROC Bounces Back From -Threshold (Bounce Long)",
    description: "ROC was below -threshold and now reverts — mean-reversion buy signal.",
    direction: "buy",
    category: "roc_thresh_up_rev",
  },

  // ── fast_slow_cross ────────────────────────────────────────────────────────
  roc_fast_above: {
    label: "Fast ROC > Slow ROC (Bull)",
    description: "Fast-period ROC crosses above slow-period ROC — momentum turning bullish.",
    direction: "buy",
    category: "roc_fast_above",
  },
  roc_fast_below: {
    label: "Fast ROC < Slow ROC (Bear)",
    description: "Fast-period ROC crosses below slow-period ROC — momentum turning bearish.",
    direction: "sell",
    category: "roc_fast_below",
  },

  // ── slope_curvature ────────────────────────────────────────────────────────
  roc_slope_up: {
    label: "ROC Slope Turns Positive (Bull Acceleration)",
    description: "ROC slope (ROC[i] - ROC[i-lookback]) crosses above zero — momentum accelerating.",
    direction: "buy",
    category: "roc_slope_up",
  },
  roc_slope_down: {
    label: "ROC Slope Turns Negative (Bear Deceleration)",
    description: "ROC slope crosses below zero — momentum decelerating.",
    direction: "sell",
    category: "roc_slope_down",
  },
  roc_curv_up: {
    label: "ROC Curvature Positive (Concave Up)",
    description: "Second derivative of ROC turns positive — rate of change accelerating upward.",
    direction: "buy",
    category: "roc_curv_up",
  },
  roc_curv_down: {
    label: "ROC Curvature Negative (Concave Down)",
    description: "Second derivative of ROC turns negative — rate of change decelerating.",
    direction: "sell",
    category: "roc_curv_down",
  },
};

// ─── detectSignals ───────────────────────────────────────────────────────────

/**
 * Detect ROC-based signals in a price series.
 *
 * Reconstructed from ROCOptimizer bundle (`ir = detectSignals`).
 *
 * @param closes          Price (or ROC-input) series
 * @param handlerOrHandlers  A single handler array OR array of category strings
 * @param opts            Signal parameters:
 *   - period:          ROC lookback period
 *   - slowPeriod:      Second ROC period (fast_slow_cross)
 *   - threshold:       Threshold value as fraction, e.g. 0.05 = 5% (converted to ROC units * 100)
 *   - slopeLookback:   Lookback for slope/curvature computation
 *   - precomputedROC:  Pre-computed ROC array (bypasses internal computation)
 *   - precomputedSlowROC: Pre-computed slow ROC array
 * @param startIdx        Minimum bar index to emit signals from (warm-up guard)
 * @returns Record<category, number[]> — map of category key → array of signal bar indices
 */
export function detectSignals(
  closes: number[],
  handlerOrHandlers: RocSignalHandler | Record<string, RocSignalHandler> | any[],
  opts?: Record<string, any>,
  startIdx?: number
): any {
  const start = typeof startIdx === "number" ? startIdx : 0;
  const options = opts ?? {};

  // Resolve categories to process
  let categories: string[];
  if (Array.isArray(handlerOrHandlers)) {
    // Direct array of category strings
    categories = handlerOrHandlers.filter((v: any) => typeof v === "string") as string[];
  } else if (typeof (handlerOrHandlers as any)[Symbol.iterator] === "function") {
    // Handler (iterable of category strings)
    categories = Array.from(handlerOrHandlers as Iterable<string>);
  } else {
    // Object with string keys → treat keys as categories
    categories = Object.keys(handlerOrHandlers);
  }

  const n = closes.length;
  const period: number = options.period ?? 14;
  const slowPeriod: number = options.slowPeriod ?? 50;
  const threshold: number = (options.threshold ?? 0.05) * 100; // convert fraction → ROC % units
  const slopeLookback: number = options.slopeLookback ?? 5;

  // Pre-compute or use supplied ROC arrays
  const rocFast: (number | null)[] =
    options.precomputedROC && Array.isArray(options.precomputedROC)
      ? (options.precomputedROC as (number | null)[])
      : computeROC(closes, period);

  const rocSlow: (number | null)[] =
    options.precomputedSlowROC && Array.isArray(options.precomputedSlowROC)
      ? (options.precomputedSlowROC as (number | null)[])
      : computeROC(closes, slowPeriod);

  // Initialise output record
  const result: Record<string, number[]> = {};
  for (const cat of categories) result[cat] = [];

  // Signal detection for each category
  for (const cat of categories) {
    const indices = result[cat];

    switch (cat) {
      // ── zero_cross ─────────────────────────────────────────────────────────
      case "roc_zero_up":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev <= 0 && cur > 0) indices.push(i);
        }
        break;

      case "roc_zero_down":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev >= 0 && cur < 0) indices.push(i);
        }
        break;

      // ── threshold_cross ────────────────────────────────────────────────────
      case "roc_thresh_up":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev <= threshold && cur > threshold) indices.push(i);
        }
        break;

      case "roc_thresh_down":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev >= -threshold && cur < -threshold) indices.push(i);
        }
        break;

      // ── threshold_reversion ────────────────────────────────────────────────
      // roc_thresh_down_rev: was above +threshold, now falls back below → sell (fade)
      case "roc_thresh_down_rev":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev >= threshold && cur < threshold) indices.push(i);
        }
        break;

      // roc_thresh_up_rev: was below -threshold, now bounces back above → buy (reversion)
      case "roc_thresh_up_rev":
        for (let i = Math.max(1, start); i < n; i++) {
          const cur = rocFast[i], prev = rocFast[i - 1];
          if (cur === null || prev === null) continue;
          if (prev <= -threshold && cur > -threshold) indices.push(i);
        }
        break;

      // ── fast_slow_cross ────────────────────────────────────────────────────
      case "roc_fast_above":
        for (let i = Math.max(1, start); i < n; i++) {
          const fc = rocFast[i], fp = rocFast[i - 1];
          const sc = rocSlow[i], sp = rocSlow[i - 1];
          if (fc === null || fp === null || sc === null || sp === null) continue;
          if (fp <= sp && fc > sc) indices.push(i);
        }
        break;

      case "roc_fast_below":
        for (let i = Math.max(1, start); i < n; i++) {
          const fc = rocFast[i], fp = rocFast[i - 1];
          const sc = rocSlow[i], sp = rocSlow[i - 1];
          if (fc === null || fp === null || sc === null || sp === null) continue;
          if (fp >= sp && fc < sc) indices.push(i);
        }
        break;

      // ── slope_curvature ────────────────────────────────────────────────────
      // slope = ROC[i] - ROC[i - slopeLookback]
      case "roc_slope_up": {
        for (let i = Math.max(1 + slopeLookback, start); i < n; i++) {
          const cur = rocFast[i];
          const prev = rocFast[i - slopeLookback];
          if (cur === null || prev === null) continue;
          const curSlope = cur - prev;
          // Slope turns positive: current slope > 0 and previous slope <= 0
          const prevCur = rocFast[i - 1];
          const prevPrev = rocFast[i - 1 - slopeLookback];
          if (prevCur === null || prevPrev === null) continue;
          const prevSlope = prevCur - prevPrev;
          if (prevSlope <= 0 && curSlope > 0) indices.push(i);
        }
        break;
      }

      case "roc_slope_down": {
        for (let i = Math.max(1 + slopeLookback, start); i < n; i++) {
          const cur = rocFast[i];
          const prev = rocFast[i - slopeLookback];
          if (cur === null || prev === null) continue;
          const curSlope = cur - prev;
          const prevCur = rocFast[i - 1];
          const prevPrev = rocFast[i - 1 - slopeLookback];
          if (prevCur === null || prevPrev === null) continue;
          const prevSlope = prevCur - prevPrev;
          if (prevSlope >= 0 && curSlope < 0) indices.push(i);
        }
        break;
      }

      // curvature = slope[i] - slope[i - 1]  (i.e. second derivative of ROC)
      case "roc_curv_up": {
        for (let i = Math.max(2 + slopeLookback, start); i < n; i++) {
          const r0 = rocFast[i], r1 = rocFast[i - slopeLookback];
          const r2 = rocFast[i - 1], r3 = rocFast[i - 1 - slopeLookback];
          const r4 = rocFast[i - 2], r5 = rocFast[i - 2 - slopeLookback];
          if (r0 === null || r1 === null || r2 === null || r3 === null || r4 === null || r5 === null) continue;
          const slopeCur = r0 - r1;
          const slopePrev = r2 - r3;
          const slopePrev2 = r4 - r5;
          const curvCur = slopeCur - slopePrev;
          const curvPrev = slopePrev - slopePrev2;
          if (curvPrev <= 0 && curvCur > 0) indices.push(i);
        }
        break;
      }

      case "roc_curv_down": {
        for (let i = Math.max(2 + slopeLookback, start); i < n; i++) {
          const r0 = rocFast[i], r1 = rocFast[i - slopeLookback];
          const r2 = rocFast[i - 1], r3 = rocFast[i - 1 - slopeLookback];
          const r4 = rocFast[i - 2], r5 = rocFast[i - 2 - slopeLookback];
          if (r0 === null || r1 === null || r2 === null || r3 === null || r4 === null || r5 === null) continue;
          const slopeCur = r0 - r1;
          const slopePrev = r2 - r3;
          const slopePrev2 = r4 - r5;
          const curvCur = slopeCur - slopePrev;
          const curvPrev = slopePrev - slopePrev2;
          if (curvPrev >= 0 && curvCur < 0) indices.push(i);
        }
        break;
      }

      default:
        // Unknown category — leave empty
        break;
    }
  }

  return result;
}
