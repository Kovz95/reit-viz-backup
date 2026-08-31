// TVA optimizer kernel — extracted from TVAOptimizer.tsx so the grid search
// can run in a Web Worker (workers/tvaSweep.worker.ts) with the same function
// doubling as the main-thread fallback. Pure compute.
import { tvaCompute } from "@/lib/tva";
import { computeForwardProfile, summarizeSignals, computeCompositeScore } from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore } from "@/lib/forwardReturns";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { yieldMain } from "@/lib/yieldMain";

const computeTva = tvaCompute as any;

// ── Constants ──────────────────────────────────────────────────────────────────

export const SIGNAL_TYPES = [
  {
    key: "regime",
    label: "Regime Flip",
    description: "os crosses 0 (WMA-SMA trend oscillator)",
  },
  {
    key: "threshold_cross",
    label: "Threshold Cross",
    description: "bull/bear pressure crosses k × |envelope|",
  },
  {
    key: "divergence",
    label: "Bull / Bear Divergence",
    description: "bullPressure crosses bearPressure",
  },
];

export const LENGTH_OPTIONS = [10, 15, 20, 30, 50];
export const SMO_OPTIONS = [3, 5, 10];
export const MULT_OPTIONS = [3, 5, 7, 10];
export const THRESHOLD_OPTIONS = [0.3, 0.5, 0.7, 0.9];
export const MIN_HISTORY_DAILY = 252;
export const MIN_HISTORY_WEEKLY = 52;
export const MIN_SIGNALS = 5;
export const TOP_N = 6;

// ── Types ──

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TvaParams {
  length: number;
  smo: number;
  mult: number;
  threshold: number;
  signalType: string;
}

export interface TvaDirectionResult {
  direction: "long" | "short";
  summary: any;
  composite: any;
  profiles: any[];
}

export interface TvaConfigResult {
  length: number;
  smo: number;
  mult: number;
  threshold: number;
  signalType: string;
  configLabel: string;
  directions: TvaDirectionResult[];
  bestDirection: "long" | "short";
  bestScore: number;
}

export interface TvaPriceContext {
  prices: number[];
  highs: number[];
  lows: number[];
  volumes: number[] | null;
  dates: string[];
  globalIndices: number[];
  benchmarkPrices: null;
  mode: "single" | "pair";
  pairLegA?: string;
  pairLegB?: string;
}

export interface TvaTickerResult {
  ticker: string;
  name: string;
  configs: TvaConfigResult[];
  bestConfigLabel: string;
  bestDirection: "long" | "short";
  bestScore: number;
  currentOs: number;
  currentBullP: number;
  currentBearP: number;
  priceContext: TvaPriceContext;
}

export interface SkippedEntry {
  ticker: string;
  reason: string;
}

// ── Signal detection ──

// ── Signal detection ───────────────────────────────────────────────────────────

export function detectTvaSignals(prices: number[], volumes: number[], params: TvaParams) {
  const tva = (computeTva as any)(prices, volumes, params.length, params.smo, params.mult);
  const longIdx: number[] = [];
  const shortIdx: number[] = [];

  for (let x = Math.max(params.length, params.smo) + 1; x < prices.length; x++) {
    if (params.signalType === "regime") {
      const prev = tva.os[x - 1];
      const cur = tva.os[x];
      if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
      if (prev <= 0 && cur > 0) longIdx.push(x);
      else if (prev >= 0 && cur < 0) shortIdx.push(x);
    } else if (params.signalType === "threshold_cross") {
      const bPrev = tva.bullPressure[x - 1];
      const bCur = tva.bullPressure[x];
      const rPrev = tva.bearPressure[x - 1];
      const rCur = tva.bearPressure[x];
      const aPrev = tva.a[x - 1];
      const aCur = tva.a[x];
      const bPrev2 = tva.b[x - 1];
      const bCur2 = tva.b[x];
      if (!Number.isFinite(bPrev) || !Number.isFinite(bCur) || !Number.isFinite(aPrev) || !Number.isFinite(aCur)) continue;
      const threshBullPrev = Math.abs(aPrev) * params.threshold;
      const threshBullCur = Math.abs(aCur) * params.threshold;
      const threshBearPrev = Math.abs(bPrev2) * params.threshold;
      const threshBearCur = Math.abs(bCur2) * params.threshold;
      if (bPrev <= threshBullPrev && bCur > threshBullCur) longIdx.push(x);
      if (rPrev <= threshBearPrev && rCur > threshBearCur) shortIdx.push(x);
    } else if (params.signalType === "divergence") {
      const bPrev = tva.bullPressure[x - 1];
      const bCur = tva.bullPressure[x];
      const rPrev = tva.bearPressure[x - 1];
      const rCur = tva.bearPressure[x];
      if (!Number.isFinite(bPrev) || !Number.isFinite(bCur) || !Number.isFinite(rPrev) || !Number.isFinite(rCur)) continue;
      const diffPrev = bPrev - rPrev;
      const diffCur = bCur - rCur;
      if (diffPrev <= 0 && diffCur > 0) longIdx.push(x);
      else if (diffPrev >= 0 && diffCur < 0) shortIdx.push(x);
    }
  }

  const lastFinite = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
    return NaN;
  };

  return {
    longIdx,
    shortIdx,
    currentOs: lastFinite(tva.os),
    currentBullP: lastFinite(tva.bullPressure),
    currentBearP: lastFinite(tva.bearPressure),
  };
}


export function formatOsSignal(os: number | null | undefined): string {
  if (os == null || !Number.isFinite(os)) return "—";
  if (os > 0) return "BULL";
  if (os < 0) return "BEAR";
  return "FLAT";
}

// ── Per-ticker sweep (the block the page used to run inline) ──

export interface TvaSweepPayload {
  workPrices: number[];
  workVolumes: number[];
  dailyPrices: number[];
  weeklyResult: any;
  weeklyResampled: any;
  frequency: string;
  freq: string;
  enabledSignalTypes: string[];
  targetReturn: number;
}

export interface TvaSweepResult {
  topConfigs: any[];
  bestConfigLabel: string;
  bestDirection: "long" | "short";
  bestScore: number;
  currentOs: any;
  currentBullP: any;
  currentBearP: any;
}

export async function runTvaSweep(pl: TvaSweepPayload): Promise<TvaSweepResult | null> {
  const { workPrices, workVolumes, dailyPrices, weeklyResult, weeklyResampled,
    frequency, freq, enabledSignalTypes, targetReturn } = pl;
  const configs: any[] = [];
    for (const sigType of enabledSignalTypes) {
      for (const len of LENGTH_OPTIONS) {
        for (const smoV of SMO_OPTIONS) {
          for (const multV of MULT_OPTIONS) {
            const thresholds = sigType === "threshold_cross" ? THRESHOLD_OPTIONS : [0];
            for (const thresh of thresholds) {
              const params: TvaParams = { length: len, smo: smoV, mult: multV, threshold: thresh, signalType: sigType };
              const signals = detectTvaSignals(workPrices, workVolumes, params);
              const dirResults: TvaDirectionResult[] = [];
              for (const dir of ["long", "short"] as const) {
                const sigIdx = dir === "long" ? signals.longIdx : signals.shortIdx;
                if (sigIdx.length < MIN_SIGNALS) continue;
                const side = dir === "long" ? "buy" : "sell";
                const profiles = sigIdx.map((ye: number) => {
                  let dailyIdx: number;
                  if ((frequency as string).endsWith("_on_daily") && weeklyResult) {
                    dailyIdx = weeklyResult.weekIndex[ye] ?? -1;
                  } else if ((freq === "weekly" || freq === "monthly") && weeklyResampled) {
                    dailyIdx = (getDailyIndexFromWeekly as any)(ye, weeklyResampled);
                  } else {
                    dailyIdx = ye;
                  }
                  if (dailyIdx < 0) return null;
                  return (computeForwardProfile as any)(dailyPrices, dailyIdx, targetReturn, side);
                }).filter((p: any) => p !== null);
                if (profiles.length < MIN_SIGNALS) continue;
                const summary = (summarizeSignals as any)(profiles, side);
                const composite = (computeCompositeScore as any)(summary, side);
                dirResults.push({ direction: dir, summary, composite, profiles });
              }
              if (dirResults.length === 0) continue;
              const best = dirResults.reduce((a, b) => a.composite.score >= b.composite.score ? a : b);
              const label = sigType === "threshold_cross"
                ? `${SIGNAL_TYPES.find(s => s.key === sigType)!.label} · L=${len} smo=${smoV} m=${multV} k=${thresh}`
                : `${SIGNAL_TYPES.find(s => s.key === sigType)!.label} · L=${len} smo=${smoV} m=${multV}`;
              configs.push({ ...params, configLabel: label, directions: dirResults, bestDirection: best.direction, bestScore: best.composite.score });
            }
          }
        }
      }
      await yieldMain(); // fallback responsiveness; cheap in a worker
    }

  configs.sort((a, b) => b.bestScore - a.bestScore);
  const topConfigs = configs.slice(0, TOP_N);
  if (topConfigs.length === 0) return null;

  const bestConf = topConfigs[0];
  const bestSignals = detectTvaSignals(workPrices, workVolumes, {
    length: bestConf.length, smo: bestConf.smo, mult: bestConf.mult, threshold: bestConf.threshold, signalType: bestConf.signalType,
  });

  return {
    topConfigs,
    bestConfigLabel: bestConf.configLabel,
    bestDirection: bestConf.bestDirection,
    bestScore: bestConf.bestScore,
    currentOs: bestSignals.currentOs,
    currentBullP: bestSignals.currentBullP,
    currentBearP: bestSignals.currentBearP,
  };
}
