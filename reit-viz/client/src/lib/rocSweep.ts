// ROC optimizer kernel — extracted from ROCOptimizer.tsx so the config sweep
// can run in a Web Worker (workers/rocSweep.worker.ts) with the same function
// doubling as the main-thread fallback. Pure compute: no React, no fetching.
import { computeROC, ROC_SIGNAL_HANDLERS, detectSignals, SIGNAL_META } from "@/lib/rocSignalDetect";
import { computeForwardProfile, summarizeSignals, computeCompositeScore, pctSigned } from "@/lib/forwardReturns";
import { mapWeeklyIndexToDaily } from "@/lib/weeklyDownsample";
import { yieldMain } from "@/lib/yieldMain";

export const ZERO_CROSS_PERIODS = [5, 10, 14, 20, 30, 50, 100, 200];
export const FAST_SLOW_PAIRS: [number, number][] = [
  [5, 20],
  [10, 30],
  [10, 50],
  [14, 50],
  [20, 50],
  [20, 100],
  [50, 100],
  [50, 200],
];
export const THRESHOLD_VALUES = [0.02, 0.05, 0.1];
export const SLOPE_LOOKBACKS = [3, 5, 10];

// ── Types ──

export interface RocConfig {
  signalType: string;
  period: number;
  slowPeriod?: number;
  threshold?: number;
  slopeLookback?: number;
}

export interface SignalDate {
  date: string;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
}

export interface CategoryResult {
  category: string;
  label: string;
  description: string;
  summary: any;
  composite: any;
  signalDates?: SignalDate[];
  profiles?: any[];
}

export interface ConfigResult {
  config: RocConfig;
  configLabel: string;
  categories: CategoryResult[];
  bestCategory: string;
  bestScore: number;
}


export function buildConfigLabel(cfg: RocConfig): string {
  switch (cfg.signalType) {
    case "zero_cross":
      return `ROC(${cfg.period}) cross 0`;
    case "threshold_cross":
      return `ROC(${cfg.period}) cross ±${pctSigned(cfg.threshold ?? 0.05)}`;
    case "threshold_reversion":
      return `ROC(${cfg.period}) ±${pctSigned(cfg.threshold ?? 0.05)} reversion`;
    case "fast_slow_cross":
      return `ROC fast=${cfg.period} vs slow=${cfg.slowPeriod ?? 0}`;
    case "slope_curvature":
      return `ROC(${cfg.period}) slope/curv lkb=${cfg.slopeLookback ?? 5}`;
    default:
      return `ROC(${cfg.period})`;
  }
}

export function mapWeeklyToDaily(
  period: number,
  weeklyValues: number[],
  weekIndex: number[],
  dailyLength: number
): number[] {
  const v = computeROC(weeklyValues, period);
  const out = new Array(dailyLength).fill(NaN);
  let c = -1;
  for (let i = 0; i < dailyLength; i++) {
    while (c + 1 < weekIndex.length && weekIndex[c + 1] <= i) c++;
    if (c >= 0 && Number.isFinite(v[c])) out[i] = v[c];
  }
  return out;
}

// ── Per-ticker sweep (the block the page used to run inline) ──

export interface RocSweepPayload {
  workingCloses: number[];
  workingDates: string[];
  rawCloses: number[];
  downsampled: any;
  weeklyData: { prices: number[]; weekIndex: number[] } | null;
  benchmarkSeries: number[] | null;
  effectiveFreq: string;
  frequency: string;
  barMultiplier: number;
  signalType: string;
  returnMode: string;
  bandMin: number;
  bandMax: number;
  targetReturn: number;
  minHold: number;
}

export interface RocSweepResult {
  configs: ConfigResult[];
  bestCategoryKey: string;
  bestScore: number;
  currentSignal: string;
  currentROCByPeriod: Record<number, number>;
  currentSlowROCByPeriod: Record<number, number>;
}

export async function runRocSweep(pl: RocSweepPayload): Promise<RocSweepResult | null> {
  const { workingCloses, workingDates, rawCloses, downsampled, weeklyData, benchmarkSeries,
    effectiveFreq, frequency, barMultiplier, signalType, returnMode, bandMin, bandMax,
    targetReturn, minHold } = pl;
    const configsForType: {
      cfg: RocConfig;
      startIdx: number;
      opts: any;
    }[] = [];

    const startIdxCalc = (p: number) =>
      frequency.endsWith("_on_daily")
        ? Math.max(p * (frequency === "monthly_on_daily" ? 21 : 5), 21) + 126
        : effectiveFreq === "weekly" || frequency === "weekly" || effectiveFreq === "monthly"
        ? p + Math.ceil(126 / barMultiplier)
        : p + 126;

    if (signalType === "zero_cross") {
      for (const p of ZERO_CROSS_PERIODS)
        configsForType.push({
          cfg: { signalType: "zero_cross", period: p },
          startIdx: startIdxCalc(p),
          opts: { period: p },
        });
    } else if (signalType === "threshold_cross") {
      for (const p of ZERO_CROSS_PERIODS)
        for (const t of THRESHOLD_VALUES)
          configsForType.push({
            cfg: { signalType: "threshold_cross", period: p, threshold: t },
            startIdx: startIdxCalc(p),
            opts: { period: p, threshold: t },
          });
    } else if (signalType === "threshold_reversion") {
      for (const p of ZERO_CROSS_PERIODS)
        for (const t of THRESHOLD_VALUES)
          configsForType.push({
            cfg: { signalType: "threshold_reversion", period: p, threshold: t },
            startIdx: startIdxCalc(p),
            opts: { period: p, threshold: t },
          });
    } else if (signalType === "fast_slow_cross") {
      for (const [f, s] of FAST_SLOW_PAIRS)
        configsForType.push({
          cfg: { signalType: "fast_slow_cross", period: f, slowPeriod: s },
          startIdx: startIdxCalc(Math.max(f, s)),
          opts: { period: f, slowPeriod: s },
        });
    } else {
      for (const p of ZERO_CROSS_PERIODS)
        for (const slb of SLOPE_LOOKBACKS)
          configsForType.push({
            cfg: { signalType: "slope_curvature", period: p, slopeLookback: slb },
            startIdx: startIdxCalc(p + slb),
            opts: { period: p, slopeLookback: slb },
          });
    }

    const allConfigs: ConfigResult[] = [];

    for (const { cfg, startIdx, opts } of configsForType) {
      if (workingCloses.length <= startIdx + 5) continue;
      await yieldMain(); // main-thread fallback stays responsive; no-op cost in a worker
      const optsWithPrecomputed = { ...opts } as any;
      if (frequency.endsWith("_on_daily") && weeklyData) {
        optsWithPrecomputed.precomputedROC = mapWeeklyToDaily(
          opts.period,
          weeklyData.prices,
          weeklyData.weekIndex,
          workingCloses.length
        );
        if (opts.slowPeriod !== undefined) {
          optsWithPrecomputed.precomputedSlowROC = mapWeeklyToDaily(
            opts.slowPeriod,
            weeklyData.prices,
            weeklyData.weekIndex,
            workingCloses.length
          );
        }
      }

      const handler = ROC_SIGNAL_HANDLERS[signalType];
      const detected = detectSignals(workingCloses, handler, optsWithPrecomputed, startIdx);
      const bandOpts =
        returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
      const categoryResults: CategoryResult[] = [];
      let totalSignalCount = 0;

      for (const cat of handler) {
        const catMeta = SIGNAL_META[cat];
        const direction: "buy" | "sell" = catMeta?.direction === "sell" ? "sell" : "buy";
        const profiles: any[] = [];
        const signalDates: SignalDate[] = [];
        let lastSignalIdx = -1;

        for (const sigIdx of detected[cat]) {
          if (minHold > 0 && lastSignalIdx >= 0 && sigIdx < lastSignalIdx + minHold) continue;
          const dailyIdx =
            effectiveFreq === "weekly"
              ? mapWeeklyIndexToDaily(downsampled, sigIdx)
              : sigIdx;
          if (dailyIdx < 0) continue;
          const profile = computeForwardProfile(
            (effectiveFreq === "weekly" || effectiveFreq === "monthly") ? rawCloses : workingCloses,
            dailyIdx,
            targetReturn,
            direction,
            bandOpts,
            minHold,
            (effectiveFreq === "weekly" || effectiveFreq === "monthly") ? null : benchmarkSeries
          );
          profiles.push(profile);
          signalDates.push({
            date: workingDates[sigIdx] ?? "",
            ret1m: profile.returns["1M"] ?? null,
            ret3m: profile.returns["3M"] ?? null,
            ret6m: profile.returns["6M"] ?? null,
          });
          lastSignalIdx = sigIdx;
        }

        const isBand = returnMode === "band";
        const summary = summarizeSignals(profiles, direction);
        const composite = computeCompositeScore(summary, direction, isBand);
        totalSignalCount += summary.count;
        categoryResults.push({
          category: cat,
          label: catMeta?.label ?? cat,
          description: catMeta?.description ?? "",
          summary,
          composite,
          signalDates,
          profiles,
        });
      }

      if (totalSignalCount < 3) continue;
      const bestCat = categoryResults.reduce((best, cur) =>
        best.composite.score > cur.composite.score ? best : cur
      );
      allConfigs.push({
        config: cfg,
        configLabel: buildConfigLabel(cfg),
        categories: categoryResults,
        bestCategory: bestCat.category,
        bestScore: bestCat.composite.score,
      });
    }

    if (allConfigs.length === 0) return null;

    const bestConfig = allConfigs.reduce((best, cur) =>
      best.bestScore > cur.bestScore ? best : cur
    );

    // Compute current signal state
    let currentSignal = "None";
    const currentROCByPeriod: Record<number, number> = {};
    const currentSlowROCByPeriod: Record<number, number> = {};

    {
      const src =
        frequency.endsWith("_on_daily") && weeklyData ? weeklyData.prices : workingCloses;
      const lastIdx = src.length - 1;
      const periodSet = new Set<number>();
      const slowSet = new Set<number>();
      for (const c of allConfigs) {
        if (c.config.period) periodSet.add(c.config.period);
        if (c.config.slowPeriod) slowSet.add(c.config.slowPeriod);
      }
      for (const p of Array.from(periodSet)) {
        if (lastIdx >= p) {
          const cur = src[lastIdx];
          const prev = src[lastIdx - p];
          if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0)
            currentROCByPeriod[p] = cur / prev - 1;
        }
      }
      for (const p of Array.from(slowSet)) {
        if (lastIdx >= p) {
          const cur = src[lastIdx];
          const prev = src[lastIdx - p];
          if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0)
            currentSlowROCByPeriod[p] = cur / prev - 1;
        }
      }

      const bestROC = computeROC(src, bestConfig.config.period);
      const bestROCVal = bestROC[src.length - 1] ?? NaN;
      if (Number.isFinite(bestROCVal)) {
        if (signalType === "zero_cross") {
          currentSignal = bestROCVal > 0 ? "ROC Above 0 (Bull)" : "ROC Below 0 (Bear)";
        } else if (signalType === "threshold_cross") {
          const t = bestConfig.config.threshold ?? 0.05;
          currentSignal =
            bestROCVal > t
              ? `ROC > +${pctSigned(t)} (Bull)`
              : bestROCVal < -t
              ? `ROC < -${pctSigned(t)} (Bear)`
              : "ROC in band (Neutral)";
        } else if (signalType === "threshold_reversion") {
          const t = bestConfig.config.threshold ?? 0.05;
          currentSignal =
            bestROCVal > t
              ? `ROC > +${pctSigned(t)} (Fade Short)`
              : bestROCVal < -t
              ? `ROC < -${pctSigned(t)} (Bounce Long)`
              : "ROC in band (Neutral)";
        } else if (signalType === "fast_slow_cross") {
          const slowROC = computeROC(src, bestConfig.config.slowPeriod ?? 50);
          const slowVal = slowROC[src.length - 1] ?? NaN;
          if (Number.isFinite(slowVal))
            currentSignal =
              bestROCVal > slowVal ? "Fast ROC > Slow (Bull)" : "Fast ROC < Slow (Bear)";
        } else {
          const slb = bestConfig.config.slopeLookback ?? 5;
          const rocArr = computeROC(src, bestConfig.config.period);
          const rocCur = rocArr[src.length - 1] ?? NaN;
          const rocPrev = rocArr[src.length - 1 - slb] ?? NaN;
          if (src.length > slb && Number.isFinite(rocPrev))
            currentSignal =
              rocCur - rocPrev > 0 ? "ROC Slope Up (Bull)" : "ROC Slope Down (Bear)";
        }
      }
    }

    // Keep only profiles for top 6 configs to save memory
    const topN = 6;
    const topLabels = new Set(
      [...allConfigs].sort((a, b) => b.bestScore - a.bestScore).slice(0, topN).map((c) => c.configLabel)
    );
    for (const c of allConfigs)
      if (!topLabels.has(c.configLabel))
        for (const cat of c.categories) cat.profiles = undefined;
  return {
    configs: allConfigs,
    bestCategoryKey: bestConfig.bestCategory,
    bestScore: bestConfig.bestScore,
    currentSignal,
    currentROCByPeriod,
    currentSlowROCByPeriod,
  };
}
