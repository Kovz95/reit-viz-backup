// Z-Score optimizer engine — extracted from ZScoreOptimizer.tsx so the
// window sweep can run in a Web Worker (workers/zscoreSweep.worker.ts)
// with the same kernel doubling as the main-thread fallback. Pure compute.
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore, ReturnBand } from "@/lib/forwardReturns";
import { yieldMain } from "@/lib/yieldMain";

export const CANDIDATE_WINDOWS = [21, 42, 63, 126, 189, 252, 378, 504, 756, 1260];
/** Fractional-differencing orders co-swept when the FracDiff pre-transform is
 *  on. Small d retains long memory; d→1 approaches a first difference. */
export const CANDIDATE_D = [0.2, 0.3, 0.4, 0.5, 0.6];

export interface WindowResult {
  window: number;
  /** Winning frac-diff order for this window when the FracDiff transform is on. */
  d?: number;
  buySummary: SignalSummary;
  sellSummary: SignalSummary;
  buyComposite: CompositeScore;
  sellComposite: CompositeScore;
  compositeScore: number;
  buyRevSummary?: SignalSummary;
  sellRevSummary?: SignalSummary;
  buyRevComposite?: CompositeScore;
  sellRevComposite?: CompositeScore;
  buyProfiles?: ForwardReturnProfile[];
  sellProfiles?: ForwardReturnProfile[];
  buyRevProfiles?: ForwardReturnProfile[];
  sellRevProfiles?: ForwardReturnProfile[];
}

// ── Engine ──

export function computeRollingZScores(values: number[], window: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i++) {
    const start = Math.max(0, i - window);
    const slice = values.slice(start, i);
    const n = slice.length;
    if (n < 2) continue;
    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < n; j++) {
      sum += slice[j];
      sumSq += slice[j] * slice[j];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    if (std > 0) result[i] = (values[i] - mean) / std;
  }
  return result;
}

/** Fractional differencing (López de Prado, fixed-width) of a series, kept
 *  INDEX-ALIGNED to the input: the first `width-1` warm-up bars are NaN and the
 *  rest hold the frac-diff dot product, so it drops straight into
 *  computeRollingZScores (a NaN-in-window yields a null z there) without
 *  shifting the forward-return indexing against priceValues. Runs on ln(x) when
 *  the series is strictly positive, matching lib/quantIndicators computeFracDiff. */
export function fracDiffAligned(values: number[], d: number, thresh = 1e-4): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < 20 || d <= 0) return out;
  const x = values.every((v) => v > 0) ? values.map(Math.log) : values;
  const w: number[] = [1];
  let k = 1;
  while (k < n) {
    const wk = (-w[k - 1] * (d - k + 1)) / k;
    if (Math.abs(wk) < thresh) break;
    w.push(wk); k++;
  }
  const width = w.length;
  for (let i = width - 1; i < n; i++) {
    let dot = 0;
    for (let j = 0; j < width; j++) dot += w[j] * x[i - j];
    out[i] = dot;
  }
  return out;
}

export type TransformKind = "none" | "fracdiff" | "robustz" | "detrend" | "minmax" | "pctile" | "pctspread" | "winsorz" | "iqrpos" | "rankroc" | "pctldisp";

/** Linear-interpolated percentile of an ascending-sorted array. */
export function pctlLin(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const rank = (p / 100) * (n - 1), lo = Math.floor(rank), hi = Math.ceil(rank);
  return lo === hi ? sorted[lo] : sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

/** Rolling WINSORIZED z-score (clip window to [clipPct,100−clipPct] then raw
 *  value vs clipped mean/σ) — robust standardizer, ±σ crossings. */
export function rollingWinsorZ(values: number[], window: number, clipPct = 5): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 5) return out;
  for (let i = window - 1; i < values.length; i++) {
    const win = values.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const loV = pctlLin(win, clipPct), hiV = pctlLin(win, 100 - clipPct);
    let sum = 0;
    for (let k = 0; k < window; k++) sum += Math.min(Math.max(win[k], loV), hiV);
    const mean = sum / window;
    let ss = 0;
    for (let k = 0; k < window; k++) { const cv = Math.min(Math.max(win[k], loV), hiV); ss += (cv - mean) ** 2; }
    const sd = Math.sqrt(ss / window);
    if (sd > 0) out[i] = (values[i] - mean) / sd;
  }
  return out;
}

/** Rolling IQR position centered so the Tukey fences (Q±1.5·IQR) land at ±2:
 *  ((x−Q1)/IQR·100 − 50)/100. ±2 crossing = a Tukey-fence outlier. */
export function rollingIqrCentered(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 5) return out;
  for (let i = window - 1; i < values.length; i++) {
    const win = values.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const q1 = pctlLin(win, 25), q3 = pctlLin(win, 75), iqr = q3 - q1;
    if (iqr > 0) out[i] = (((values[i] - q1) / iqr) * 100 - 50) / 100;
  }
  return out;
}

/** Rolling rate-of-change of percentile rank, scaled /25 so a 50-point rank
 *  move ≈ a ±2 crossing. Momentum of the rank itself. */
export function rollingRankRocSignal(values: number[], window: number, lookback = 10): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 5) return out;
  const rank: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    let below = 0;
    for (let j = i - window + 1; j <= i; j++) if (values[j] <= values[i]) below++;
    rank[i] = ((below - 1) / (window - 1)) * 100;
  }
  for (let i = window - 1 + lookback; i < values.length; i++) {
    const a = rank[i], b = rank[i - lookback];
    if (a != null && b != null) out[i] = (a - b) / 25;
  }
  return out;
}

export const medianOf = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y), n = s.length, m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Rolling ROBUST z-score (median/MAD, ×1.4826 → σ-equivalent), INDEX-ALIGNED
 *  with null warm-up — a drop-in standardizer swap for computeRollingZScores
 *  that keeps the same ±σ crossing thresholds but resists outliers. */
export function rollingRobustZ(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 3) return out;
  for (let i = window - 1; i < values.length; i++) {
    const win = values.slice(i - window + 1, i + 1);
    const med = medianOf(win);
    const mad = medianOf(win.map((v) => Math.abs(v - med)));
    if (mad > 0) out[i] = (values[i] - med) / (1.4826 * mad);
  }
  return out;
}

/** Rolling regression RESIDUAL (detrend), INDEX-ALIGNED with NaN warm-up:
 *  value minus its local log-linear fit at the current bar, as % deviation when
 *  the series is strictly positive (else raw residual). Feeds the rolling
 *  z-score exactly like fracDiffAligned. */
export function regResidAligned(values: number[], window: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (window < 10) return out;
  const isLog = values.every((v) => v > 0);
  const x = isLog ? values.map(Math.log) : values;
  const mi = (window - 1) / 2;
  let varI = 0;
  for (let k = 0; k < window; k++) varI += (k - mi) ** 2;
  for (let i = window - 1; i < n; i++) {
    const from = i - window + 1;
    let my = 0;
    for (let k = 0; k < window; k++) my += x[from + k];
    my /= window;
    let cov = 0;
    for (let k = 0; k < window; k++) cov += (k - mi) * (x[from + k] - my);
    const b = cov / varI;
    const fitted = my + b * ((window - 1) - mi);
    const resid = x[i] - fitted;
    out[i] = isLog ? (Math.exp(resid) - 1) * 100 : resid;
  }
  return out;
}

/** Rolling MIN-MAX position within the window, CENTERED and rescaled to a ±σ-like
 *  axis: 0..100 → −2..+2 ((mm−50)/25). Lets the bounded range oscillator reuse the
 *  optimizer's ±threshold crossing logic — ±2 = range extremes, ±1 = 25/75. */
export function rollingMinMaxCentered(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 2) return out;
  for (let i = window - 1; i < values.length; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = i - window + 1; j <= i; j++) { if (values[j] < lo) lo = values[j]; if (values[j] > hi) hi = values[j]; }
    if (hi > lo) out[i] = (((values[i] - lo) / (hi - lo)) * 100 - 50) / 25;
  }
  return out;
}

/** Rolling PERCENTILE rank (0–100) of the current value within its window,
 *  CENTERED to a ±σ-like axis ((pct−50)/25). The RANK-position cousin of
 *  min-max's linear position — resistant to outliers stretching the range. */
export function rollingPercentileCentered(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 5) return out;
  for (let i = window - 1; i < values.length; i++) {
    let below = 0;
    for (let j = i - window + 1; j <= i; j++) if (values[j] <= values[i]) below++;
    out[i] = (((below - 1) / (window - 1)) * 100 - 50) / 25;
  }
  return out;
}

/** Rolling PERCENTILE-BAND position (winsorized min-max): position of the value
 *  within its [loPct, hiPct] band, CENTERED to a ±σ-like axis ((pos−50)/25).
 *  Outlier-robust vs min-max — a single spike can't stretch the band. */
export function rollingPctBandCentered(values: number[], window: number, hiPct = 80, loPct = 20): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window < 5) return out;
  const pctl = (sorted: number[], p: number): number => {
    const n = sorted.length;
    if (n === 1) return sorted[0];
    const rank = (p / 100) * (n - 1), lo = Math.floor(rank), hi = Math.ceil(rank);
    return lo === hi ? sorted[lo] : sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
  };
  for (let i = window - 1; i < values.length; i++) {
    const win = values.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const lo = pctl(win, loPct), hi = pctl(win, hiPct);
    if (hi > lo) {
      const pos = Math.max(0, Math.min(1, (values[i] - lo) / (hi - lo))) * 100;
      out[i] = (pos - 50) / 25;
    }
  }
  return out;
}

/** Rolling z-score of the inter-percentile DISPERSION (P90−P10 as % of median):
 *  a robust volatility measure standardized against its own recent history, so
 *  ±threshold crossings flag unusually WIDE (expansion) or NARROW (compression)
 *  ranges. Two-stage: dispersion over `window`, then z over a trailing `window`
 *  of dispersions (≈2·window warm-up). */
export function rollingDispersionZ(values: number[], window: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (window < 5) return out;
  const disp = new Array<number>(n).fill(NaN);
  for (let i = window - 1; i < n; i++) {
    const win = values.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const hi = pctlLin(win, 90), lo = pctlLin(win, 10), med = pctlLin(win, 50);
    disp[i] = med > 0 ? ((hi - lo) / med) * 100 : hi - lo;
  }
  for (let i = 2 * (window - 1); i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - window + 1; j <= i; j++) if (Number.isFinite(disp[j])) { sum += disp[j]; cnt++; }
    if (cnt < 3) continue;
    const mean = sum / cnt;
    let ss = 0;
    for (let j = i - window + 1; j <= i; j++) if (Number.isFinite(disp[j])) ss += (disp[j] - mean) ** 2;
    const sd = Math.sqrt(ss / cnt);
    if (sd > 0) out[i] = (disp[i] - mean) / sd;
  }
  return out;
}

/** Build the standardized signal series (crossed at ±threshold) for a given
 *  source pre-transform. Robust-Z / Min-Max / Percentile / Percentile-Spread
 *  replace the z-score outright with their own bounded/robust standardizer;
 *  Frac-Diff and Detrend pre-transform the series and then z-score it. */
export function standardizedSignal(values: number[], window: number, transform: TransformKind, fracDiffD: number): (number | null)[] {
  if (transform === "robustz") return rollingRobustZ(values, window);
  if (transform === "minmax") return rollingMinMaxCentered(values, window);
  if (transform === "pctile") return rollingPercentileCentered(values, window);
  if (transform === "pctspread") return rollingPctBandCentered(values, window);
  if (transform === "winsorz") return rollingWinsorZ(values, window);
  if (transform === "iqrpos") return rollingIqrCentered(values, window);
  if (transform === "rankroc") return rollingRankRocSignal(values, window);
  if (transform === "pctldisp") return rollingDispersionZ(values, window);
  const src = transform === "fracdiff" ? fracDiffAligned(values, fracDiffD)
    : transform === "detrend" ? regResidAligned(values, window)
      : values;
  return computeRollingZScores(src, window);
}

export function analyzeWindow(
  metricValues: number[],
  priceValues: number[],
  window: number,
  buyThreshold: number,
  sellThreshold: number,
  targetReturn: number,
  band: ReturnBand | null,
  signalType: "breakout" | "reversion" | "both",
  weeklyCloses?: number[],
  weeklyResult?: { dailyIndexMap: number[] },
  transform: TransformKind = "none",
  fracDiffD = 0.4,
): WindowResult {
  const zScores = standardizedSignal(metricValues, window, transform, fracDiffD);
  const useBand = band !== null;
  const doBreakout = signalType === "breakout" || signalType === "both";
  const doReversion = signalType === "reversion" || signalType === "both";

  const profileFor = (i: number, direction: "buy" | "sell"): ForwardReturnProfile | null => {
    if (weeklyCloses && weeklyResult) {
      // Map weekly index back to its daily end-of-week index, then profile on weekly closes.
      const dailyIdx = weeklyResult.dailyIndexMap[i] ?? -1;
      if (dailyIdx < 0) return null;
      return computeForwardProfile(weeklyCloses, dailyIdx, targetReturn, direction, band);
    }
    return computeForwardProfile(priceValues, i, targetReturn, direction, band);
  };

  const buyBrk: ForwardReturnProfile[] = [];
  const sellBrk: ForwardReturnProfile[] = [];
  const buyRev: ForwardReturnProfile[] = [];
  const sellRev: ForwardReturnProfile[] = [];

  let prevZ: number | null = null;
  for (let i = 0; i < zScores.length; i++) {
    const z = zScores[i];
    if (z === null) { prevZ = null; continue; }
    if (prevZ !== null) {
      if (doBreakout && prevZ >= buyThreshold && z < buyThreshold) {
        const p = profileFor(i, "buy"); if (p !== null) buyBrk.push(p);
      }
      if (doBreakout && prevZ <= sellThreshold && z > sellThreshold) {
        const p = profileFor(i, "sell"); if (p !== null) sellBrk.push(p);
      }
      if (doReversion && prevZ < buyThreshold && z >= buyThreshold) {
        const p = profileFor(i, "buy"); if (p !== null) buyRev.push(p);
      }
      if (doReversion && prevZ > sellThreshold && z <= sellThreshold) {
        const p = profileFor(i, "sell"); if (p !== null) sellRev.push(p);
      }
    }
    prevZ = z;
  }

  const buySummary = summarizeSignals(doBreakout ? buyBrk : buyRev, "buy");
  const sellSummary = summarizeSignals(doBreakout ? sellBrk : sellRev, "sell");
  const buyComposite = computeCompositeScore(buySummary, "buy", useBand);
  const sellComposite = computeCompositeScore(sellSummary, "sell", useBand);

  let buyRevSummary: SignalSummary | undefined;
  let sellRevSummary: SignalSummary | undefined;
  let buyRevComposite: CompositeScore | undefined;
  let sellRevComposite: CompositeScore | undefined;
  if (signalType === "both") {
    buyRevSummary = summarizeSignals(buyRev, "buy");
    sellRevSummary = summarizeSignals(sellRev, "sell");
    buyRevComposite = computeCompositeScore(buyRevSummary, "buy", useBand);
    sellRevComposite = computeCompositeScore(sellRevSummary, "sell", useBand);
  }

  let directionCount = ((buySummary?.count ?? 0) > 0 ? 1 : 0) + ((sellSummary?.count ?? 0) > 0 ? 1 : 0);
  let scoreSum = buyComposite.score + sellComposite.score;
  if (signalType === "both") {
    if ((buyRevSummary?.count ?? 0) > 0) { directionCount++; scoreSum += buyRevComposite!.score; }
    if ((sellRevSummary?.count ?? 0) > 0) { directionCount++; scoreSum += sellRevComposite!.score; }
  }
  const compositeScore = directionCount > 0 ? scoreSum / directionCount : 0;

  return {
    window,
    buySummary,
    sellSummary,
    buyComposite,
    sellComposite,
    compositeScore: Math.round(compositeScore),
    buyRevSummary,
    sellRevSummary,
    buyRevComposite,
    sellRevComposite,
    buyProfiles: buyBrk,
    sellProfiles: sellBrk,
    buyRevProfiles: buyRev,
    sellRevProfiles: sellRev,
  };
}

// ── Per-ticker sweep (the loop the page used to run inline) ──

export interface ZscoreSweepPayload {
  metricSeries: number[];
  priceSeries: number[];
  buyThreshold: number;
  sellThreshold: number;
  targetReturn: number;
  band: ReturnBand | null;
  signalType: "breakout" | "reversion" | "both";
  weeklyCloses?: number[];
  weeklyResult?: { dailyIndexMap: number[] };
  transform: TransformKind;
}

export async function runZscoreSweep(p: ZscoreSweepPayload): Promise<WindowResult[]> {
  // Frac-diff co-sweeps CANDIDATE_D; other transforms have no extra knob.
  // Keep the best-scoring d per window so the table stays one row/window.
  const dList = p.transform === "fracdiff" ? CANDIDATE_D : [null];
  const windowResults: WindowResult[] = [];
  for (const w of CANDIDATE_WINDOWS) {
    if (w > p.metricSeries.length * 0.8) continue;
    await yieldMain(); // main-thread fallback stays responsive; no-op cost in a worker
    let bestForW: WindowResult | null = null;
    for (const dd of dList) {
      const wr = analyzeWindow(p.metricSeries, p.priceSeries, w, p.buyThreshold, p.sellThreshold, p.targetReturn, p.band, p.signalType, p.weeklyCloses, p.weeklyResult, p.transform, dd ?? 0.4);
      if (dd != null) wr.d = dd;
      if (!bestForW || wr.compositeScore > bestForW.compositeScore) bestForW = wr;
    }
    if (bestForW) windowResults.push(bestForW);
  }
  return windowResults;
}
