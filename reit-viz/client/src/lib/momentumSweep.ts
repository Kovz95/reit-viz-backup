// Momentum optimizer kernel — extracted from MomentumOptimizer.tsx so the
// horizon × revision sweep can run in a Web Worker
// (workers/momentumSweep.worker.ts) with the same function doubling as the
// main-thread fallback. Pure compute: no React, no DOM, no fetching.
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore } from "@/lib/forwardReturns";
import { expandWeeklyToDaily } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { yieldMain } from "@/lib/yieldMain";

export const MOMENTUM_HORIZONS = [
  { days: 21,  label: "1M" },
  { days: 63,  label: "3M" },
  { days: 126, label: "6M" },
  { days: 252, label: "1Y" },
];

export const REVISION_HORIZONS = [
  { days: 21,  label: "1M" },
  { days: 42,  label: "2M" },
  { days: 63,  label: "3M" },
];

export const SIGNAL_CATEGORY_META: Record<string, { label: string; description: string }> = {
  momentum_buy: {
    label: "Momentum Long",
    description: "Strong price momentum + positive estimate revisions → ride the trend",
  },
  momentum_sell: {
    label: "Momentum Short",
    description: "Weak price momentum + negative estimate revisions → short the weakness",
  },
  reversal_buy: {
    label: "Oversold Quality",
    description: "Negative price momentum BUT positive/stable revisions → oversold, fundamentals intact",
  },
  reversal_sell: {
    label: "Overbought Fade",
    description: "Positive price momentum BUT negative revisions → overbought, fundamentals deteriorating",
  },
  oversold_quality: {
    label: "Deep Value",
    description: "Extreme negative momentum + strongly positive revisions → biggest reversal opportunity",
  },
  value_trap: {
    label: "Value Trap",
    description: "Extreme negative momentum + negative revisions → falling knife, avoid",
  },
};

export const MIN_MAGNITUDE = 0.1;
export const MAX_EXPAND = 6;

// ── Helper functions ──

export function computeMomentumReturn(prices: number[], lookback: number): (number | null)[] {
  const out = new Array(prices.length).fill(null);
  for (let i = lookback; i < prices.length; i++) {
    if (prices[i - lookback] > 0) {
      out[i] = (prices[i] - prices[i - lookback]) / prices[i - lookback];
    }
  }
  return out;
}

export function computeRevisionMomentum(revValues: number[], lookback: number): (number | null)[] {
  const out = new Array(revValues.length).fill(null);
  for (let i = lookback; i < revValues.length; i++) {
    const prev = revValues[i - lookback];
    if (Number.isFinite(prev) && Math.abs(prev) >= MIN_MAGNITUDE) {
      out[i] = (revValues[i] - prev) / Math.abs(prev);
    }
  }
  return out;
}

export function computePercentileRank(
  series: (number | null)[],
  atIdx: number,
  window: number
): number | null {
  const start = Math.max(0, atIdx - window + 1);
  const values: number[] = [];
  for (let i = start; i <= atIdx; i++) {
    if (series[i] !== null) values.push(series[i]!);
  }
  if (values.length < 10) return null;
  const cur = series[atIdx];
  if (cur === null) return null;
  return values.filter(v => v < cur).length / values.length;
}

// ── Types ──

export interface MomentumCategoryResult {
  category: string;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

export interface MomentumConfig {
  lookback: number;
  lookbackLabel: string;
  revisionMetric: string;
  revisionLookback: number;
}

export interface MomentumConfigResult {
  config: MomentumConfig;
  categories: MomentumCategoryResult[];
  bestCategory: string;
  bestScore: number;
}

// ── Per-ticker sweep (the loop the page used to run inline) ──

export interface MomentumSweepPayload {
  closes: number[];
  effectivePrices: number[];
  weeklyAgg: any | null;
  resampledData: any;
  actualFreq: string;
  fKey: string;
  hasRevisions: boolean;
  revValues: number[];
  selectedRevMetric: string;
  momThreshold: number;
  revThreshold: number;
  returnMode: string;
  bandMin: number;
  bandMax: number;
  targetReturn: number;
  minHold: number;
}

export interface MomentumSweepResult {
  configs: MomentumConfigResult[];
  bestConfig: MomentumConfigResult;
  currentSignal: string;
}

export async function runMomentumSweep(p: MomentumSweepPayload): Promise<MomentumSweepResult | null> {
  const { closes, effectivePrices, weeklyAgg, resampledData, actualFreq, fKey, hasRevisions, revValues,
    selectedRevMetric, momThreshold, revThreshold, returnMode, bandMin, bandMax, targetReturn, minHold } = p;
  const rawPrices = closes;
  const configResults: MomentumConfigResult[] = [];

  for (const horizonCfg of MOMENTUM_HORIZONS) {
    await yieldMain(); // keep the tab responsive between horizon sweeps
    const horizonDays = fKey === "weekly"
      ? Math.max(1, Math.round(horizonCfg.days / 5))
      : fKey === "monthly"
      ? Math.max(1, Math.round(horizonCfg.days / 21))
      : horizonCfg.days;

    let momSeries: (number | null)[];
    if (actualFreq.endsWith("_on_daily") && weeklyAgg) {
      const weeklyHorizon = Math.max(1, Math.round(horizonCfg.days / (actualFreq === "monthly_on_daily" ? 21 : 5)));
      const weeklyMom = computeMomentumReturn(weeklyAgg.prices, weeklyHorizon);
      // Expand back to daily using weekIndex
      momSeries = (expandWeeklyToDaily as any)(
        weeklyMom.map(v => v === null ? NaN : v),
        weeklyAgg.weekIndex,
        closes.length
      ).map((v: number) => Number.isNaN(v) ? null : v);
    } else {
      momSeries = computeMomentumReturn(effectivePrices, horizonDays);
    }

    const revHorizons = hasRevisions ? REVISION_HORIZONS : [{ days: 63, label: "3M" }];

    for (const revHorizon of revHorizons) {
      const revMom: (number | null)[] | null = hasRevisions
        ? computeRevisionMomentum(revValues, revHorizon.days)
        : null;

      const catAccumulator: Record<string, ForwardReturnProfile[]> = {
        momentum_buy: [], momentum_sell: [], reversal_buy: [],
        reversal_sell: [], oversold_quality: [], value_trap: [],
      };

      let prevCategory: string | null = null;
      const isWeeklyOnDaily = actualFreq.endsWith("_on_daily");
      const onDailyBars = actualFreq === "monthly_on_daily" ? 12 : 52;
      const pctileWindow = fKey === "monthly" ? 12 : isWeeklyOnDaily ? onDailyBars : fKey === "weekly" ? 52 : 252;
      const warmup = Math.max(
        horizonDays + (fKey === "monthly" ? 12 : isWeeklyOnDaily ? onDailyBars : fKey === "weekly" ? 52 : 252),
        fKey === "weekly" ? Math.round(revHorizon.days / 5) : fKey === "monthly" ? Math.max(1, Math.round(revHorizon.days / 21)) : revHorizon.days
      );
      const effectiveLen = isWeeklyOnDaily ? closes.length : effectivePrices.length;

      for (let i = warmup; i < effectiveLen; i++) {
        const momVal = momSeries[i];
        if (momVal === null) continue;
        const pctile = computePercentileRank(momSeries, i, pctileWindow);
        if (pctile === null) continue;

        const dailyIdx = isWeeklyOnDaily ? i : resampledData.dailyIndexMap?.[i];
        let revTrend: "positive" | "negative" | "neutral" = "neutral";
        if (revMom && dailyIdx !== undefined && revMom[dailyIdx] !== null) {
          if (revMom[dailyIdx]! > revThreshold) revTrend = "positive";
          else if (revMom[dailyIdx]! < -revThreshold) revTrend = "negative";
        }

        const isTopQ = pctile >= 1 - momThreshold;
        const isBottomQ = pctile <= momThreshold;
        const isDeepBottom = pctile <= momThreshold / 2;

        let category: string | null = null;
        if (isDeepBottom && revTrend === "positive") category = "oversold_quality";
        else if (isDeepBottom && revTrend === "negative") category = "value_trap";
        else if (isBottomQ && revTrend !== "negative") category = "reversal_buy";
        else if (isTopQ && revTrend === "negative") category = "reversal_sell";
        else if (isTopQ && revTrend !== "negative") category = "momentum_buy";
        else if (isBottomQ && revTrend === "negative") category = "momentum_sell";

        if (category !== null) {
          if (category !== prevCategory) {
            const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(category);
            const dir = isBuy ? "buy" : "sell";
            const bandOpts = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
            const entryIdx = fKey === "weekly" && !isWeeklyOnDaily
              ? (getDailyIndexFromWeekly as any)(i, resampledData)
              : i;
            if (entryIdx < 0) { prevCategory = category; continue; }
            catAccumulator[category].push(
              (computeForwardProfile as any)(rawPrices, entryIdx, targetReturn, dir, bandOpts, minHold)
            );
          }
          prevCategory = category;
        }
      }

      const categoryResults: MomentumCategoryResult[] = [];
      for (const [cat, profiles] of Object.entries(catAccumulator)) {
        const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(cat);
        const dir = isBuy ? "buy" : "sell";
        const isBand = returnMode === "band";
        const summary = summarizeSignals(profiles, dir);
        const composite = computeCompositeScore(summary, dir, isBand);
        categoryResults.push({
          category: cat,
          label: SIGNAL_CATEGORY_META[cat].label,
          description: SIGNAL_CATEGORY_META[cat].description,
          summary,
          composite,
          profiles,
        });
      }

      const bestCat = categoryResults.reduce(
        (a, b) => a.composite.score > b.composite.score ? a : b,
        categoryResults[0]
      );

      configResults.push({
        config: {
          lookback: horizonCfg.days,
          lookbackLabel: horizonCfg.label,
          revisionMetric: selectedRevMetric,
          revisionLookback: revHorizon.days,
        },
        categories: categoryResults,
        bestCategory: bestCat.category,
        bestScore: bestCat.composite.score,
      });
    }
  }

  if (configResults.length === 0) return null;
  const bestConfig = configResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);

  // Determine current signal
  let currentSignal = "None";
  {
    const hDays = bestConfig.config.lookback;
    const hDaysEff = fKey === "weekly" ? Math.max(1, Math.round(hDays / 5)) : fKey === "monthly" ? Math.max(1, Math.round(hDays / 21)) : hDays;
    const isWeeklyOnDailyNow = actualFreq.endsWith("_on_daily");
    let momNow: (number | null)[];
    if (isWeeklyOnDailyNow && weeklyAgg) {
      const weeklyHorizonNow = Math.max(1, Math.round(hDays / (actualFreq === "monthly_on_daily" ? 21 : 5)));
      const weeklyMomNow = computeMomentumReturn(weeklyAgg.prices, weeklyHorizonNow);
      momNow = (expandWeeklyToDaily as any)(
        weeklyMomNow.map(v => v === null ? NaN : v),
        weeklyAgg.weekIndex,
        closes.length
      ).map((v: number) => Number.isNaN(v) ? null : v);
    } else {
      momNow = computeMomentumReturn(effectivePrices, hDaysEff);
    }
    const pctileWindow2 = actualFreq === "monthly_on_daily" || fKey === "monthly" ? 12 : fKey === "weekly" || isWeeklyOnDailyNow ? 52 : 252;
    const lastPctile = computePercentileRank(momNow, momNow.length - 1, pctileWindow2);
    const revNow = hasRevisions ? computeRevisionMomentum(revValues, bestConfig.config.revisionLookback) : null;
    const revIdx = isWeeklyOnDailyNow
      ? closes.length - 1
      : (resampledData.dailyIndexMap?.[resampledData.dailyIndexMap.length - 1]);
    const lastRevVal = revNow && revIdx !== undefined ? revNow[revIdx] : null;

    if (lastPctile !== null) {
      const isTopQ = lastPctile >= 1 - momThreshold;
      const isBottomQ = lastPctile <= momThreshold;
      const isDeepBottom = lastPctile <= momThreshold / 2;
      const revTrend = lastRevVal !== null
        ? (lastRevVal > revThreshold ? "positive" : lastRevVal < -revThreshold ? "negative" : "neutral")
        : "neutral";

      if (isDeepBottom && revTrend === "positive") currentSignal = "Deep Value";
      else if (isDeepBottom && revTrend === "negative") currentSignal = "Value Trap";
      else if (isBottomQ && revTrend !== "negative") currentSignal = "Oversold Quality";
      else if (isTopQ && revTrend === "negative") currentSignal = "Overbought Fade";
      else if (isTopQ && revTrend !== "negative") currentSignal = "Momentum Long";
      else if (isBottomQ && revTrend === "negative") currentSignal = "Momentum Short";
    }
  }

  // Trim profile arrays for non-top configs
  const sortedConfigs = [...configResults].sort((a, b) => b.bestScore - a.bestScore);
  const topSet = new Set(sortedConfigs.slice(0, MAX_EXPAND));
  for (const cfg of configResults) {
    if (!topSet.has(cfg)) {
      for (const cat of cfg.categories) cat.profiles = undefined;
    }
  }
  return { configs: configResults, bestConfig, currentSignal };
}
