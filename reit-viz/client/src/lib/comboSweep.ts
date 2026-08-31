// Combo optimizer kernel — extracted from ComboOptimizer.tsx so the
// trigger × filters² sweep can run in a Web Worker
// (workers/comboSweep.worker.ts) with the same function doubling as the
// main-thread fallback. Pure compute: no React, no DOM, no fetching.
import { summarizeSignals, computeForwardProfile, pickBestByRankMode } from "@/lib/forwardReturns";
import { computeROC as rocComputeROC } from "@/lib/rocSignalDetect";
import { weeklyDownsamplePrices as weeklyDownsamplePricesFn, expandWeeklyToDaily as expandWeeklyToDailyFn } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly as getDailyIndexFromWeeklyFn } from "@/lib/getDailyIndexFromWeekly";
import { yieldMain } from "@/lib/yieldMain";

const getDailyIndexFromWeekly = getDailyIndexFromWeeklyFn as any;

// These three were "Unresolved" reconstruction stubs — clipArraysByDateRange
// returned EMPTY arrays, which reduced every run to zero bars (silent "no
// results"); rocSignalDetect returned [] (dead ROC triggers); compareSummaries
// returned 0 (no ranking). Now real implementations.
export const rocSignalDetect = ((prices: number[], period: number) =>
  rocComputeROC(prices, period)) as any;
export const compareSummaries = ((
  summaryA: any, scoreA: number, summaryB: any, scoreB: number,
  direction: any, weights: any,
) =>
  (pickBestByRankMode as any)(summaryB, scoreB, direction, weights) -
  (pickBestByRankMode as any)(summaryA, scoreA, direction, weights)) as any;

// ── Types ──

/** A trigger event — price-cross or momentum crossover that generates signal indices */
export interface TriggerDef {
  kind: string;
  label: string;
  direction: "buy" | "sell";
  fastPeriod?: number;
  slowPeriod?: number;
  maPeriod?: number;
  rocPeriod?: number;
  threshold?: number;
}

/** A filter condition — AND-conjoined on top of a trigger */
export interface FilterDef {
  kind: string;
  label: string;
  period?: number;
  threshold?: number;
  bandLow?: number;
  bandHigh?: number;
  slopeLookback?: number;
}

/** Precomputed indicator cache for a price series */
export interface IndicatorCache {
  rsi14: (number | null)[];
  rocByPeriod: Map<number, number[]>;
  smaByPeriod: Map<number, (number | null)[]>;
  slopeByPeriod: Map<number, (number | null)[]>;
}

export interface ComboEntry {
  triggerLabel: string;
  triggerKind: string;
  direction: "buy" | "sell";
  filterLabels: string[];
  summary: any;
  baselineHitRate: number;
  baselineCount: number;
  signalIndices: number[];
  profiles: any[];
}

// ── Local helpers ──
// ─── Local helpers ───────────────────────────────────────────────────────────

/** Simple moving average */
export function computeSMA(prices: number[], period: number): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** Wilder RSI(14) */
export function computeRSI14(prices: number[]): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  if (prices.length < 15) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= 14;
  avgLoss /= 14;
  result[14] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = 15; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    result[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/** ROC-of-MA slope: 5-bar change of MA */
export function computeMASlope(ma: (number | null)[], slopeLookback: number): (number | null)[] {
  const result = new Array(ma.length).fill(null);
  for (let i = slopeLookback; i < ma.length; i++) {
    const cur = ma[i];
    const prev = ma[i - slopeLookback];
    if (cur !== null && prev !== null && prev !== 0) {
      result[i] = cur / prev - 1;
    }
  }
  return result;
}

/** Build all trigger definitions */
export function buildTriggers(): TriggerDef[] {
  const triggers: TriggerDef[] = [];
  for (const [fast, slow] of [[10, 50], [20, 50], [50, 200]] as [number, number][]) {
    triggers.push({ kind: "golden_cross", label: `Golden ${fast}/${slow}`, direction: "buy", fastPeriod: fast, slowPeriod: slow });
    triggers.push({ kind: "death_cross",  label: `Death ${fast}/${slow}`,  direction: "sell", fastPeriod: fast, slowPeriod: slow });
  }
  for (const period of [20, 50, 200]) {
    triggers.push({ kind: "price_above", label: `Px↑MA${period}`, direction: "buy",  maPeriod: period });
    triggers.push({ kind: "price_below", label: `Px↓MA${period}`, direction: "sell", maPeriod: period });
  }
  for (const period of [20, 50, 200]) {
    triggers.push({ kind: "roc_above_thresh", label: `ROC(${period})↑+5%`, direction: "buy",  rocPeriod: period, threshold: 0.05 });
    triggers.push({ kind: "roc_below_thresh", label: `ROC(${period})↓-5%`, direction: "sell", rocPeriod: period, threshold: 0.05 });
    triggers.push({ kind: "roc_zero_up",      label: `ROC(${period})↑0`,   direction: "buy",  rocPeriod: period });
    triggers.push({ kind: "roc_zero_down",    label: `ROC(${period})↓0`,   direction: "sell", rocPeriod: period });
  }
  triggers.push({ kind: "rsi_cross_up_lo",   label: "RSI(14)↑30", direction: "buy" });
  triggers.push({ kind: "rsi_cross_down_hi", label: "RSI(14)↓70", direction: "sell" });
  return triggers;
}

/** Build all filter definitions */
export function buildFilters(): FilterDef[] {
  const filters: FilterDef[] = [];
  for (const period of [20, 50]) {
    filters.push({ kind: "roc_above", label: `ROC(${period})>+5%`,  period, threshold: 0.05 });
    filters.push({ kind: "roc_above", label: `ROC(${period})>+10%`, period, threshold: 0.10 });
    filters.push({ kind: "roc_below", label: `ROC(${period})<-5%`,  period, threshold: 0.05 });
    filters.push({ kind: "roc_below", label: `ROC(${period})<-10%`, period, threshold: 0.10 });
  }
  filters.push({ kind: "rsi_below", label: "RSI<30", threshold: 30 });
  filters.push({ kind: "rsi_below", label: "RSI<40", threshold: 40 });
  filters.push({ kind: "rsi_above", label: "RSI>60", threshold: 60 });
  filters.push({ kind: "rsi_above", label: "RSI>70", threshold: 70 });
  filters.push({ kind: "rsi_band",  label: "RSI∈[40,60]", bandLow: 40, bandHigh: 60 });
  for (const period of [50, 200]) {
    filters.push({ kind: "price_above_ma", label: `Px>MA${period}`, period });
    filters.push({ kind: "price_below_ma", label: `Px<MA${period}`, period });
  }
  for (const period of [50, 200]) {
    filters.push({ kind: "ma_slope_up",   label: `MA${period}↗`, period, slopeLookback: 5 });
    filters.push({ kind: "ma_slope_down", label: `MA${period}↘`, period, slopeLookback: 5 });
  }
  return filters;
}

/** Precompute all indicators for a price series */
export function computeIndicators(prices: number[]): IndicatorCache {
  const rsi14 = computeRSI14(prices);
  const rocByPeriod = new Map<number, number[]>();
  for (const period of [20, 50, 200]) {
    rocByPeriod.set(period, rocSignalDetect(prices, period));
  }
  const smaByPeriod = new Map<number, (number | null)[]>();
  for (const period of [10, 20, 50, 200]) {
    smaByPeriod.set(period, computeSMA(prices, period));
  }
  const slopeByPeriod = new Map<number, (number | null)[]>();
  for (const period of [50, 200]) {
    slopeByPeriod.set(period, computeMASlope(smaByPeriod.get(period)!, 5));
  }
  return { rsi14, rocByPeriod, smaByPeriod, slopeByPeriod };
}

/** Detect all signal indices for a trigger definition */
export function detectTriggerSignals(trigger: TriggerDef, prices: number[], cache: IndicatorCache): number[] {
  const indices: number[] = [];
  switch (trigger.kind) {
    case "golden_cross":
    case "death_cross": {
      const fast = cache.smaByPeriod.get(trigger.fastPeriod!) ?? computeSMA(prices, trigger.fastPeriod!);
      const slow = cache.smaByPeriod.get(trigger.slowPeriod!) ?? computeSMA(prices, trigger.slowPeriod!);
      if (!cache.smaByPeriod.has(trigger.fastPeriod!)) cache.smaByPeriod.set(trigger.fastPeriod!, fast);
      if (!cache.smaByPeriod.has(trigger.slowPeriod!)) cache.smaByPeriod.set(trigger.slowPeriod!, slow);
      for (let i = 1; i < prices.length; i++) {
        if (fast[i] === null || slow[i] === null || fast[i-1] === null || slow[i-1] === null) continue;
        const above = fast[i]! > slow[i]!;
        const prevAbove = fast[i-1]! > slow[i-1]!;
        if (trigger.kind === "golden_cross" && above && !prevAbove) indices.push(i);
        if (trigger.kind === "death_cross"  && !above && prevAbove) indices.push(i);
      }
      break;
    }
    case "price_above":
    case "price_below": {
      const ma = cache.smaByPeriod.get(trigger.maPeriod!) ?? computeSMA(prices, trigger.maPeriod!);
      if (!cache.smaByPeriod.has(trigger.maPeriod!)) cache.smaByPeriod.set(trigger.maPeriod!, ma);
      for (let i = 1; i < prices.length; i++) {
        if (ma[i] === null || ma[i-1] === null) continue;
        const above = prices[i] > ma[i]!;
        const prevAbove = prices[i-1] > ma[i-1]!;
        if (trigger.kind === "price_above" && above && !prevAbove) indices.push(i);
        if (trigger.kind === "price_below" && !above && prevAbove) indices.push(i);
      }
      break;
    }
    case "roc_above_thresh":
    case "roc_below_thresh": {
      const roc = cache.rocByPeriod.get(trigger.rocPeriod!) ?? rocSignalDetect(prices, trigger.rocPeriod!);
      if (!cache.rocByPeriod.has(trigger.rocPeriod!)) cache.rocByPeriod.set(trigger.rocPeriod!, roc);
      const thresh = trigger.threshold!;
      for (let i = 1; i < prices.length; i++) {
        if (!Number.isFinite(roc[i]) || !Number.isFinite(roc[i-1])) continue;
        if (trigger.kind === "roc_above_thresh" && roc[i-1] <= thresh  && roc[i] > thresh)  indices.push(i);
        if (trigger.kind === "roc_below_thresh" && roc[i-1] >= -thresh && roc[i] < -thresh) indices.push(i);
      }
      break;
    }
    case "roc_zero_up":
    case "roc_zero_down": {
      const roc = cache.rocByPeriod.get(trigger.rocPeriod!) ?? rocSignalDetect(prices, trigger.rocPeriod!);
      if (!cache.rocByPeriod.has(trigger.rocPeriod!)) cache.rocByPeriod.set(trigger.rocPeriod!, roc);
      for (let i = 1; i < prices.length; i++) {
        if (!Number.isFinite(roc[i]) || !Number.isFinite(roc[i-1])) continue;
        if (trigger.kind === "roc_zero_up"   && roc[i-1] <= 0 && roc[i] > 0) indices.push(i);
        if (trigger.kind === "roc_zero_down" && roc[i-1] >= 0 && roc[i] < 0) indices.push(i);
      }
      break;
    }
    case "rsi_cross_up_lo":
    case "rsi_cross_down_hi": {
      const rsi = cache.rsi14;
      for (let i = 1; i < rsi.length; i++) {
        const cur = rsi[i], prev = rsi[i-1];
        if (cur === null || prev === null) continue;
        if (trigger.kind === "rsi_cross_up_lo"   && prev <= 30 && cur > 30) indices.push(i);
        if (trigger.kind === "rsi_cross_down_hi" && prev >= 70 && cur < 70) indices.push(i);
      }
      break;
    }
  }
  return indices;
}

/** Evaluate a filter condition at a given signal index */
export function evalFilterCondition(
  filter: FilterDef,
  idx: number,
  prices: number[],
  cache: IndicatorCache
): boolean | null {
  switch (filter.kind) {
    case "roc_above": {
      const roc = cache.rocByPeriod.get(filter.period!);
      if (!roc) return null;
      return Number.isFinite(roc[idx]) ? roc[idx] > filter.threshold! : null;
    }
    case "roc_below": {
      const roc = cache.rocByPeriod.get(filter.period!);
      if (!roc) return null;
      return Number.isFinite(roc[idx]) ? roc[idx] < -filter.threshold! : null;
    }
    case "rsi_below": {
      const v = cache.rsi14[idx];
      return v === null ? null : v < filter.threshold!;
    }
    case "rsi_above": {
      const v = cache.rsi14[idx];
      return v === null ? null : v > filter.threshold!;
    }
    case "rsi_band": {
      const v = cache.rsi14[idx];
      return v === null ? null : v >= filter.bandLow! && v <= filter.bandHigh!;
    }
    case "price_above_ma": {
      const ma = cache.smaByPeriod.get(filter.period!);
      if (!ma || ma[idx] === null) return null;
      return prices[idx] > ma[idx]!;
    }
    case "price_below_ma": {
      const ma = cache.smaByPeriod.get(filter.period!);
      if (!ma || ma[idx] === null) return null;
      return prices[idx] < ma[idx]!;
    }
    case "ma_slope_up": {
      const slope = cache.slopeByPeriod.get(filter.period!);
      if (!slope || slope[idx] === null) return null;
      return slope[idx]! > 0;
    }
    case "ma_slope_down": {
      const slope = cache.slopeByPeriod.get(filter.period!);
      if (!slope || slope[idx] === null) return null;
      return slope[idx]! < 0;
    }
  }
  return null;
}

// ── Per-ticker sweep (the block the page used to run inline) ──

export interface ComboSweepPayload {
  frequency: string;
  resampleMode: string;
  rawPrices: number[] | null;
  prices: number[];
  dates: string[];
  resampledResult: any;
  direction: string;
  allTriggers: TriggerDef[];
  allFilters: FilterDef[];
  minSignals: number;
  maxFilters: number;
  minLift: number;
  topN: number;
  horizon: string;
  targetReturn: number;
  minHold: number;
  scoreWeights: any;
}

export interface ComboSweepResult {
  topCombos: ComboEntry[];
  bestHitRate: number;
  totalTriggerCount: number;
}

export async function runComboSweep(p: ComboSweepPayload): Promise<ComboSweepResult | null> {
  const { frequency, resampleMode, rawPrices, prices, dates, resampledResult, direction,
    allTriggers, allFilters, minSignals, maxFilters, minLift, topN, horizon,
    targetReturn, minHold, scoreWeights } = p;
    // Compute indicator cache — for weekly_on_daily, compute on weekly-expanded version
    let indCache: IndicatorCache;
    if ((frequency as string).endsWith("_on_daily") && rawPrices !== null) {
      // weeklyDownsamplePrices, NOT weeklyDownsample: this call needs the
      // { prices, weekIndex } price-series shape, not OHLCV buckets.
      const weeklyResult = weeklyDownsamplePricesFn(rawPrices, dates, (frequency as string) === "monthly_on_daily" ? "monthly" : undefined) as any;
      const n = rawPrices.length;
      const weeklyCache = computeIndicators(weeklyResult.prices);
      const expandToDaily = (arr: (number | null)[]): (number | null)[] => {
        const filled = arr.map((v: number | null) => v === null ? NaN : v);
        return expandWeeklyToDailyFn(filled, weeklyResult.weekIndex, n).map((v: number) => Number.isFinite(v) ? v : null);
      };
      const expandToDailyRaw = (arr: number[]): number[] =>
        expandWeeklyToDailyFn(arr, weeklyResult.weekIndex, n);
      const expandedRsi = expandToDaily(weeklyCache.rsi14);
      const expandedRoc = new Map<number, number[]>();
      Array.from(weeklyCache.rocByPeriod.entries()).forEach(([p, arr]) => expandedRoc.set(p, expandToDailyRaw(arr)));
      const expandedSma = new Map<number, (number | null)[]>();
      Array.from(weeklyCache.smaByPeriod.entries()).forEach(([p, arr]) => expandedSma.set(p, expandToDaily(arr)));
      const expandedSlope = new Map<number, (number | null)[]>();
      Array.from(weeklyCache.slopeByPeriod.entries()).forEach(([p, arr]) => expandedSlope.set(p, expandToDaily(arr)));
      indCache = { rsi14: expandedRsi, rocByPeriod: expandedRoc, smaByPeriod: expandedSma, slopeByPeriod: expandedSlope };
    } else {
      indCache = computeIndicators(prices);
    }

    const activeTriggers = allTriggers.filter(tr => direction === "both" ? true : tr.direction === direction);
    const combos: ComboEntry[] = [];
    let totalTriggerCount = 0;

    // Helper: compute forward return profiles then summarize
    const getProfile = (sigIdx: number, dir: "buy" | "sell") => {
      if ((resampleMode === "weekly" || resampleMode === "monthly") && resampledResult !== null && rawPrices !== null) {
        const dailyIdx = getDailyIndexFromWeekly(sigIdx, resampledResult);
        if (dailyIdx < 0) return null;
        return (computeForwardProfile as any)(rawPrices, dailyIdx, targetReturn, dir, null, minHold);
      }
      return (computeForwardProfile as any)(rawPrices !== null ? rawPrices : prices, sigIdx, targetReturn, dir, null, minHold);
    };

    for (const trigger of activeTriggers) {
      await yieldMain(); // keep the tab responsive between trigger sweeps
      const signalIndices = detectTriggerSignals(trigger, prices, indCache);
      if (signalIndices.length === 0) continue;
      totalTriggerCount += signalIndices.length;

      const evalCombo = (indices: number[], filterLabels: string[]): ComboEntry | null => {
        if (indices.length < minSignals) return null;
        const profiles = indices
          .map(i => getProfile(i, trigger.direction === "buy" ? "buy" : "sell"))
          .filter(p => p !== null && p.returns[horizon] !== null);
        if (profiles.length < minSignals) return null;
        const summary = summarizeSignals(profiles, trigger.direction === "buy" ? "buy" : "sell");
        return {
          triggerLabel: trigger.label,
          triggerKind: trigger.kind,
          direction: trigger.direction,
          filterLabels,
          summary,
          baselineHitRate: 0, // filled below
          baselineCount: 0,
          signalIndices: indices,
          profiles,
        };
      };

      // Baseline (no filters)
      const baseEntry = evalCombo(signalIndices, []);
      const baseHitRate  = baseEntry ? baseEntry.summary.hitRate[horizon] ?? 0 : 0;
      const baseCount    = baseEntry ? baseEntry.summary.count : 0;

      if (baseEntry) {
        baseEntry.baselineHitRate = baseHitRate;
        baseEntry.baselineCount   = baseCount;
        combos.push(baseEntry);
      }

      // 1-filter combos
      if (maxFilters >= 1) {
        for (let fi = 0; fi < allFilters.length; fi++) {
          const filt = allFilters[fi];
          const filtered1 = signalIndices.filter(i => evalFilterCondition(filt, i, prices, indCache) === true);
          const entry1 = evalCombo(filtered1, [filt.label]);
          if (entry1) { entry1.baselineHitRate = baseHitRate; entry1.baselineCount = baseCount; combos.push(entry1); }
        }
      }

      // 2-filter combos
      if (maxFilters >= 2) {
        for (let fi = 0; fi < allFilters.length; fi++) {
          const filt1 = allFilters[fi];
          const filtered1 = signalIndices.filter(i => evalFilterCondition(filt1, i, prices, indCache) === true);
          if (filtered1.length < minSignals) continue;
          await yieldMain(); // filters² block — yield once per outer filter
          for (let fj = fi + 1; fj < allFilters.length; fj++) {
            const filt2 = allFilters[fj];
            const filtered2 = filtered1.filter(i => evalFilterCondition(filt2, i, prices, indCache) === true);
            const entry2 = evalCombo(filtered2, [filt1.label, filt2.label]);
            if (entry2) { entry2.baselineHitRate = baseHitRate; entry2.baselineCount = baseCount; combos.push(entry2); }
          }
        }
      }
    }

    if (combos.length === 0) return null;

    const minLiftFraction = minLift / 100;
    const qualified = combos.filter(c =>
      c.filterLabels.length === 0
        ? true
        : (c.summary.hitRate[horizon] ?? 0) - c.baselineHitRate >= minLiftFraction
    );
    qualified.sort((a, b) => compareSummaries(a.summary, 0, b.summary, 0, a.direction, scoreWeights));
    const topCombos = qualified.slice(0, topN);
    const bestHitRate = topCombos.length > 0 ? (pickBestByRankMode as any)(topCombos[0].summary, 0, topCombos[0].direction, scoreWeights) : 0;
  return { topCombos, bestHitRate, totalTriggerCount };
}
