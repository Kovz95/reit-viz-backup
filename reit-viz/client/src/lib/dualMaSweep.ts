// Dual-MA optimizer kernel — extracted from DualMAOptimizer.tsx so the grid
// search can run in a Web Worker (workers/dualMaSweep.worker.ts) with the
// same function doubling as the main-thread fallback. Pure compute.
// (Async wrapper runDualMaSweep yields between bias-MA groups so the inline
// fallback stays responsive; per-combo yields would add setTimeout-clamp
// latency in the worker.)
import { computeMA } from "@/lib/movingAverages";
import type { MAType } from "@/lib/movingAverages";
import { yieldMain } from "@/lib/yieldMain";

// ── Constants ──

export const SLOPE_METHODS: Record<string, string> = {
  diff: "Lookback Diff",
  ols: "OLS Slope",
  diff_pct: "Diff + Magnitude",
};

// ── Types ──

export interface DualMAParams {
  biasMAType: string;
  biasLen: number;
  triggerMAType: string;
  triggerLen: number;
  slopeMethod: string;
  slopeLookback: number;
  slopeMinPct: number;
  allowShort: boolean;
  maOpts?: any;
}

export interface TradeRecord {
  side: "long" | "short";
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  bars: number;
  ret: number;
}

export interface BacktestStats {
  nTrades: number;
  nWins: number;
  hitRate: number;
  meanRet: number;
  medianRet: number;
  winRet: number;
  lossRet: number;
  profitFactor: number;
  totalReturn: number;
  annualReturn: number;
  annualVol: number;
  sharpe: number;
  maxDD: number;
  timeInMarket: number;
  buyHoldReturn: number;
}

export interface BacktestResult {
  params: DualMAParams;
  trades: TradeRecord[];
  equity: number[];
  bias: Int8Array;
  position: Int8Array;
  stats: BacktestStats;
}

export interface ParamResult {
  params: DualMAParams;
  stats: BacktestStats;
}

export interface TickerResult {
  ticker: string;
  name: string;
  topK: ParamResult[];
}

export interface GridConfig {
  biasMATypes: string[];
  biasLens: number[];
  triggerMATypes: string[];
  triggerLens: number[];
  slopeMethods: string[];
  slopeLookbacks: number[];
  slopeMinPcts: number[];
  allowShortOptions: boolean[];
  maOpts?: any;
}

// ── Grid configs ──

export const GRID_CONFIGS: Record<string, GridConfig> = {
  quick: {
    biasMATypes: ["EMA"],
    biasLens: [20, 50, 100, 200],
    triggerMATypes: ["WMA"],
    triggerLens: [10, 20, 50],
    slopeMethods: ["diff"],
    slopeLookbacks: [5, 10],
    slopeMinPcts: [0],
    allowShortOptions: [true],
  },
  standard: {
    biasMATypes: ["EMA", "SMA", "HMA"],
    biasLens: [20, 34, 50, 89, 100, 150, 200],
    triggerMATypes: ["WMA", "EMA", "HMA"],
    triggerLens: [8, 13, 20, 34, 50],
    slopeMethods: ["diff", "ols"],
    slopeLookbacks: [3, 5, 10, 20],
    slopeMinPcts: [0],
    allowShortOptions: [true],
  },
  deep: {
    biasMATypes: ["EMA", "SMA", "HMA", "WMA", "KAMA", "T3", "ALMA"],
    biasLens: [10, 20, 34, 50, 89, 100, 150, 200, 250],
    triggerMATypes: ["WMA", "EMA", "HMA", "SMA", "ALMA"],
    triggerLens: [5, 8, 13, 20, 34, 50, 100],
    slopeMethods: ["diff", "ols", "diff_pct"],
    slopeLookbacks: [3, 5, 10, 20, 40],
    slopeMinPcts: [0, 5e-4, 0.001, 0.002],
    allowShortOptions: [true],
  },
};

export function countGridCombos(cfg: GridConfig): number {
  let n = 0;
  for (const slopeMethod of cfg.slopeMethods) {
    const minPcts = slopeMethod === "diff_pct" ? cfg.slopeMinPcts : [0];
    n +=
      cfg.biasMATypes.length *
      cfg.biasLens.length *
      cfg.triggerMATypes.length *
      cfg.triggerLens.length *
      cfg.slopeLookbacks.length *
      minPcts.length *
      cfg.allowShortOptions.length;
  }
  return n;
}

// ── Slope helper ──

export function computeSlopeSignal(
  prices: (number | null)[],
  idx: number,
  lookback: number,
  method: string,
  rawPrices: number[],
  minPct: number
): number {
  const cur = prices[idx];
  if (cur == null) return 0;
  if (method === "ols") {
    if (idx - lookback < 0) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, n = 0;
    for (let i = 0; i <= lookback; i++) {
      const p = prices[idx - lookback + i];
      if (p == null) return 0;
      sx += i; sy += p; sxy += i * p; sxx += i * i; n++;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return 0;
    const slope = (n * sxy - sx * sy) / denom;
    return slope > 0 ? 1 : slope < 0 ? -1 : 0;
  }
  if (idx - lookback < 0) return 0;
  const prev = prices[idx - lookback];
  if (prev == null) return 0;
  const diff = (cur - prev) / lookback;
  if (method === "diff_pct") {
    const raw = rawPrices[idx];
    if (!Number.isFinite(raw) || raw <= 0 || Math.abs(diff) / raw < minPct) return 0;
  }
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

// ── Buy & hold ──

export function buyHoldReturn(prices: number[]): number {
  let first = -1, last = -1;
  for (let i = 0; i < prices.length; i++) {
    if (Number.isFinite(prices[i]) && prices[i] > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 || last <= first ? 0 : prices[last] / prices[first] - 1;
}

export function calcStats(
  trades: TradeRecord[],
  equity: Float64Array,
  position: Int8Array,
  prices: number[],
  barsPerYear = 252
): BacktestStats {
  const n = trades.length;
  if (n === 0) {
    return {
      nTrades: 0, nWins: 0, hitRate: NaN, meanRet: NaN, medianRet: NaN,
      winRet: NaN, lossRet: NaN, profitFactor: NaN, totalReturn: 0,
      annualReturn: 0, annualVol: NaN, sharpe: NaN, maxDD: 0,
      timeInMarket: 0, buyHoldReturn: buyHoldReturn(prices),
    };
  }
  const rets = trades.map(t => t.ret);
  const wins = rets.filter(r => r > 0);
  const losses = rets.filter(r => r <= 0);
  const winSum = wins.reduce((a, b) => a + b, 0);
  const lossSum = losses.reduce((a, b) => a + b, 0);
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianRet = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const totalReturn = equity[equity.length - 1] - 1;
  const years = Math.max(0.001, prices.length / barsPerYear);
  const annualReturn = (1 + totalReturn) ** (1 / years) - 1;
  let variance = 0;
  for (const r of rets) variance += (r - meanRet) ** 2;
  const tradeStd = rets.length > 1 ? Math.sqrt(variance / (rets.length - 1)) : NaN;
  const tradesPerYear = rets.length / years;
  const annualVol = Number.isFinite(tradeStd) ? tradeStd * Math.sqrt(tradesPerYear) : NaN;
  const sharpe = Number.isFinite(annualVol) && annualVol > 0 ? annualReturn / annualVol : NaN;
  let peak = equity[0], maxDD = 0;
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) peak = equity[i];
    const dd = (equity[i] - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  let inMarket = 0;
  for (let i = 0; i < position.length; i++) if (position[i] !== 0) inMarket++;
  return {
    nTrades: n, nWins: wins.length,
    hitRate: wins.length / n,
    meanRet, medianRet,
    winRet: wins.length ? winSum / wins.length : NaN,
    lossRet: losses.length ? lossSum / losses.length : NaN,
    profitFactor: losses.length > 0 && lossSum < 0 ? winSum / Math.abs(lossSum) : winSum > 0 ? Infinity : NaN,
    totalReturn, annualReturn, annualVol, sharpe, maxDD,
    timeInMarket: inMarket / position.length,
    buyHoldReturn: buyHoldReturn(prices),
  };
}

export function runBacktest(prices: number[], params: DualMAParams, barsPerYear = 252): BacktestResult {
  const n = prices.length;
  const biasMa = computeMA(prices, params.biasLen, params.biasMAType as MAType, params.maOpts);
  const trigMa = computeMA(prices, params.triggerLen, params.triggerMAType as MAType, params.maOpts);
  const bias = new Int8Array(n);
  const position = new Int8Array(n);
  const trades: TradeRecord[] = [];
  const equity = new Float64Array(n);
  let curEquity = 1;
  let activePos: "long" | "short" | null = null;
  let entryIdx = -1;
  let entryPrice = NaN;

  for (let i = 0; i < n; i++) {
    equity[i] = curEquity;
    const price = prices[i];
    const prevPrice = i > 0 ? prices[i - 1] : NaN;
    const trig = trigMa[i];
    const prevTrig = i > 0 ? trigMa[i - 1] : null;
    const biasVal = biasMa[i];

    let biasSignal = 0;
    if (Number.isFinite(price) && biasVal != null) {
      const slope = computeSlopeSignal(biasMa, i, params.slopeLookback, params.slopeMethod, prices, params.slopeMinPct);
      if (price > biasVal && slope === 1) biasSignal = 1;
      else if (price < biasVal && slope === -1 && params.allowShort) biasSignal = -1;
    }
    bias[i] = biasSignal;

    const hasData = i > 0 && Number.isFinite(price) && Number.isFinite(prevPrice) && trig != null && prevTrig != null;
    const crossUp = hasData && prevPrice <= (prevTrig as number) && price > (trig as number);
    const crossDown = hasData && prevPrice >= (prevTrig as number) && price < (trig as number);

    if (activePos === "long") {
      if (crossDown || biasSignal !== 1) {
        const ret = (price - entryPrice) / entryPrice;
        trades.push({ side: "long", entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
        curEquity *= 1 + ret;
        activePos = null; entryIdx = -1; entryPrice = NaN;
      }
    } else if (activePos === "short" && (crossUp || biasSignal !== -1)) {
      const ret = (entryPrice - price) / entryPrice;
      trades.push({ side: "short", entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
      curEquity *= 1 + ret;
      activePos = null; entryIdx = -1; entryPrice = NaN;
    }

    if (activePos === null) {
      if (biasSignal === 1 && crossUp) { activePos = "long"; entryIdx = i; entryPrice = price; }
      else if (biasSignal === -1 && crossDown && params.allowShort) { activePos = "short"; entryIdx = i; entryPrice = price; }
    }

    position[i] = activePos === "long" ? 1 : activePos === "short" ? -1 : 0;
    equity[i] = curEquity;
  }

  if (activePos !== null) {
    const i = n - 1;
    const price = prices[i];
    const ret = activePos === "long" ? (price - entryPrice) / entryPrice : (entryPrice - price) / entryPrice;
    trades.push({ side: activePos, entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
    curEquity *= 1 + ret;
    equity[i] = curEquity;
  }

  const stats = calcStats(trades, equity, position, prices, barsPerYear);
  return { params, trades, equity: Array.from(equity), bias, position, stats };
}

/** Bars/year for annualization at the page's resampled frequency
 *  (weekly_on_daily produces weekly bars). */
export function barsPerYearFor(frequency: string): number {
  return frequency.startsWith("monthly") ? 12 : frequency === "weekly" || frequency === "weekly_on_daily" ? 52 : 252;
}

// ── Grid search ──

export function runGridSearch(prices: number[], cfg: GridConfig, topK = 50, barsPerYear = 252): ParamResult[] {
  const results: ParamResult[] = [];
  for (const biasMAType of cfg.biasMATypes)
    for (const biasLen of cfg.biasLens)
      for (const triggerMAType of cfg.triggerMATypes)
        for (const triggerLen of cfg.triggerLens) {
          if (triggerLen >= biasLen) continue;
          for (const slopeMethod of cfg.slopeMethods) {
            const minPcts = slopeMethod === "diff_pct" ? cfg.slopeMinPcts : [0];
            for (const slopeLookback of cfg.slopeLookbacks)
              for (const slopeMinPct of minPcts)
                for (const allowShort of cfg.allowShortOptions) {
                  const params: DualMAParams = {
                    biasMAType, biasLen, triggerMAType, triggerLen,
                    slopeMethod, slopeLookback, slopeMinPct, allowShort,
                    maOpts: cfg.maOpts,
                  };
                  const result = runBacktest(prices, params, barsPerYear);
                  results.push({ params, stats: result.stats });
                }
          }
        }
  results.sort((a, b) => {
    const sa = Number.isFinite(a.stats.sharpe) ? a.stats.sharpe : -Infinity;
    const sb = Number.isFinite(b.stats.sharpe) ? b.stats.sharpe : -Infinity;
    return sb - sa;
  });
  return results.slice(0, topK);
}

export function paramsLabel(p: DualMAParams): string {
  const slopeStr =
    p.slopeMethod === "diff_pct"
      ? `${SLOPE_METHODS[p.slopeMethod]}(${p.slopeLookback}, ${(p.slopeMinPct * 100).toFixed(2)}%)`
      : `${SLOPE_METHODS[p.slopeMethod]}(${p.slopeLookback})`;
  return `${p.biasMAType}${p.biasLen}/${p.triggerMAType}${p.triggerLen} · ${slopeStr}${p.allowShort ? "" : " · long-only"}`;
}

// ── Async sweep wrapper (worker entry + page fallback) ──

export async function runDualMaSweep(prices: number[], cfg: GridConfig, topK = 50, barsPerYear = 252): Promise<ParamResult[]> {
  const results: ParamResult[] = [];
  for (const biasMAType of cfg.biasMATypes) {
    for (const biasLen of cfg.biasLens) {
      await yieldMain();
      for (const triggerMAType of cfg.triggerMATypes)
        for (const triggerLen of cfg.triggerLens) {
          if (triggerLen >= biasLen) continue;
          for (const slopeMethod of cfg.slopeMethods) {
            const minPcts = slopeMethod === "diff_pct" ? cfg.slopeMinPcts : [0];
            for (const slopeLookback of cfg.slopeLookbacks)
              for (const slopeMinPct of minPcts)
                for (const allowShort of cfg.allowShortOptions) {
                  const params: DualMAParams = {
                    biasMAType, biasLen, triggerMAType, triggerLen,
                    slopeMethod, slopeLookback, slopeMinPct, allowShort,
                    maOpts: cfg.maOpts,
                  };
                  const result = runBacktest(prices, params, barsPerYear);
                  results.push({ params, stats: result.stats });
                }
          }
        }
    }
  }
  results.sort((a, b) => {
    const sa = Number.isFinite(a.stats.sharpe) ? a.stats.sharpe : -Infinity;
    const sb = Number.isFinite(b.stats.sharpe) ? b.stats.sharpe : -Infinity;
    return sb - sa;
  });
  return results.slice(0, topK);
}
