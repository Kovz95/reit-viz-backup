// WorkerPool — task pool used by the Oscillators EWO daily scan.
//
// The original bundle shipped a real Web Worker script
// (oscillatorOptimizer.worker-*.js) that was never recovered, so this pool
// executes the scan on the main thread instead: tasks are queued (one at a
// time) and the grid loop yields to the event loop regularly to keep the UI
// responsive. The scan mirrors the inline weekly_on_daily EWO path in
// Oscillators.tsx, applied to daily bars.

import { stochOscillator, detectSignals } from "@/lib/oscillatorMath";
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";
import { weeklyDownsample, weeklyDownsamplePrices, expandWeeklyToDaily } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";

export interface WorkerPoolOptions {
  size?: number;
  workerUrl?: string;
  [key: string]: any;
}

export interface WorkerTask<TInput = any, TOutput = any> {
  type: string;
  payload?: TInput;
  [key: string]: any;
}

const ewo = stochOscillator as any;
const detect = detectSignals as any;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export interface EwoTask {
  type: string;
  ticker: string;
  name?: string;
  closes: number[];
  highs: number[];
  lows: number[];
  params: {
    ewoFast: number[];
    ewoSlow: number[];
    ewoThresholdPct: number[];
    targetReturn: number | null;
    returnMode: string;
    bandMin: number;
    bandMax: number;
    minHold: number;
  };
}

export async function runEwoDailyScan(task: EwoTask, isCancelled: () => boolean): Promise<any | null> {
  const { ticker, name, closes, highs, lows, params } = task;
  const n = closes.length;
  if (!Array.isArray(closes) || n < 252) return null;

  // 252-day MA of closes — daily analog of the weekly path's 52-week MA,
  // used as the base for percent thresholds.
  const MA_LEN = 252;
  const ma: (number | null)[] = new Array(n).fill(null);
  {
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      sum += closes[i]; cnt++;
      if (i >= MA_LEN) { sum -= closes[i - MA_LEN]; cnt--; }
      if (cnt > 0) ma[i] = sum / cnt;
    }
  }
  const recent = closes.slice(-MA_LEN);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / Math.max(recent.length, 1);

  const isBand = params.returnMode === "band";
  const bandObj = isBand ? { minReturn: params.bandMin, maxReturn: params.bandMax } : null;
  const configs: any[] = [];
  let sinceYield = 0;

  for (const fast of params.ewoFast) {
    for (const slow of params.ewoSlow) {
      if (fast >= slow) continue;
      if (isCancelled()) return null;
      if (++sinceYield >= 25) { sinceYield = 0; await yieldToUi(); }

      const ewoVals: (number | null)[] = ewo(highs, lows, fast, slow);
      const warmup = Math.max(slow, 21) + 126;

      for (const thr of params.ewoThresholdPct) {
        const thrLine = ma.map((v) => (v === null ? null : (thr / 100) * v));
        const signals = detect(ewoVals, thrLine, warmup);
        const buyProfiles: any[] = [];
        const sellProfiles: any[] = [];
        let lastIdx = -1;
        for (const sig of signals) {
          if (params.minHold > 0 && sig.index < lastIdx) continue;
          if (sig.index < 0 || sig.index >= n) continue;
          const profile = computeForwardProfile(
            closes, sig.index, params.targetReturn as any, sig.direction, bandObj as any, params.minHold
          );
          sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
          if (params.minHold > 0) lastIdx = sig.index + params.minHold;
        }
        const buySummary = (summarizeSignals as any)(buyProfiles, "buy");
        const sellSummary = (summarizeSignals as any)(sellProfiles, "sell");
        const buyComposite = (computeCompositeScore as any)(buySummary, "buy", isBand);
        const sellComposite = (computeCompositeScore as any)(sellSummary, "sell", isBand);
        const cats = [
          { category: "buy", label: "Buy Signal", description: "Long-side signal — entry into long position", summary: buySummary, composite: buyComposite, profiles: buyProfiles },
          { category: "sell", label: "Sell Signal", description: "Short-side signal — entry into short position", summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
        ];
        const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
        configs.push({
          configLabel: `EWO(${fast},${slow}) thr ${thr}%`,
          configKey: `${fast}_${slow}_${thr}`,
          categories: cats,
          bestCategory: best.category,
          bestScore: best.composite.score,
        });
      }
    }
  }

  if (configs.length === 0) return null;

  // Keep full profiles only on the top-N configs (memory)
  const TOP_N = 6;
  const sorted = [...configs].sort((a, b) => b.bestScore - a.bestScore);
  const topKeys = new Set(sorted.slice(0, TOP_N).map((c) => c.configKey));
  for (const c of configs) {
    if (!topKeys.has(c.configKey)) {
      for (const cat of c.categories) cat.profiles = undefined;
    }
  }

  const bestCfg = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
  const [bFast, bSlow, bThr] = bestCfg.configKey.split("_").map(Number);
  const ewoBest: (number | null)[] = ewo(highs, lows, bFast, bSlow);
  const lastVal = ewoBest[ewoBest.length - 1];
  const prevVal = ewoBest[ewoBest.length - 2] ?? null;
  const currentValue = lastVal != null ? Math.round(lastVal * 1000) / 1000 : null;
  let currentValuePct: number | null = null;
  if (lastVal != null) {
    const slice = closes.slice(-bSlow);
    const avg = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
    if (avg > 0) currentValuePct = Math.round((lastVal / avg) * 1000) / 10;
  }
  const thrAbs = (bThr / 100) * avgRecent;
  let currentSignal = "None";
  if (lastVal != null) {
    if (lastVal > thrAbs) currentSignal = thrAbs > 0 ? "Above +Thr" : "Above 0";
    else if (lastVal < -thrAbs) currentSignal = thrAbs > 0 ? "Below -Thr" : "Below 0";
    else currentSignal = "In Zone";
    if (prevVal != null) {
      if (thrAbs === 0) {
        if (prevVal <= 0 && lastVal > 0) currentSignal = "→ Cross Up";
        else if (prevVal >= 0 && lastVal < 0) currentSignal = "→ Cross Down";
      } else {
        if (prevVal <= thrAbs && lastVal > thrAbs) currentSignal = "→ Cross +Thr";
        else if (prevVal >= -thrAbs && lastVal < -thrAbs) currentSignal = "→ Cross -Thr";
      }
    }
  }

  return {
    ticker,
    name,
    configs,
    bestConfigLabel: bestCfg.configLabel,
    bestCategory: bestCfg.bestCategory,
    bestScore: bestCfg.bestScore,
    currentSignal,
    currentValue,
    currentValuePct,
  };
}

export interface EwoCoarseTask {
  type: string; // "coarse"
  ticker: string;
  name?: string;
  /** "wod" = weekly/monthly signals evaluated on DAILY bars; "period" = signals + display on weekly/monthly bars. */
  variant: "wod" | "period";
  mode: "weekly" | "monthly";
  closes: number[];
  highs: number[];
  lows: number[];
  dates: string[];
  params: EwoTask["params"];
}

/**
 * Coarse-frequency EWO sweep (W, M, W/D, M/D) — extracted verbatim from the
 * inline loops in Oscillators.tsx so the real worker can run them off-thread
 * (a ~15k-config sweep froze the UI for its duration on universe runs).
 */
export async function runEwoCoarseScan(task: EwoCoarseTask, isCancelled: () => boolean): Promise<any | null> {
  const { ticker, name, closes, highs, lows, dates, params, variant, mode } = task;
  const isBand = params.returnMode === "band";
  const bandObj = isBand ? { minReturn: params.bandMin, maxReturn: params.bandMax } : null;
  const configs: any[] = [];
  let sinceYield = 0;

  const buildConfig = (fast: number, slow: number, thr: number, buyProfiles: any[], sellProfiles: any[]) => {
    const buySummary = (summarizeSignals as any)(buyProfiles, "buy");
    const sellSummary = (summarizeSignals as any)(sellProfiles, "sell");
    const buyComposite = (computeCompositeScore as any)(buySummary, "buy", isBand);
    const sellComposite = (computeCompositeScore as any)(sellSummary, "sell", isBand);
    const cats = [
      { category: "buy", label: "Buy Signal", description: "Long-side signal — entry into long position", summary: buySummary, composite: buyComposite, profiles: buyProfiles },
      { category: "sell", label: "Sell Signal", description: "Short-side signal — entry into short position", summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
    ];
    const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
    configs.push({
      configLabel: `EWO(${fast},${slow}) thr ${thr}%`,
      configKey: `${fast}_${slow}_${thr}`,
      categories: cats,
      bestCategory: best.category,
      bestScore: best.composite.score,
    });
  };

  const finish = (
    coarseCloses: number[],
    coarseHighs: number[],
    coarseLows: number[],
    avgWk: number,
    extra?: Record<string, any>,
  ) => {
    if (configs.length === 0) return null;
    const TOP_N = 6;
    const sorted = [...configs].sort((a, b) => b.bestScore - a.bestScore);
    const topKeys = new Set(sorted.slice(0, TOP_N).map((c) => c.configKey));
    for (const c of configs) {
      if (!topKeys.has(c.configKey)) {
        for (const cat of c.categories) cat.profiles = undefined;
      }
    }
    const bestCfg = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
    const [bFast, bSlow, bThr] = bestCfg.configKey.split("_").map(Number);
    const ewoBest: (number | null)[] = ewo(coarseHighs, coarseLows, bFast, bSlow);
    const lastVal = ewoBest[ewoBest.length - 1];
    const prevVal = ewoBest[ewoBest.length - 2] ?? null;
    const currentValue = lastVal != null ? Math.round(lastVal * 1000) / 1000 : null;
    let currentValuePct: number | null = null;
    if (lastVal != null) {
      const slice = coarseCloses.slice(-bSlow);
      const avg = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
      if (avg > 0) currentValuePct = Math.round((lastVal / avg) * 1000) / 10;
    }
    const thrAbs = (bThr / 100) * avgWk;
    let currentSignal = "None";
    if (lastVal != null) {
      if (lastVal > thrAbs) currentSignal = thrAbs > 0 ? "Above +Thr" : "Above 0";
      else if (lastVal < -thrAbs) currentSignal = thrAbs > 0 ? "Below -Thr" : "Below 0";
      else currentSignal = "In Zone";
      if (prevVal != null) {
        if (thrAbs === 0) {
          if (prevVal <= 0 && lastVal > 0) currentSignal = "→ Cross Up";
          else if (prevVal >= 0 && lastVal < 0) currentSignal = "→ Cross Down";
        } else {
          if (prevVal <= thrAbs && lastVal > thrAbs) currentSignal = "→ Cross +Thr";
          else if (prevVal >= -thrAbs && lastVal < -thrAbs) currentSignal = "→ Cross -Thr";
        }
      }
    }
    return {
      ticker, name, configs,
      bestConfigLabel: bestCfg.configLabel,
      bestCategory: bestCfg.bestCategory,
      bestScore: bestCfg.bestScore,
      currentSignal, currentValue, currentValuePct,
      ...extra,
    };
  };

  if (variant === "wod") {
    const dailyLen = closes.length;
    if (dailyLen < 252) return null;
    const wodMode = mode === "monthly" ? ("monthly" as const) : undefined;
    const wkCloses = (weeklyDownsamplePrices as any)(closes, dates, wodMode);
    const wkHighs = (weeklyDownsamplePrices as any)(highs, dates, wodMode);
    const wkLows = (weeklyDownsamplePrices as any)(lows, dates, wodMode);
    if (wkCloses.prices.length < (wodMode ? 24 : 52)) return null;

    // 52 coarse-bar MA of closes — base for percent thresholds (mirrors the
    // page's historical W/D constant, monthly included).
    const MA_LEN = 52;
    const maWeekly: (number | null)[] = new Array(wkCloses.prices.length).fill(null);
    let sum = 0, cnt = 0;
    for (let i = 0; i < wkCloses.prices.length; i++) {
      sum += wkCloses.prices[i]; cnt++;
      if (i >= MA_LEN) { sum -= wkCloses.prices[i - MA_LEN]; cnt--; }
      if (cnt > 0) maWeekly[i] = sum / cnt;
    }
    const recentWk = wkCloses.prices.slice(-MA_LEN);
    const avgWk = recentWk.reduce((a: number, b: number) => a + b, 0) / Math.max(recentWk.length, 1);

    for (const fast of params.ewoFast) {
      for (const slow of params.ewoSlow) {
        if (fast >= slow) continue;
        if (isCancelled()) return null;
        if (++sinceYield >= 25) { sinceYield = 0; await yieldToUi(); }
        const ewoVals = (ewo(wkHighs.prices, wkLows.prices, fast, slow) as (number | null)[]).map((v) => (v === null ? NaN : v));
        const ewoDaily = (expandWeeklyToDaily as any)(ewoVals, wkCloses.weekIndex, dailyLen).map((v: number) => (Number.isFinite(v) ? v : null));
        const maDaily = (expandWeeklyToDaily as any)(
          maWeekly.map((v) => (v === null ? NaN : v)),
          wkCloses.weekIndex,
          dailyLen,
        ).map((v: number) => (Number.isFinite(v) ? v : null));
        const warmup = Math.max(slow * (mode === "monthly" ? 21 : 5), 21) + 126;
        for (const thr of params.ewoThresholdPct) {
          const thrLine = maDaily.map((v: number | null) => (v === null ? null : (thr / 100) * v));
          const signals = detect(ewoDaily, thrLine, warmup);
          const buyProfiles: any[] = [];
          const sellProfiles: any[] = [];
          let lastIdx = -1;
          for (const sig of signals) {
            if (params.minHold > 0 && sig.index < lastIdx) continue;
            if (sig.index < 0 || sig.index >= dailyLen) continue;
            const profile = computeForwardProfile(closes, sig.index, params.targetReturn as any, sig.direction, bandObj as any, params.minHold);
            sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
            if (params.minHold > 0) lastIdx = sig.index + params.minHold;
          }
          buildConfig(fast, slow, thr, buyProfiles, sellProfiles);
        }
      }
    }
    return finish(wkCloses.prices, wkHighs.prices, wkLows.prices, avgWk);
  }

  // variant "period": signals AND display on weekly/monthly bars, forward
  // profiles on daily closes via the coarse bar's own daily index.
  const weekly = (weeklyDownsample as any)(
    { dates, closes, adjCloses: closes, highs, lows },
    mode,
  );
  if (weekly.adjCloses.length < (mode === "monthly" ? 24 : 52)) return null;
  const MA_LEN = mode === "monthly" ? 12 : 52;
  const maWeekly: (number | null)[] = new Array(weekly.closes.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < weekly.closes.length; i++) {
    sum += weekly.closes[i]; cnt++;
    if (i >= MA_LEN) { sum -= weekly.closes[i - MA_LEN]; cnt--; }
    if (cnt > 0) maWeekly[i] = sum / cnt;
  }
  const recentWk = weekly.closes.slice(-MA_LEN);
  const avgWk = recentWk.reduce((a: number, b: number) => a + b, 0) / Math.max(recentWk.length, 1);

  for (const fast of params.ewoFast) {
    for (const slow of params.ewoSlow) {
      if (fast >= slow) continue;
      if (isCancelled()) return null;
      if (++sinceYield >= 25) { sinceYield = 0; await yieldToUi(); }
      const warmup = slow + 26;
      const ewoVals = ewo(weekly.highs, weekly.lows, fast, slow);
      for (const thr of params.ewoThresholdPct) {
        const thrLine = maWeekly.map((v) => (v === null ? null : (thr / 100) * v));
        const signals = detect(ewoVals, thrLine, warmup);
        const buyProfiles: any[] = [];
        const sellProfiles: any[] = [];
        let lastIdx = -1;
        for (const sig of signals) {
          if (params.minHold > 0 && sig.index < lastIdx) continue;
          const dailyIdx = (getDailyIndexFromWeekly as any)(sig.index, weekly);
          if (dailyIdx < 0) continue;
          const profile = computeForwardProfile(closes, dailyIdx, params.targetReturn as any, sig.direction, bandObj as any, params.minHold);
          sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
          if (params.minHold > 0) lastIdx = sig.index + params.minHold;
        }
        buildConfig(fast, slow, thr, buyProfiles, sellProfiles);
      }
    }
  }
  return finish(weekly.closes, weekly.highs, weekly.lows, avgWk, {
    weekly: {
      closes: weekly.closes,
      highs: weekly.highs,
      lows: weekly.lows,
      volumes: weekly.volumes,
      dates: weekly.dates,
      dailyIndexMap: weekly.dailyIndexMap,
    },
  });
}

export class WorkerPool {
  private queue: Promise<any> = Promise.resolve();
  private terminated = false;

  // The worker factory/concurrency args are accepted for call-site
  // compatibility but unused: tasks run serially on the main thread.
  constructor(_factoryOrOptions?: any, _concurrency?: number) {}

  /**
   * Submit a task and receive the result as a Promise. Tasks are serialized
   * (main thread); each task yields to the event loop during heavy loops.
   */
  async run<TInput = any, TOutput = any>(task: WorkerTask<TInput, TOutput> | any): Promise<TOutput> {
    const next = this.queue.then(async () => {
      if (this.terminated) return null;
      if (task && (task.type === "run" || task.type === "ewo") && Array.isArray(task.closes)) {
        try {
          return await runEwoDailyScan(task as EwoTask, () => this.terminated);
        } catch {
          return null;
        }
      }
      return null;
    });
    // Keep the chain alive even if a task fails.
    this.queue = next.catch(() => undefined);
    return next as Promise<TOutput>;
  }

  /** Stop accepting/settling work. */
  terminate(): void {
    this.terminated = true;
  }
}
