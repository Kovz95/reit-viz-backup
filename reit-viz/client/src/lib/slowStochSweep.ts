// Slow Stochastic optimizer kernel — extracted from SlowStochOptimizer.tsx so
// the grid sweep can run in a Web Worker (workers/slowStochOptimizer.worker.ts)
// with the same function doubling as the main-thread fallback. Pure compute:
// no React, no DOM, no fetching.
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore } from "@/lib/forwardReturns";

// ── Types ──

export type SignalKind = "kd_cross" | "k_threshold" | "kd_cross_in_zone";
export type GridSize = "quick" | "standard" | "deep";
export type ReturnMode = "threshold" | "band";

export interface StochParams {
  kLength: number;
  smoothK: number;
  smoothD: number;
  obThreshold: number;
  osThreshold: number;
}

export interface CategoryResult {
  category: "buy" | "sell";
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

export interface StochConfigResult {
  configLabel: string;
  configKey: string;
  kind: SignalKind;
  params: StochParams;
  categories: CategoryResult[];
  bestCategory: "buy" | "sell";
  bestScore: number;
  totalSignals: number;
}

export interface TickerStochResult {
  ticker: string;
  name?: string;
  kind: SignalKind;
  configs: StochConfigResult[];
  bestConfigLabel: string;
  bestCategory: "buy" | "sell";
  bestScore: number;
  currentSlowK: number | null;
  currentSlowD: number | null;
  currentSignal: string;
}

export const SIGNAL_KIND_CATEGORY_META = {
  buy: { label: "Buy Signal", description: "Long-side signal — entry into long position" },
  sell: { label: "Sell Signal", description: "Short-side signal — entry into short position" },
};

// ── Grid configurations ──

export interface StochGrid {
  kLength: number[];
  smoothK: number[];
  smoothD: number[];
  obThresholds: number[];
  osThresholds: number[];
}

export const STOCH_GRIDS: Record<GridSize, StochGrid> = {
  quick: { kLength: [14], smoothK: [3], smoothD: [3], obThresholds: [80], osThresholds: [20] },
  standard: { kLength: [9, 14, 21], smoothK: [3], smoothD: [3, 5], obThresholds: [75, 80, 85], osThresholds: [15, 20, 25] },
  deep: { kLength: [5, 9, 14, 21, 28], smoothK: [1, 3, 5], smoothD: [3, 5, 9], obThresholds: [70, 75, 80, 85], osThresholds: [15, 20, 25, 30] },
};

export function countCombos(grid: StochGrid, kind: SignalKind): number {
  const i = grid.kLength.length, k = grid.smoothK.length, p = grid.smoothD.length;
  const o = grid.obThresholds.length, a = grid.osThresholds.length;
  switch (kind) {
    case "kd_cross": return i * k * p;
    case "k_threshold": return i * k * o * a;
    case "kd_cross_in_zone": return i * k * p * o * a;
    default: return 0;
  }
}

// ── Stochastic calculation ──

export function computeSlowStoch(
  closes: number[],
  highs: number[],
  lows: number[],
  kLength: number,
  smoothK: number,
  smoothD: number
): { slowK: (number | null)[]; slowD: (number | null)[] } {
  const n = closes.length;
  const rawK: (number | null)[] = new Array(n).fill(null);
  for (let i = kLength - 1; i < n; i++) {
    let lo = lows[i], hi = highs[i];
    for (let j = i - kLength + 1; j <= i; j++) {
      if (lows[j] < lo) lo = lows[j];
      if (highs[j] > hi) hi = highs[j];
    }
    const range = hi - lo;
    rawK[i] = range === 0 ? null : (100 * (closes[i] - lo)) / range;
  }
  const slowK: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothK - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - smoothK + 1; j <= i; j++) {
      if (rawK[j] !== null) { sum += rawK[j] as number; cnt++; }
    }
    if (cnt === smoothK) slowK[i] = sum / smoothK;
  }
  const slowD: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothD - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - smoothD + 1; j <= i; j++) {
      if (slowK[j] !== null) { sum += slowK[j] as number; cnt++; }
    }
    if (cnt === smoothD) slowD[i] = sum / smoothD;
  }
  return { slowK, slowD };
}

// ── Signal generators ──

export interface SignalEvent { index: number; direction: "buy" | "sell" }

export function kdCrossSignals(slowK: (number | null)[], slowD: (number | null)[], warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1], d = slowD[i], dp = slowD[i - 1];
    if (k === null || kp === null || d === null || dp === null) continue;
    if (kp <= dp && k > d) signals.push({ index: i, direction: "buy" });
    else if (kp >= dp && k < d) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

export function kThresholdSignals(slowK: (number | null)[], obThr: number, osThr: number, warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1];
    if (k === null || kp === null) continue;
    if (kp <= osThr && k > osThr) signals.push({ index: i, direction: "buy" });
    else if (kp >= obThr && k < obThr) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

export function kdCrossInZoneSignals(slowK: (number | null)[], slowD: (number | null)[], obThr: number, osThr: number, warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1], d = slowD[i], dp = slowD[i - 1];
    if (k === null || kp === null || d === null || dp === null) continue;
    const crossUp = kp <= dp && k > d;
    const crossDown = kp >= dp && k < d;
    if (crossUp && k < osThr && d < osThr) signals.push({ index: i, direction: "buy" });
    else if (crossDown && k > obThr && d > obThr) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

// ── Optimizer core ──

export interface OptimizerOptions {
  kind: SignalKind;
  grid: StochGrid;
  targetReturn: number;
  returnMode: ReturnMode;
  bandMin: number;
  bandMax: number;
  minHold: number;
}

export async function runStochOptimizer(
  ticker: string,
  name: string,
  closes: number[],
  highs: number[],
  lows: number[],
  opts: OptimizerOptions,
  onProgress?: (done: number, total: number) => void
): Promise<TickerStochResult | null> {
  const grid = opts.grid;
  const totalCombos = countCombos(grid, opts.kind);
  if (totalCombos === 0) return null;

  const stochCache = new Map<string, { slowK: (number | null)[]; slowD: (number | null)[] }>();
  const getStoch = (kLen: number, sk: number, sd: number) => {
    const key = `${kLen}_${sk}_${sd}`;
    let v = stochCache.get(key);
    if (!v) { v = computeSlowStoch(closes, highs, lows, kLen, sk, sd); stochCache.set(key, v); }
    return v;
  };

  const bandOpts = opts.returnMode === "band" ? { minReturn: opts.bandMin, maxReturn: opts.bandMax } : null;
  const isBand = opts.returnMode === "band";
  const results: StochConfigResult[] = [];
  let done = 0;
  const progressInterval = Math.max(10, Math.floor(totalCombos / 20));
  // Yield to the event loop at each progress interval — as the main-thread
  // fallback this keeps the tab responsive; in a worker it's a cheap no-op
  // that lets progress messages flush.
  const tick = async () => {
    done++;
    if (done % progressInterval === 0) {
      onProgress?.(done, totalCombos);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  };

  const maxKLen = Math.max(...grid.kLength);
  const maxSK = Math.max(...grid.smoothK);
  const maxSD = Math.max(...grid.smoothD);
  const warmup = maxKLen + maxSK + maxSD + 20;

  const processSignals = (
    signals: SignalEvent[],
    configLabel: string,
    configKey: string,
    kind: SignalKind,
    params: StochParams
  ) => {
    const buyProfiles: ForwardReturnProfile[] = [];
    const sellProfiles: ForwardReturnProfile[] = [];
    let lastIdx = -1;
    for (const sig of signals) {
      if (opts.minHold > 0 && sig.index < lastIdx) continue;
      const profile = (computeForwardProfile as any)(closes, sig.index, opts.targetReturn, sig.direction, bandOpts, opts.minHold);
      if (sig.direction === "buy") buyProfiles.push(profile);
      else sellProfiles.push(profile);
      if (opts.minHold > 0) lastIdx = sig.index + opts.minHold;
    }
    const buySummary = summarizeSignals(buyProfiles, "buy");
    const sellSummary = summarizeSignals(sellProfiles, "sell");
    const buyComposite = computeCompositeScore(buySummary, "buy", isBand);
    const sellComposite = computeCompositeScore(sellSummary, "sell", isBand);
    const categories: CategoryResult[] = [
      { category: "buy", label: SIGNAL_KIND_CATEGORY_META.buy.label, description: SIGNAL_KIND_CATEGORY_META.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
      { category: "sell", label: SIGNAL_KIND_CATEGORY_META.sell.label, description: SIGNAL_KIND_CATEGORY_META.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
    ];
    const bestCat = categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, categories[0]);
    results.push({ configLabel, configKey, kind, params, categories, bestCategory: bestCat.category, bestScore: bestCat.composite.score, totalSignals: signals.length });
  };

  if (opts.kind === "kd_cross") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK)
        for (const sd of grid.smoothD) {
          const { slowK, slowD } = getStoch(kLen, sk, sd);
          const signals = kdCrossSignals(slowK, slowD, warmup);
          processSignals(signals, `K-D Cross(${kLen},${sk},${sd})`, `kd_${kLen}_${sk}_${sd}`, "kd_cross", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: 80, osThreshold: 20 });
          await tick();
        }
  } else if (opts.kind === "k_threshold") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK) {
        const sd = grid.smoothD[0];
        const { slowK } = getStoch(kLen, sk, sd);
        for (const ob of grid.obThresholds)
          for (const os of grid.osThresholds) {
            const signals = kThresholdSignals(slowK, ob, os, warmup);
            processSignals(signals, `K Thr(${kLen},${sk}) OB${ob}/OS${os}`, `kthr_${kLen}_${sk}_${ob}_${os}`, "k_threshold", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: ob, osThreshold: os });
            await tick();
          }
      }
  } else if (opts.kind === "kd_cross_in_zone") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK)
        for (const sd of grid.smoothD) {
          const { slowK, slowD } = getStoch(kLen, sk, sd);
          for (const ob of grid.obThresholds)
            for (const os of grid.osThresholds) {
              const signals = kdCrossInZoneSignals(slowK, slowD, ob, os, warmup);
              processSignals(signals, `KD Zone(${kLen},${sk},${sd}) OB${ob}/OS${os}`, `kdzone_${kLen}_${sk}_${sd}_${ob}_${os}`, "kd_cross_in_zone", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: ob, osThreshold: os });
              await tick();
            }
        }
  }

  if (onProgress) onProgress(done, totalCombos);
  if (results.length === 0) return null;

  // Keep profiles only for top-8
  const TOP_K = 8;
  const sorted = [...results].sort((a, b) => b.bestScore - a.bestScore);
  const topKeys = new Set(sorted.slice(0, TOP_K).map(r => r.configKey));
  for (const r of results) {
    if (!topKeys.has(r.configKey)) {
      for (const cat of r.categories) cat.profiles = undefined;
    }
  }

  const best = results.reduce((a, b) => a.bestScore > b.bestScore ? a : b);
  const { slowK: bestSlowK, slowD: bestSlowD } = getStoch(best.params.kLength, best.params.smoothK, best.params.smoothD);
  const lastIdx = closes.length - 1;
  const curK = bestSlowK[lastIdx] != null ? Math.round((bestSlowK[lastIdx] as number) * 100) / 100 : null;
  const curD = bestSlowD[lastIdx] != null ? Math.round((bestSlowD[lastIdx] as number) * 100) / 100 : null;
  const ob = best.params.obThreshold, os = best.params.osThreshold;

  let currentSignal = "—";
  if (opts.kind === "kd_cross" && curK !== null && curD !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    const prevD = lastIdx > 0 ? bestSlowD[lastIdx - 1] : null;
    if (prevK !== null && prevD !== null) {
      if (prevK <= (prevD ?? 0) && curK > curD) currentSignal = "→ Buy (K↑D)";
      else if (prevK >= (prevD ?? 0) && curK < curD) currentSignal = "→ Sell (K↓D)";
      else currentSignal = curK > curD ? "K above D" : "K below D";
    }
  } else if (opts.kind === "k_threshold" && curK !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    if (prevK !== null) {
      if (prevK <= os && curK > os) currentSignal = "→ Buy (K↑OS)";
      else if (prevK >= ob && curK < ob) currentSignal = "→ Sell (K↓OB)";
      else if (curK < os) currentSignal = "In OS zone";
      else if (curK > ob) currentSignal = "In OB zone";
      else currentSignal = "Neutral";
    }
  } else if (opts.kind === "kd_cross_in_zone" && curK !== null && curD !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    const prevD = lastIdx > 0 ? bestSlowD[lastIdx - 1] : null;
    if (prevK !== null && prevD !== null) {
      const crossUp = prevK <= prevD && curK > curD;
      const crossDown = prevK >= prevD && curK < curD;
      if (crossUp && curK < os && curD < os) currentSignal = "→ Buy (K↑D in OS)";
      else if (crossDown && curK > ob && curD > ob) currentSignal = "→ Sell (K↓D in OB)";
      else if (curK < os && curD < os) currentSignal = "OS zone";
      else if (curK > ob && curD > ob) currentSignal = "OB zone";
      else currentSignal = curK > curD ? "K above D" : "K below D";
    }
  }

  return {
    ticker,
    name,
    kind: opts.kind,
    configs: results,
    bestConfigLabel: best.configLabel,
    bestCategory: best.bestCategory,
    bestScore: best.bestScore,
    currentSlowK: curK,
    currentSlowD: curD,
    currentSignal,
  };
}
