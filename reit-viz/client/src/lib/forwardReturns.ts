/**
 * Shared forward return engine for all optimizer tabs.
 *
 * Instead of a single fixed-horizon return, this measures returns across
 * an array of forward horizons and evaluates them against configurable
 * return thresholds (e.g., "did it reach +5% at any point within 63 days?").
 *
 * Key concepts:
 * - Multi-horizon: measures 1W, 2W, 1M, 2M, 3M, 6M forward returns simultaneously
 * - Threshold-based: "hit" means the return reached a configurable target (e.g., 5%)
 * - Peak/trough tracking: records the max gain and max drawdown within each horizon
 * - Risk-adjusted: computes Sharpe-like ratio (avg return / std of returns)
 * - Asymmetric: buy signals want positive returns, sell signals want negative returns
 */

// ── Forward horizons (trading days) ──

export const FORWARD_HORIZONS = [
  { days: 5, label: "1W" },
  { days: 10, label: "2W" },
  { days: 21, label: "1M" },
  { days: 42, label: "2M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
] as const;

export type HorizonLabel = (typeof FORWARD_HORIZONS)[number]["label"];

// ── Types ──

/** Band-based target: return must land within [minReturn, maxReturn] at any point in the horizon */
export interface ReturnBand {
  minReturn: number; // e.g. 0.05 = 5%
  maxReturn: number; // e.g. 0.10 = 10%
}

export interface ForwardReturnProfile {
  /** Point-to-point return at each horizon */
  returns: Record<HorizonLabel, number | null>;
  /** Max gain (peak) reached within each horizon window */
  peakReturn: Record<HorizonLabel, number | null>;
  /** Max drawdown (trough) from entry within each horizon window */
  troughReturn: Record<HorizonLabel, number | null>;
  /** Whether the return target threshold was reached within each horizon */
  hitTarget: Record<HorizonLabel, boolean>;
  /** Whether return entered the [min, max] band at any point within each horizon */
  hitBand: Record<HorizonLabel, boolean>;
}

export interface SignalSummary {
  count: number;
  /** Point-to-point return stats per horizon */
  avgReturn: Record<HorizonLabel, number>;
  medianReturn: Record<HorizonLabel, number>;
  stdReturn: Record<HorizonLabel, number>;
  /** Hit rate: % of signals where return exceeded target threshold */
  hitRate: Record<HorizonLabel, number>;
  /** Band hit rate: % of signals where return entered [min, max] band */
  bandHitRate: Record<HorizonLabel, number>;
  /** Average peak return per horizon (best case) */
  avgPeak: Record<HorizonLabel, number>;
  /** Average trough return per horizon (worst case) */
  avgTrough: Record<HorizonLabel, number>;
  /** Win rate: % of signals with positive endpoint return */
  winRate: Record<HorizonLabel, number>;
  /** Profit factor: sum of winning returns / abs(sum of losing returns) */
  profitFactor: Record<HorizonLabel, number>;
  /** Avg return / std return (Sharpe-like, annualised not needed since we compare horizons) */
  returnRiskRatio: Record<HorizonLabel, number>;
}

export interface CompositeScore {
  /** 0-100 composite quality score */
  score: number;
  /** Breakdown: which horizon contributed most */
  bestHorizon: HorizonLabel;
  bestHitRate: number;
  bestAvgReturn: number;
}

// ── Core computation ──

/**
 * Compute the full forward return profile for a signal at index `i`.
 *
 * @param prices - aligned price array
 * @param i - index of the signal
 * @param targetPct - absolute return threshold (e.g., 0.05 = 5%). For buy signals
 *   we check if peak >= target; for sell signals, if trough <= -target.
 * @param direction - "buy" or "sell"
 * @param band - optional return band [min, max]. When provided, checks if the return
 *   at ANY day within the horizon falls within [min, max] for buys, or [-max, -min] for sells.
 */
export function computeForwardProfile(
  prices: number[],
  i: number,
  targetPct: number,
  direction: "buy" | "sell",
  band?: ReturnBand | null,
  minHold?: number | null,
  benchmarkSeries?: number[] | null
): ForwardReturnProfile {
  const entry = prices[i];
  const returns: Record<string, number | null> = {};
  const peakReturn: Record<string, number | null> = {};
  const troughReturn: Record<string, number | null> = {};
  const hitTarget: Record<string, boolean> = {};
  const hitBand: Record<string, boolean> = {};

  for (const { days, label } of FORWARD_HORIZONS) {
    if (i + days >= prices.length) {
      returns[label] = null;
      peakReturn[label] = null;
      troughReturn[label] = null;
      hitTarget[label] = false;
      hitBand[label] = false;
      continue;
    }

    // Point-to-point return
    returns[label] = (prices[i + days] - entry) / entry;

    // Track peak and trough within the window
    let peak = 0;
    let trough = 0;
    let targetHit = false;
    let bandHit = false;
    const end = Math.min(i + days, prices.length - 1);

    for (let j = i + 1; j <= end; j++) {
      const ret = (prices[j] - entry) / entry;
      if (ret > peak) peak = ret;
      if (ret < trough) trough = ret;

      // Single-threshold hit detection (backward compatible)
      if (direction === "buy" && ret >= targetPct) targetHit = true;
      if (direction === "sell" && ret <= -targetPct) targetHit = true;

      // Band hit detection: did the return path enter [min, max] band?
      if (band) {
        if (direction === "buy") {
          // Buy: check if ret is within [minReturn, maxReturn]
          if (ret >= band.minReturn && ret <= band.maxReturn) bandHit = true;
        } else {
          // Sell: check if -ret is within [minReturn, maxReturn] (i.e. ret within [-maxReturn, -minReturn])
          if (ret <= -band.minReturn && ret >= -band.maxReturn) bandHit = true;
        }
      }
    }

    peakReturn[label] = peak;
    troughReturn[label] = trough;
    hitTarget[label] = targetHit;
    hitBand[label] = bandHit;
  }

  return {
    returns: returns as ForwardReturnProfile["returns"],
    peakReturn: peakReturn as ForwardReturnProfile["peakReturn"],
    troughReturn: troughReturn as ForwardReturnProfile["troughReturn"],
    hitTarget: hitTarget as ForwardReturnProfile["hitTarget"],
    hitBand: hitBand as ForwardReturnProfile["hitBand"],
  };
}

/**
 * Aggregate an array of forward return profiles into summary statistics.
 */
export function summarizeSignals(
  profiles: ForwardReturnProfile[],
  direction: "buy" | "sell"
): SignalSummary {
  const count = profiles.length;
  const labels = FORWARD_HORIZONS.map((h) => h.label);

  const avgReturn: Record<string, number> = {};
  const medianReturn: Record<string, number> = {};
  const stdReturn: Record<string, number> = {};
  const hitRate: Record<string, number> = {};
  const bandHitRate: Record<string, number> = {};
  const avgPeak: Record<string, number> = {};
  const avgTrough: Record<string, number> = {};
  const winRate: Record<string, number> = {};
  const profitFactor: Record<string, number> = {};
  const returnRiskRatio: Record<string, number> = {};

  for (const label of labels) {
    const valid = profiles.filter((p) => p.returns[label as HorizonLabel] !== null);
    const n = valid.length;

    if (n === 0) {
      avgReturn[label] = 0;
      medianReturn[label] = 0;
      stdReturn[label] = 0;
      hitRate[label] = 0;
      bandHitRate[label] = 0;
      avgPeak[label] = 0;
      avgTrough[label] = 0;
      winRate[label] = 0;
      profitFactor[label] = 0;
      returnRiskRatio[label] = 0;
      continue;
    }

    const rets = valid.map((p) => p.returns[label as HorizonLabel]!);
    const peaks = valid.map((p) => p.peakReturn[label as HorizonLabel]!);
    const troughs = valid.map((p) => p.troughReturn[label as HorizonLabel]!);
    const hits = valid.filter((p) => p.hitTarget[label as HorizonLabel]).length;

    // Average
    const avg = rets.reduce((a, b) => a + b, 0) / n;
    avgReturn[label] = avg;

    // Median
    const sorted = [...rets].sort((a, b) => a - b);
    medianReturn[label] = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Std dev
    const variance = rets.reduce((s, r) => s + (r - avg) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    stdReturn[label] = std;

    // Hit rate (target threshold)
    hitRate[label] = hits / n;

    // Band hit rate
    const bandHits = valid.filter((p) => p.hitBand[label as HorizonLabel]).length;
    bandHitRate[label] = bandHits / n;

    // Peak/trough averages
    avgPeak[label] = peaks.reduce((a, b) => a + b, 0) / n;
    avgTrough[label] = troughs.reduce((a, b) => a + b, 0) / n;

    // Win rate: for buys, positive return = win; for sells, negative return = win
    const wins = direction === "buy"
      ? rets.filter((r) => r > 0).length
      : rets.filter((r) => r < 0).length;
    winRate[label] = wins / n;

    // Profit factor
    const winSum = direction === "buy"
      ? rets.filter((r) => r > 0).reduce((a, b) => a + b, 0)
      : rets.filter((r) => r < 0).reduce((a, b) => a + Math.abs(b), 0);
    const lossSum = direction === "buy"
      ? Math.abs(rets.filter((r) => r < 0).reduce((a, b) => a + b, 0))
      : rets.filter((r) => r > 0).reduce((a, b) => a + b, 0);
    profitFactor[label] = lossSum > 0 ? winSum / lossSum : winSum > 0 ? 99 : 0;

    // Return/risk ratio
    returnRiskRatio[label] = std > 0 ? Math.abs(avg) / std : 0;
  }

  return {
    count,
    avgReturn: avgReturn as SignalSummary["avgReturn"],
    medianReturn: medianReturn as SignalSummary["medianReturn"],
    stdReturn: stdReturn as SignalSummary["stdReturn"],
    hitRate: hitRate as SignalSummary["hitRate"],
    bandHitRate: bandHitRate as SignalSummary["bandHitRate"],
    avgPeak: avgPeak as SignalSummary["avgPeak"],
    avgTrough: avgTrough as SignalSummary["avgTrough"],
    winRate: winRate as SignalSummary["winRate"],
    profitFactor: profitFactor as SignalSummary["profitFactor"],
    returnRiskRatio: returnRiskRatio as SignalSummary["returnRiskRatio"],
  };
}

/**
 * Compute a composite quality score (0-100) from a SignalSummary.
 *
 * Weights:
 *   40% hit rate (across horizons, weighted toward 3M/6M)
 *   25% avg return (direction-adjusted)
 *   15% profit factor
 *   10% return/risk ratio
 *   10% signal count penalty
 *
 * When useBandRate=true, uses bandHitRate instead of hitRate for the hit component.
 */
export function computeCompositeScore(
  summary: SignalSummary,
  direction: "buy" | "sell",
  useBandRate: boolean = false
): CompositeScore {
  if (summary.count === 0) {
    return { score: 0, bestHorizon: "1M", bestHitRate: 0, bestAvgReturn: 0 };
  }

  // Horizon weights: prefer longer horizons
  const horizonWeights: Record<HorizonLabel, number> = {
    "1W": 0.03,
    "2W": 0.05,
    "1M": 0.12,
    "2M": 0.15,
    "3M": 0.30,
    "6M": 0.35,
  };

  // Hit rate component (0-1) — use band hit rate when band mode is active
  const hitSource = useBandRate ? summary.bandHitRate : summary.hitRate;
  let hitComponent = 0;
  for (const { label } of FORWARD_HORIZONS) {
    hitComponent += (hitSource[label] ?? 0) * horizonWeights[label];
  }

  // Avg return component: normalize, cap at ±20%
  let retComponent = 0;
  for (const { label } of FORWARD_HORIZONS) {
    const r = direction === "buy" ? summary.avgReturn[label] : -summary.avgReturn[label];
    retComponent += Math.min(1, Math.max(0, r / 0.20)) * horizonWeights[label];
  }

  // Profit factor component: PF > 2 is great, > 1 is ok
  let pfComponent = 0;
  for (const { label } of FORWARD_HORIZONS) {
    const pf = summary.profitFactor[label];
    pfComponent += Math.min(1, pf / 3) * horizonWeights[label];
  }

  // Return/risk component
  let rrComponent = 0;
  for (const { label } of FORWARD_HORIZONS) {
    rrComponent += Math.min(1, summary.returnRiskRatio[label] / 1.0) * horizonWeights[label];
  }

  // Signal count penalty
  const signalPenalty = summary.count < 3 ? 0.3
    : summary.count < 5 ? 0.5
    : summary.count < 10 ? 0.75
    : summary.count < 20 ? 0.9
    : 1.0;

  const raw = (
    hitComponent * 0.40 +
    retComponent * 0.25 +
    pfComponent * 0.15 +
    rrComponent * 0.10 +
    signalPenalty * 0.10
  );

  const score = Math.round(Math.max(0, Math.min(100, raw * 100)));

  // Find best horizon
  let bestHorizon: HorizonLabel = "3M";
  let bestScore = -Infinity;
  for (const { label } of FORWARD_HORIZONS) {
    const hr = useBandRate ? (summary.bandHitRate[label] ?? 0) : summary.hitRate[label];
    const s = hr * 0.5 + Math.min(1, Math.abs(summary.avgReturn[label]) / 0.10) * 0.5;
    if (s > bestScore) {
      bestScore = s;
      bestHorizon = label;
    }
  }

  return {
    score,
    bestHorizon,
    bestHitRate: useBandRate ? (summary.bandHitRate[bestHorizon] ?? 0) : summary.hitRate[bestHorizon],
    bestAvgReturn: summary.avgReturn[bestHorizon],
  };
}

// ── Shared UI helpers ──

/** Color for composite score badges (dark-bg friendly) */
export function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  if (t < 0.3) return `hsl(0, 70%, ${12 + t * 30}%)`;
  if (t < 0.5) {
    const p = (t - 0.3) / 0.2;
    return `hsl(${p * 35}, 65%, ${20 + p * 5}%)`;
  }
  if (t < 0.7) {
    const p = (t - 0.5) / 0.2;
    return `hsl(${35 + p * 40}, 55%, ${25 + p * 3}%)`;
  }
  const p = (t - 0.7) / 0.3;
  return `hsl(${75 + p * 50}, ${50 + p * 20}%, ${22 + p * 8}%)`;
}

export function scoreTextColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  if (t < 0.3) return "#ff8a8a";
  if (t < 0.5) return "#ffc170";
  if (t < 0.7) return "#e8d44d";
  return "#7ddf7d";
}

export function hitRateColor(rate: number): string {
  if (rate === 0) return "text-muted-foreground/40";
  if (rate >= 0.75) return "text-emerald-400 font-bold";
  if (rate >= 0.6) return "text-green-400";
  if (rate >= 0.5) return "text-yellow-300";
  if (rate >= 0.4) return "text-orange-400";
  return "text-red-400";
}

export function profitFactorColor(pf: number): string {
  if (pf >= 2.0) return "text-emerald-400 font-bold";
  if (pf >= 1.5) return "text-green-400";
  if (pf >= 1.0) return "text-yellow-300";
  if (pf >= 0.5) return "text-orange-400";
  return "text-red-400";
}

export const pct = (v: number) => (v * 100).toFixed(1) + "%";
export const pctSigned = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

/**
 * All metrics available for any equity (generalized, not REIT-specific).
 * The optimizer will dynamically filter to metrics that exist in the user's data.
 */
export const ALL_METRICS = [
  "close",
  // Earnings-based
  "P/E LTM", "P/E FY2",
  // Revenue-based
  "P/S LTM", "P/S FY2",
  // EBITDA-based
  "EV/EBITDA LTM", "EV/EBITDA FY2",
  // REIT-specific (available when data has them)
  "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  "Implied Cap Rate",
  // Income / yield
  "Dividend Yield",
  // Technicals
  "Short Interest%",
  // Growth metrics
  "FY1 EPS Growth", "FY2 EPS Growth",
  "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  // Momentum (price change)
  "1M Price Chg%", "3M Price Chg%", "6M Price Chg%", "1Y Price Chg%",
  // Relative price
  "% off 52wk High", "% off 52wk Low",
];

/** Return target thresholds the user can choose from (single threshold mode) */
export const TARGET_THRESHOLDS = [
  { value: 0.02, label: "2%" },
  { value: 0.03, label: "3%" },
  { value: 0.05, label: "5%" },
  { value: 0.07, label: "7%" },
  { value: 0.10, label: "10%" },
  { value: 0.15, label: "15%" },
  { value: 0.20, label: "20%" },
];

/** Preset return bands for band mode */
export const RETURN_BAND_PRESETS: { label: string; band: ReturnBand }[] = [
  { label: "2–5%", band: { minReturn: 0.02, maxReturn: 0.05 } },
  { label: "3–7%", band: { minReturn: 0.03, maxReturn: 0.07 } },
  { label: "5–10%", band: { minReturn: 0.05, maxReturn: 0.10 } },
  { label: "5–15%", band: { minReturn: 0.05, maxReturn: 0.15 } },
  { label: "7–15%", band: { minReturn: 0.07, maxReturn: 0.15 } },
  { label: "10–20%", band: { minReturn: 0.10, maxReturn: 0.20 } },
  { label: "15–30%", band: { minReturn: 0.15, maxReturn: 0.30 } },
];

// ─── Additional exports used by SlowStochOptimizer ──────────────────────────

export const TARGET_RETURN_OPTIONS = [0.02, 0.03, 0.05, 0.07, 0.10, 0.15, 0.20];

export const RANK_BY_OPTIONS = [
  { value: "hitRate", label: "Hit Rate" },
  { value: "avgReturn", label: "Avg Return" },
  { value: "composite", label: "Composite" },
  { value: "profitFactor", label: "Profit Factor" },
] as const;

export const DATE_PRESETS = [
  { label: "1Y", days: 252 },
  { label: "2Y", days: 504 },
  { label: "3Y", days: 756 },
  { label: "5Y", days: 1260 },
  { label: "All", days: 0 },
] as const;

export function createDateRangeFromPreset(preset?: { days: number } | null): { start: string | null; end: string | null } {
  if (!preset || !preset.days) return { start: null, end: null };
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - preset.days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function defaultInputSelection(): string {
  return "close";
}

export function isBasketTicker(ticker: string): boolean {
  return ticker.startsWith("$") || ticker.startsWith("BASKET:");
}

export function getScoreWeights(rankBy?: string): Record<string, number> {
  return { hitRate: 0.4, avgReturn: 0.3, profitFactor: 0.2, sharpe: 0.1 };
}

export function pickBestByRankMode(
  summary: any,
  compositeScore: number,
  direction?: "buy" | "sell",
  scoreWeights?: Record<string, number>
): number {
  // Returns a numeric score for ranking; callers compare scores across categories
  if (!summary) return compositeScore;
  const weights = scoreWeights ?? { hitRate: 0.4, avgReturn: 0.3, profitFactor: 0.2, sharpe: 0.1 };
  let score = compositeScore * 0.5;
  if (typeof summary.hitRate === "object" && summary.hitRate) {
    const hitVals = Object.values(summary.hitRate as Record<string, number>);
    if (hitVals.length) score += (weights.hitRate ?? 0.4) * hitVals.reduce((a, b) => a + b, 0) / hitVals.length;
  }
  return score;
}

export function scoreBackgroundColor(score: number): string {
  if (score >= 0.7) return "rgba(34,197,94,0.15)";
  if (score >= 0.5) return "rgba(234,179,8,0.15)";
  return "rgba(239,68,68,0.15)";
}
