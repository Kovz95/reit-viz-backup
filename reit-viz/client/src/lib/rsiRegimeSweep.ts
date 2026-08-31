// RSI Regime optimizer kernel — extracted from RSIRegimeOptimizer.tsx so the
// period × OS/OB sweep can run in a Web Worker
// (workers/rsiRegimeSweep.worker.ts) with the same function doubling as the
// main-thread fallback. Pure compute: no React, no DOM, no fetching.
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore } from "@/lib/forwardReturns";
import { getDailyIndexFromWeekly as getDailyIndexFromWeeklyFn } from "@/lib/getDailyIndexFromWeekly";
import { expandWeeklyToDaily } from "@/lib/weeklyDownsample";
import { yieldMain } from "@/lib/yieldMain";

const getDailyIndexFromWeekly = getDailyIndexFromWeeklyFn as any;

// ── RSI Categories ──

export const RSI_CATEGORIES = {
  oversold: {
    label: "Oversold Zone",
    description: "RSI in oversold territory — historically cheap momentum, potential bounce",
    direction: "buy",
  },
  neutral_low: {
    label: "Neutral Low",
    description: "RSI between oversold and midpoint — recovering from weakness",
    direction: "buy",
  },
  neutral: {
    label: "Neutral",
    description: "RSI in the middle zone — no strong directional signal",
    direction: "buy",
  },
  neutral_high: {
    label: "Neutral High",
    description: "RSI between midpoint and overbought — strong but not extreme",
    direction: "buy",
  },
  overbought: {
    label: "Overbought Zone",
    description: "RSI in overbought territory — potentially overextended, risk of pullback",
    direction: "sell",
  },
  enter_oversold: {
    label: "Enter Oversold",
    description: "RSI crosses below oversold threshold — transition into weakness",
    direction: "buy",
  },
  exit_oversold: {
    label: "Exit Oversold",
    description: "RSI crosses above oversold threshold — recovery signal",
    direction: "buy",
  },
  enter_overbought: {
    label: "Enter Overbought",
    description: "RSI crosses above overbought threshold — momentum peak",
    direction: "sell",
  },
  exit_overbought: {
    label: "Exit Overbought",
    description: "RSI crosses below overbought threshold — momentum fading",
    direction: "sell",
  },
} as const;

export const RSI_PERIODS = [7, 14, 21];
export const OS_LEVELS = [20, 25, 30, 35];
export const OB_LEVELS = [65, 70, 75, 80];

// ── RSI Math ──

export function computeRSI(prices: number[], period: number): (number | null)[] {
  const result = new Array<number | null>(prices.length).fill(null);
  if (prices.length < period + 1) return result;
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
  let avgGain = 0,
    avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) result[period] = 100;
  else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

export function classifyRSIZone(rsi: number, osLevel: number, obLevel: number): string {
  const mid = (osLevel + obLevel) / 2;
  if (rsi <= osLevel) return "oversold";
  if (rsi >= obLevel) return "overbought";
  if (rsi < mid - 5) return "neutral_low";
  if (rsi > mid + 5) return "neutral_high";
  return "neutral";
}

// ── Types ──

export interface RsiCategoryResult {
  category: string;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

export interface RsiConfig {
  config: { rsiPeriod: number; oversoldLevel: number; overboughtLevel: number };
  configLabel: string;
  categories: RsiCategoryResult[];
  bestCategory: string;
  bestScore: number;
}

// ── Per-ticker sweep ──

export interface RsiSweepPayload {
  /** Raw (daily) prices — forward profiles are computed on these. */
  prices: number[];
  computePrices: number[];
  /** weeklyDownsamplePrices result ({ prices, weekIndex }) for *_on_daily modes, else null. */
  weeklyExpanded: any | null;
  /** resampleWeekly result (needs dates/weekIndex fields for getDailyIndexFromWeekly). */
  weekly: any;
  freqForCalc: string;
  freqForResample: string;
  signalMode: string;
  returnMode: string;
  bandMin: number;
  bandMax: number;
  targetReturn: number;
}

export interface RsiSweepResult {
  configs: RsiConfig[];
  bestConfig: RsiConfig;
  currentSignal: string;
  currentRSI: number | null;
}

export async function runRsiRegimeSweep(p: RsiSweepPayload): Promise<RsiSweepResult | null> {
  const { prices, computePrices, weeklyExpanded, weekly, freqForCalc, freqForResample,
    signalMode, returnMode, bandMin, bandMax, targetReturn } = p;
  const rawPrices = prices;
  const configs: RsiConfig[] = [];

  for (const period of RSI_PERIODS) {
    await yieldMain(); // main-thread fallback stays responsive; no-op cost in a worker
    let rsiValues: (number | null)[];
    if (freqForCalc.endsWith("_on_daily") && weeklyExpanded) {
      const wRsi = computeRSI((weeklyExpanded as any).prices as number[], period);
      rsiValues = expandWeeklyToDaily(
        wRsi.map((v: number | null) => (v === null ? NaN : v)),
        (weeklyExpanded as any).weekIndex,
        prices.length
      ).map((v: number) => (Number.isNaN(v) ? null : v));
    } else {
      rsiValues = computeRSI(computePrices, period);
    }

    const isWeeklyOnDaily = freqForCalc.endsWith("_on_daily");
    const workLen = isWeeklyOnDaily ? prices.length : computePrices.length;

    if (signalMode === "zone") {
      for (const osLevel of OS_LEVELS) {
        for (const obLevel of OB_LEVELS) {
          if (osLevel >= obLevel) continue;
          const zoneBuckets: Record<string, ForwardReturnProfile[]> = {
            oversold: [],
            neutral_low: [],
            neutral: [],
            neutral_high: [],
            overbought: [],
          };
          let prevZone: string | null = null;
          const startIdx = period + 126;
          for (let n = startIdx; n < workLen; n++) {
            if (rsiValues[n] === null) continue;
            const zone = classifyRSIZone(rsiValues[n]!, osLevel, obLevel);
            if (prevZone === null) {
              prevZone = zone;
              continue;
            }
            if (zone !== prevZone) {
              const dir = RSI_CATEGORIES[zone as keyof typeof RSI_CATEGORIES].direction;
              const band =
                returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
              const dailyIdx =
                (freqForResample === "weekly" || freqForResample === "monthly") && !isWeeklyOnDaily
                  ? getDailyIndexFromWeekly(n, weekly)
                  : n;
              if (dailyIdx < 0) {
                prevZone = zone;
                continue;
              }
              const profile = (computeForwardProfile as any)(
                rawPrices,
                dailyIdx,
                targetReturn,
                dir,
                band
              );
              zoneBuckets[zone].push(profile);
            }
            prevZone = zone;
          }

          const categoryResults: RsiCategoryResult[] = [];
          for (const [catKey, profiles] of Object.entries(zoneBuckets)) {
            const catDef =
              RSI_CATEGORIES[catKey as keyof typeof RSI_CATEGORIES];
            const dir = catDef.direction;
            const useBand = returnMode === "band";
            const summary = summarizeSignals(profiles, dir);
            const composite = computeCompositeScore(summary, dir, useBand);
            categoryResults.push({
              category: catKey,
              label: catDef.label,
              description: catDef.description,
              summary,
              composite,
              profiles,
            });
          }
          const bestCat = categoryResults.reduce(
            (a, b) => (a.composite.score > b.composite.score ? a : b),
            categoryResults[0]
          );
          configs.push({
            config: { rsiPeriod: period, oversoldLevel: osLevel, overboughtLevel: obLevel },
            configLabel: `RSI(${period}) ${osLevel}/${obLevel}`,
            categories: categoryResults,
            bestCategory: bestCat.category,
            bestScore: bestCat.composite.score,
          });
        }
      }
    } else {
      // transition mode
      for (const osLevel of OS_LEVELS) {
        for (const obLevel of OB_LEVELS) {
          if (osLevel >= obLevel) continue;
          const transitionBuckets: Record<string, ForwardReturnProfile[]> = {
            enter_oversold: [],
            exit_oversold: [],
            enter_overbought: [],
            exit_overbought: [],
          };
          const startIdx = period + 126;
          for (let n = startIdx + 1; n < workLen; n++) {
            if (rsiValues[n] === null || rsiValues[n - 1] === null) continue;
            const cur = rsiValues[n]!;
            const prev = rsiValues[n - 1]!;
            const fired: string[] = [];
            if (cur <= osLevel && prev > osLevel) fired.push("enter_oversold");
            if (cur > osLevel && prev <= osLevel) fired.push("exit_oversold");
            if (cur >= obLevel && prev < obLevel) fired.push("enter_overbought");
            if (cur < obLevel && prev >= obLevel) fired.push("exit_overbought");
            const band =
              returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
            for (const key of fired) {
              const dir =
                RSI_CATEGORIES[key as keyof typeof RSI_CATEGORIES].direction;
              const dailyIdx =
                (freqForResample === "weekly" || freqForResample === "monthly") && !isWeeklyOnDaily
                  ? getDailyIndexFromWeekly(n, weekly)
                  : n;
              if (dailyIdx < 0) continue;
              transitionBuckets[key].push(
                (computeForwardProfile as any)(rawPrices, dailyIdx, targetReturn, dir, band)
              );
            }
          }

          const categoryResults: RsiCategoryResult[] = [];
          for (const [catKey, profiles] of Object.entries(transitionBuckets)) {
            const catDef =
              RSI_CATEGORIES[catKey as keyof typeof RSI_CATEGORIES];
            const dir = catDef.direction;
            const useBand = returnMode === "band";
            const summary = summarizeSignals(profiles, dir);
            const composite = computeCompositeScore(summary, dir, useBand);
            categoryResults.push({
              category: catKey,
              label: catDef.label,
              description: catDef.description,
              summary,
              composite,
              profiles,
            });
          }
          const bestCat = categoryResults.reduce(
            (a, b) => (a.composite.score > b.composite.score ? a : b),
            categoryResults[0]
          );
          configs.push({
            config: { rsiPeriod: period, oversoldLevel: osLevel, overboughtLevel: obLevel },
            configLabel: `RSI(${period}) ${osLevel}/${obLevel}`,
            categories: categoryResults,
            bestCategory: bestCat.category,
            bestScore: bestCat.composite.score,
          });
        }
      }
    }
  }

  if (configs.length === 0) return null;

  const bestConfig = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
  const currentRsiArr =
    freqForCalc.endsWith("_on_daily") && weeklyExpanded
      ? (() => {
          const wRsi = computeRSI(weeklyExpanded as number[], bestConfig.config.rsiPeriod);
          return expandWeeklyToDaily(
            wRsi.map((v: number | null) => (v === null ? NaN : v)),
            (weeklyExpanded as any).weekIndex,
            prices.length
          ).map((v: number) => (Number.isNaN(v) ? null : v));
        })()
      : computeRSI(computePrices, bestConfig.config.rsiPeriod);

  const lastRsi = currentRsiArr[currentRsiArr.length - 1];
  let currentSignal = "None";
  if (lastRsi !== null) {
    const zone = classifyRSIZone(
      lastRsi,
      bestConfig.config.oversoldLevel,
      bestConfig.config.overboughtLevel
    );
    currentSignal = RSI_CATEGORIES[zone as keyof typeof RSI_CATEGORIES].label;
    const prevRsi = currentRsiArr[currentRsiArr.length - 2];
    if (prevRsi !== null) {
      const os = bestConfig.config.oversoldLevel;
      const ob = bestConfig.config.overboughtLevel;
      if (lastRsi <= os && prevRsi > os) currentSignal = "→ Oversold";
      else if (lastRsi > os && prevRsi <= os) currentSignal = "← Oversold";
      else if (lastRsi >= ob && prevRsi < ob) currentSignal = "→ Overbought";
      else if (lastRsi < ob && prevRsi >= ob) currentSignal = "← Overbought";
    }
  }

  // Keep profiles only for top 6 configs
  const TOP_CONFIGS = 6;
  const topSet = new Set(
    [...configs].sort((a, b) => b.bestScore - a.bestScore).slice(0, TOP_CONFIGS)
  );
  for (const cfg of configs) {
    if (!topSet.has(cfg)) {
      for (const cat of cfg.categories) cat.profiles = undefined;
    }
  }

  return {
    configs,
    bestConfig,
    currentSignal,
    currentRSI: lastRsi !== null ? Math.round(lastRsi * 10) / 10 : null,
  };
}
