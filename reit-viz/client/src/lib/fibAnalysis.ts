// Fibonacci level analysis over the dominant swing of an OHLC window.
// Unlike srLevels' detectFibLevels (5 retracement ratios, minTouches-filtered),
// this computes the FULL ladder — retracements 0…1 plus extensions projected in
// the trend direction — with per-level touch/bounce stats and NO touch-count
// filtering, so a proximity screener can rank untouched levels too.
import { evaluateTouches, DEFAULT_SR_CONFIG, type TouchResult, type TouchEvent } from "@/lib/srLevels";

export const FIB_RETRACEMENTS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const FIB_EXTENSIONS = [1.272, 1.618, 2.618] as const;

export interface FibConfig {
  /** Swing search window, in bars of whatever frequency the input is. */
  lookbackBars: number;
  tolerancePct: number;
  bounceLookahead: number;
  bounceThresholdPct: number;
  holdBars: number;
  /** A level "bounced recently" if a reversing touch happened within this many bars of the end. */
  recentBounceBars: number;
}

export const DEFAULT_FIB_CONFIG: FibConfig = {
  lookbackBars: 252,
  tolerancePct: 0.005,
  bounceLookahead: 5,
  bounceThresholdPct: 0.015,
  holdBars: 5,
  recentBounceBars: 10,
};

export interface FibSwing {
  highIdx: number;
  lowIdx: number;
  highDate: string;
  lowDate: string;
  swingHigh: number;
  swingLow: number;
  /** "up" when the high came at-or-after the low (same orientation test as srLevels' detectFibLevels). */
  direction: "up" | "down";
}

export interface FibLevelInfo extends TouchResult {
  ratio: number;
  kind: "retracement" | "extension";
  price: number;
  /** Signed: (lastClose − price) / price × 100. Positive = price above the level. */
  distancePct: number;
  /** Latest reversing touch within recentBounceBars of the end, if any.
   *  Bounces need bounceLookahead future bars to confirm, so touches in the
   *  last few bars may not (yet) qualify. */
  recentBounce: TouchEvent | null;
}

export interface FibAnalysis {
  swing: FibSwing;
  /** All retracement + extension levels, unfiltered. */
  levels: FibLevelInfo[];
  /** Level with the smallest |distancePct|. */
  nearest: FibLevelInfo;
  currentPrice: number;
}

export function computeFibSwing(
  highs: number[],
  lows: number[],
  dates: string[],
  lookbackBars: number,
): FibSwing | null {
  const n = highs.length;
  if (n === 0) return null;
  const start = Math.max(0, n - lookbackBars);
  let highIdx = start, lowIdx = start;
  for (let i = start; i < n; i++) {
    if (highs[i] > highs[highIdx]) highIdx = i;
    if (lows[i] < lows[lowIdx]) lowIdx = i;
  }
  const swingHigh = highs[highIdx], swingLow = lows[lowIdx];
  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh - swingLow <= 0) return null;
  return {
    highIdx, lowIdx,
    highDate: dates[highIdx] ?? "",
    lowDate: dates[lowIdx] ?? "",
    swingHigh, swingLow,
    direction: highIdx >= lowIdx ? "up" : "down",
  };
}

export function computeFibAnalysis(
  ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] },
  userCfg?: Partial<FibConfig>,
): FibAnalysis | null {
  const cfg = { ...DEFAULT_FIB_CONFIG, ...userCfg };
  const n = ohlc.closes.length;
  if (n === 0) return null;
  const currentPrice = ohlc.closes[n - 1];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const swing = computeFibSwing(ohlc.highs, ohlc.lows, ohlc.dates, cfg.lookbackBars);
  if (!swing) return null;
  const range = swing.swingHigh - swing.swingLow;
  const touchCfg = {
    ...DEFAULT_SR_CONFIG,
    tolerancePct: cfg.tolerancePct,
    bounceLookahead: cfg.bounceLookahead,
    bounceThresholdPct: cfg.bounceThresholdPct,
    holdBars: cfg.holdBars,
  };
  const recentCutoff = n - cfg.recentBounceBars;

  const levels: FibLevelInfo[] = [];
  const addLevel = (ratio: number, kind: "retracement" | "extension") => {
    // Retracements measure back from the later extreme; extensions project
    // past it in the trend direction (up-swing: above the high; down: below the low).
    const price = swing.direction === "up"
      ? (kind === "retracement" ? swing.swingHigh - range * ratio : swing.swingLow + range * ratio)
      : (kind === "retracement" ? swing.swingLow + range * ratio : swing.swingHigh - range * ratio);
    if (!Number.isFinite(price) || price <= 0) return;
    const res = evaluateTouches(price, ohlc, touchCfg);
    let recentBounce: TouchEvent | null = null;
    for (let i = res.touches.length - 1; i >= 0; i--) {
      const t = res.touches[i];
      if (t.bouncedReverse && t.index >= recentCutoff) { recentBounce = t; break; }
    }
    levels.push({ ...res, ratio, kind, price, distancePct: ((currentPrice - price) / price) * 100, recentBounce });
  };
  for (const r of FIB_RETRACEMENTS) addLevel(r, "retracement");
  for (const r of FIB_EXTENSIONS) addLevel(r, "extension");
  if (levels.length === 0) return null;

  let nearest = levels[0];
  for (const l of levels) if (Math.abs(l.distancePct) < Math.abs(nearest.distancePct)) nearest = l;
  return { swing, levels, nearest, currentPrice };
}
