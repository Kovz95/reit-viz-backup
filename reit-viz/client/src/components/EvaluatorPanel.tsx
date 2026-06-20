// Reconstructed from recovered-bundle/EvaluatorPanel-BcObXxAZ.js on 2026-06-11
import React from "react";
import {
  formatHitRate,
  hitRateColorClass,
  HORIZONS,
  fetchMetricSeries,
  fetchMacroSeriesBatch,
  buildSignalProfile,
  aggregateSignalProfiles,
} from "@/lib/signalUtils";
import { harsiCompute } from "@/lib/harsi";
import { tvaCompute } from "@/lib/tva";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceContext {
  prices: number[];
  highs?: number[] | null;
  lows?: number[] | null;
  volumes?: number[] | null;
  dates: string[];
  benchmarkPrices?: number[] | null;
  /** For pair mode — use legA ticker for fundamentals */
  mode?: string;
  pairLegA?: string | null;
}

export interface FeatureContext {
  prices: number[];
  highs?: number[] | null;
  lows?: number[] | null;
  volumes?: number[] | null;
  dates: string[];
  benchmarkPrices?: number[] | null;
  fundamentals: Record<string, (number | null)[]>;
  macro: Record<string, (number | null)[]>;
}

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
  category: string;
  format: "pct" | "bp" | "z" | "ratio" | "num";
  decimals: number;
  compute: (ctx: FeatureContext, idx: number) => number | null;
}

export interface FilterRule {
  featureId: string;
  op: ">" | "<" | ">=" | "<=";
  threshold: number;
}

export interface SignalProfile {
  signalIdx?: number;
  returns: Record<string, number | null>;
  hitTarget: Record<string, boolean>;
  hitBand?: Record<string, boolean>;
}

export interface SignalDetailRow {
  num: number;
  date: string;
  entryPrice: number;
  returns: Record<string, number | null>;
  hitTarget: Record<string, boolean>;
}

export interface HorizonRow {
  horizon: string;
  count: number;
  hitRate: number;
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  stdReturn: number;
  tStat: number;
  avgTrough: number;
}

export interface BacktestResult {
  count: number;
  rows: HorizonRow[];
  equityCurve: { date: string; cumReturn: number }[];
  signalCount: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  signals: SignalDetailRow[];
  profiles: SignalProfile[];
}

export interface FeatureAnalysisRow {
  feature: {
    id: string;
    label: string;
    description: string;
    category: string;
    format: string;
    decimals: number;
  };
  hitValues: number[];
  missValues: number[];
  hitN: number;
  missN: number;
  hitMedian: number;
  missMedian: number;
  hitP25: number;
  hitP75: number;
  missP25: number;
  missP75: number;
  medianSpread: number;
  cohensD: number;
  ks: number;
  ksPVal: number;
  auc: number;
  separationScore: number;
}

export interface HitConditionsAnalysis {
  totalSignals: number;
  hitCount: number;
  missCount: number;
  rows: FeatureAnalysisRow[];
  qValues: Record<string, number>;
}

export interface FilteredStats {
  retained: number;
  dropped: number;
  hitRate: number;
  baseHitRate: number;
  lift: number;
  retainedHits: number;
  retainedMisses: number;
}

// ---------------------------------------------------------------------------
// Rolling math helpers
// ---------------------------------------------------------------------------

function rollingMean(prices: number[], i: number, n: number): number | null {
  if (i < n - 1) return null;
  let sum = 0;
  for (let k = i - n + 1; k <= i; k++) {
    if (!Number.isFinite(prices[k])) return null;
    sum += prices[k];
  }
  return sum / n;
}

function rollingVolRaw(prices: number[], i: number, n: number): number | null {
  if (i < n) return null;
  const rets: number[] = [];
  for (let k = i - n + 1; k <= i; k++) {
    const prev = prices[k - 1];
    const cur = prices[k];
    if (!(prev > 0) || !Number.isFinite(cur)) return null;
    rets.push((cur - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length;
  return Math.sqrt(variance);
}

function rollingVolAnnualized(prices: number[], i: number, n: number): number | null {
  const v = rollingVolRaw(prices, i, n);
  return v === null ? null : v * Math.sqrt(252);
}

function rsi(prices: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let gain = 0;
  let loss = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const diff = prices[k] - prices[k - 1];
    if (diff > 0) gain += diff;
    else loss += -diff;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(
  closes: number[],
  highs: number[],
  lows: number[],
  i: number,
  period = 14
): number | null {
  if (i < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const h = highs[k];
    const l = lows[k];
    const prevC = closes[k - 1];
    if (![h, l, prevC].every(Number.isFinite)) return null;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    sum += tr;
  }
  return sum / period;
}

function macdHistogram(prices: number[], i: number): number | null {
  if (i < 34) return null;
  const emaFast = 2 / 13;
  const emaSlow = 2 / 27;
  const macdLine: number[] = [];

  let fast = 0;
  let slow = 0;
  for (let k = 0; k < 12; k++) fast += prices[k];
  fast /= 12;
  for (let k = 0; k < 26; k++) slow += prices[k];
  slow /= 26;

  for (let k = 26; k <= i; k++) {
    if (!Number.isFinite(prices[k])) return null;
    fast = prices[k] * emaFast + fast * (1 - emaFast);
    slow = prices[k] * emaSlow + slow * (1 - emaSlow);
    macdLine.push(fast - slow);
  }
  if (macdLine.length < 9) return null;

  const sigSmoothing = 2 / 10;
  let signal = 0;
  for (let k = 0; k < 9; k++) signal += macdLine[k];
  signal /= 9;
  for (let k = 9; k < macdLine.length; k++) {
    signal = macdLine[k] * sigSmoothing + signal * (1 - sigSmoothing);
  }
  return macdLine[macdLine.length - 1] - signal;
}

function stochK(
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  period = 14
): number | null {
  if (i < period - 1) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = i - period + 1; k <= i; k++) {
    if (!Number.isFinite(highs[k]) || !Number.isFinite(lows[k])) return null;
    if (highs[k] > hi) hi = highs[k];
    if (lows[k] < lo) lo = lows[k];
  }
  return hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
}

function drawdownFromHigh(prices: number[], i: number, n: number): number | null {
  if (i < n - 1) return null;
  let peak = -Infinity;
  for (let k = i - n + 1; k <= i; k++) {
    if (!Number.isFinite(prices[k])) return null;
    if (prices[k] > peak) peak = prices[k];
  }
  return peak > 0 ? prices[i] / peak - 1 : null;
}

function lastFundamental(
  arr: (number | null)[] | undefined,
  i: number,
  lookback = 252
): number | null {
  if (!arr) return null;
  const start = Math.max(0, i - lookback);
  for (let k = i; k >= start; k--) {
    const v = arr[k];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function fundamentalChange(
  arr: (number | null)[] | undefined,
  i: number,
  n: number
): number | null {
  const cur = lastFundamental(arr, i);
  const prev = lastFundamental(arr, i - n);
  return cur === null || prev === null ? null : cur - prev;
}

function rollingFundamentalZScore(
  arr: (number | null)[] | undefined,
  i: number,
  n: number
): number | null {
  if (!arr) return null;
  const start = Math.max(0, i - n + 1);
  const vals: number[] = [];
  for (let k = start; k <= i; k++) {
    const v = arr[k];
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < Math.max(20, n / 4)) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
  const sd = Math.sqrt(variance);
  if (!(sd > 0)) return null;
  const cur = lastFundamental(arr, i);
  return cur === null ? null : (cur - mean) / sd;
}

function priceReturn(prices: number[], i: number, n: number): number | null {
  const prev = prices[i - n];
  const cur = prices[i];
  return !(prev > 0) || !Number.isFinite(cur) ? null : cur / prev - 1;
}

function distFromSma(prices: number[], i: number, n: number): number | null {
  const sma = rollingMean(prices, i, n);
  return sma === null || !(sma > 0) || !Number.isFinite(prices[i]) ? null : prices[i] / sma - 1;
}

// ---------------------------------------------------------------------------
// HARSI / TVA caches
// ---------------------------------------------------------------------------

const harsiCache = new WeakMap<number[], ReturnType<typeof harsiCompute> | null>();
const tvaCache = new WeakMap<number[], ReturnType<typeof tvaCompute> | null>();

function getHarsi(ctx: FeatureContext): ReturnType<typeof harsiCompute> | null {
  const cached = harsiCache.get(ctx.prices);
  if (cached !== undefined) return cached;
  if (!ctx.highs || !ctx.lows || ctx.highs.length !== ctx.prices.length) {
    harsiCache.set(ctx.prices, null);
    return null;
  }
  try {
    const result = harsiCompute(ctx.prices, ctx.highs, ctx.lows, {
      candleLength: 14,
      candleSmoothing: 1,
      rsiLength: 7,
      rsiSmoothed: true,
      stochLength: 14,
      smoothK: 3,
      smoothD: 3,
      stochFit: 80,
    });
    harsiCache.set(ctx.prices, result);
    return result;
  } catch {
    harsiCache.set(ctx.prices, null);
    return null;
  }
}

function getTva(ctx: FeatureContext): ReturnType<typeof tvaCompute> | null {
  const cached = tvaCache.get(ctx.prices);
  if (cached !== undefined) return cached;
  if (!ctx.volumes || ctx.volumes.length !== ctx.prices.length) {
    tvaCache.set(ctx.prices, null);
    return null;
  }
  let validCount = 0;
  for (let k = 0; k < ctx.volumes.length; k++) {
    if (Number.isFinite(ctx.volumes[k]) && ctx.volumes[k]! > 0) {
      validCount++;
      if (validCount >= 30) break;
    }
  }
  if (validCount < 30) {
    tvaCache.set(ctx.prices, null);
    return null;
  }
  try {
    const result = tvaCompute(ctx.prices, ctx.volumes as number[], 15, 3, 5);
    tvaCache.set(ctx.prices, result);
    return result;
  } catch {
    tvaCache.set(ctx.prices, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Color flip recency helper
// ---------------------------------------------------------------------------

function colorFlipRecency(
  signalArr: (number | null)[],
  i: number,
  lookback: number
): number | null {
  if (!signalArr || i < 1 || i >= signalArr.length) return null;
  const cur = signalArr[i];
  const sign = (v: number | null | undefined): number => {
    if (v == null || !Number.isFinite(v as number)) return 0;
    const n = v as number;
    return n > 0 ? 1 : n < 0 ? -1 : 0;
  };
  const curSign = sign(cur);
  if (curSign === 0) return null;
  const start = Math.max(0, i - lookback);
  for (let k = i - 1; k >= start; k--) {
    const s = sign(signalArr[k]);
    if (s !== 0 && s !== curSign) return i - k;
  }
  return lookback + 1;
}

// ---------------------------------------------------------------------------
// Feature definitions (35 features across 6 categories)
// ---------------------------------------------------------------------------

const FEATURES: FeatureDef[] = [
  {
    id: "ret_1m",
    label: "Trailing 1M return",
    description: "Price change over the last 21 trading days",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => priceReturn(ctx.prices, i, 21),
  },
  {
    id: "ret_3m",
    label: "Trailing 3M return",
    description: "Price change over the last 63 trading days",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => priceReturn(ctx.prices, i, 63),
  },
  {
    id: "ret_6m",
    label: "Trailing 6M return",
    description: "Price change over the last 126 trading days",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => priceReturn(ctx.prices, i, 126),
  },
  {
    id: "ret_1y",
    label: "Trailing 1Y return",
    description: "Price change over the last 252 trading days",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => priceReturn(ctx.prices, i, 252),
  },
  {
    id: "rv_21",
    label: "Realized vol 1M (annualized)",
    description: "Std dev of daily returns over last 21 days, * sqrt(252)",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => rollingVolAnnualized(ctx.prices, i, 21),
  },
  {
    id: "rv_63",
    label: "Realized vol 3M (annualized)",
    description: "Std dev of daily returns over last 63 days, * sqrt(252)",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => rollingVolAnnualized(ctx.prices, i, 63),
  },
  {
    id: "dist_50d",
    label: "Distance from 50d MA",
    description: "(price / 50d-SMA) - 1",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => distFromSma(ctx.prices, i, 50),
  },
  {
    id: "dist_200d",
    label: "Distance from 200d MA",
    description: "(price / 200d-SMA) - 1",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => distFromSma(ctx.prices, i, 200),
  },
  {
    id: "dd_252",
    label: "Drawdown from 1Y high",
    description: "(price - max(price, 252 bars)) / max",
    category: "price-action",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => drawdownFromHigh(ctx.prices, i, 252),
  },
  {
    id: "rsi_14",
    label: "RSI(14)",
    description: "Relative Strength Index over 14 bars",
    category: "technical",
    format: "num",
    decimals: 1,
    compute: (ctx, i) => rsi(ctx.prices, i, 14),
  },
  {
    id: "atr_14_pct",
    label: "ATR(14) / price",
    description: "Average True Range as % of price",
    category: "technical",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => {
      if (!ctx.highs || !ctx.lows) return null;
      const atrVal = atr(ctx.prices, ctx.highs, ctx.lows, i, 14);
      return atrVal === null || !(ctx.prices[i] > 0) ? null : atrVal / ctx.prices[i];
    },
  },
  {
    id: "macd_hist",
    label: "MACD histogram",
    description: "MACD(12,26) − signal(9), in price units",
    category: "technical",
    format: "num",
    decimals: 3,
    compute: (ctx, i) => macdHistogram(ctx.prices, i),
  },
  {
    id: "stoch_k_14",
    label: "Stochastic %K(14)",
    description: "Position of close in 14-bar high-low range, 0-100",
    category: "technical",
    format: "num",
    decimals: 1,
    compute: (ctx, i) =>
      !ctx.highs || !ctx.lows ? null : stochK(ctx.highs, ctx.lows, ctx.prices, i, 14),
  },
  {
    id: "harsi_color",
    label: "HARSI candle color (+1 green / −1 red)",
    description:
      "Sign of HARSI haClose − haOpen at signal bar (defaults: candle 14, smoothing 1).",
    category: "technical",
    format: "num",
    decimals: 0,
    compute: (ctx, i) => {
      const h = getHarsi(ctx);
      if (!h) return null;
      const haClose = h.haClose[i];
      const haOpen = h.haOpen[i];
      if (haClose === null || haOpen === null) return null;
      const diff = haClose - haOpen;
      return Number.isFinite(diff) ? (diff > 0 ? 1 : diff < 0 ? -1 : 0) : null;
    },
  },
  {
    id: "harsi_color_flip_recency",
    label: "HARSI color flip recency (bars)",
    description:
      "Bars since the last green↔red color flip (sign change of haClose−haOpen). Lookback 60 bars; 61 = no flip in window. Low value = recent flip.",
    category: "technical",
    format: "num",
    decimals: 0,
    compute: (ctx, i) => {
      const h = getHarsi(ctx);
      if (!h) return null;
      const diffArr: (number | null)[] = new Array(i + 1);
      for (let k = Math.max(0, i - 60); k <= i; k++) {
        const haClose = h.haClose[k];
        const haOpen = h.haOpen[k];
        diffArr[k] = haClose !== null && haOpen !== null ? haClose - haOpen : null;
      }
      return colorFlipRecency(diffArr, i, 60);
    },
  },
  {
    id: "tva_os_sign",
    label: "TVA regime (+1 bull / −1 bear)",
    description:
      "Sign of TVA oscillator os = WMA(close,15) − SMA(close,15). Requires volumes; null without them.",
    category: "technical",
    format: "num",
    decimals: 0,
    compute: (ctx, i) => {
      const t = getTva(ctx);
      if (!t) return null;
      const os = t.os[i];
      return os == null || !Number.isFinite(os) ? null : os > 0 ? 1 : os < 0 ? -1 : 0;
    },
  },
  {
    id: "tva_regime_flip_recency",
    label: "TVA regime flip recency (bars)",
    description:
      "Bars since the last TVA regime shift (sign change of os). Lookback 60 bars; 61 = no flip in window. Low value = recent regime change. Requires volumes.",
    category: "technical",
    format: "num",
    decimals: 0,
    compute: (ctx, i) => {
      const t = getTva(ctx);
      return t ? colorFlipRecency(t.os as (number | null)[], i, 60) : null;
    },
  },
  {
    id: "p_ffo_fy2",
    label: "P/FFO FY2",
    description: "Forward FY2 price-to-FFO multiple",
    category: "valuation",
    format: "ratio",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["P/FFO FY2"], i),
  },
  {
    id: "ffo_yield_fy2",
    label: "FFO Yield FY2",
    description: "1 / P/FFO FY2",
    category: "valuation",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["FFO Yield FY2"], i),
  },
  {
    id: "div_yield",
    label: "Dividend Yield",
    description: "Trailing dividend yield",
    category: "valuation",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["Dividend Yield"], i),
  },
  {
    id: "ev_ebitda_fy2",
    label: "EV/EBITDA FY2",
    description: "Forward FY2 EV/EBITDA",
    category: "valuation",
    format: "ratio",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["EV/EBITDA FY2"], i),
  },
  {
    id: "ev_ebitda_z_252",
    label: "EV/EBITDA z-score (1Y)",
    description: "z-score of EV/EBITDA FY2 vs trailing 252-bar window",
    category: "valuation",
    format: "z",
    decimals: 2,
    compute: (ctx, i) => rollingFundamentalZScore(ctx.fundamentals["EV/EBITDA FY2"], i, 252),
  },
  {
    id: "p_ffo_z_252",
    label: "P/FFO z-score (1Y)",
    description: "z-score of P/FFO FY2 vs trailing 252-bar window",
    category: "valuation",
    format: "z",
    decimals: 2,
    compute: (ctx, i) => rollingFundamentalZScore(ctx.fundamentals["P/FFO FY2"], i, 252),
  },
  {
    id: "off_52w_high",
    label: "% off 52wk High",
    description: "From workbook: percent off the trailing 52-week high",
    category: "valuation",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["% off 52wk High"], i),
  },
  {
    id: "off_52w_low",
    label: "% off 52wk Low",
    description: "From workbook: percent off the trailing 52-week low",
    category: "valuation",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["% off 52wk Low"], i),
  },
  {
    id: "fy1_eps_growth",
    label: "FY1 EPS Growth",
    description: "Consensus FY1 EPS growth",
    category: "fundamentals",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["FY1 EPS Growth"], i),
  },
  {
    id: "fy2_ffo_growth",
    label: "FY2 FFO Growth",
    description: "Consensus FY2 FFO growth",
    category: "fundamentals",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["FY2 FFO Growth"], i),
  },
  {
    id: "ffo_fy2_3m_chg",
    label: "FFO FY2 3M revision",
    description: "Change in FFO FY2 estimate over last 63 bars",
    category: "fundamentals",
    format: "num",
    decimals: 3,
    compute: (ctx, i) => fundamentalChange(ctx.fundamentals["FFO FY2"], i, 63),
  },
  {
    id: "short_interest",
    label: "Short Interest %",
    description: "Short interest as % of float",
    category: "sentiment",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.fundamentals["Short Interest%"], i),
  },
  {
    id: "buy_minus_sell_ratings",
    label: "Buy − Sell ratings",
    description: "(Buy ratings − Sell ratings)",
    category: "sentiment",
    format: "num",
    decimals: 0,
    compute: (ctx, i) => {
      const buy = lastFundamental(ctx.fundamentals["Buy Ratings"], i);
      const sell = lastFundamental(ctx.fundamentals["Sell Ratings"], i);
      return buy === null || sell === null ? null : buy - sell;
    },
  },
  {
    id: "bull_minus_bear",
    label: "Bull% − Bear%",
    description: "AAII-style sentiment differential",
    category: "sentiment",
    format: "pct",
    decimals: 1,
    compute: (ctx, i) => {
      const bull = lastFundamental(ctx.fundamentals["Bull%"], i);
      const bear = lastFundamental(ctx.fundamentals["Bear%"], i);
      return bull === null || bear === null ? null : bull - bear;
    },
  },
  {
    id: "ust10",
    label: "10Y Treasury",
    description: "Constant-maturity 10Y yield (FRED DGS10)",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.macro["DGS10"] as (number | null)[], i),
  },
  {
    id: "ust10_1m_chg",
    label: "10Y change over 1M",
    description: "Δ DGS10 over 21 trading days, in pp",
    category: "macro",
    format: "bp",
    decimals: 0,
    compute: (ctx, i) => {
      const chg = fundamentalChange(ctx.macro["DGS10"] as (number | null)[], i, 21);
      return chg === null ? null : chg * 100;
    },
  },
  {
    id: "yc_2s10s",
    label: "2s10s spread",
    description: "DGS10 − DGS2 (FRED computed)",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) =>
      lastFundamental(ctx.macro["SPREAD_10Y_2Y"] as (number | null)[], i),
  },
  {
    id: "ig_oas",
    label: "IG OAS",
    description: "BAML US IG corporate option-adjusted spread",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) =>
      lastFundamental(ctx.macro["BAMLC0A0CM"] as (number | null)[], i),
  },
  {
    id: "hy_oas",
    label: "HY OAS",
    description: "BAML US HY corporate option-adjusted spread",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) =>
      lastFundamental(ctx.macro["BAMLH0A0HYM2"] as (number | null)[], i),
  },
  {
    id: "vix",
    label: "VIX",
    description: "CBOE Volatility Index level",
    category: "macro",
    format: "num",
    decimals: 1,
    compute: (ctx, i) => lastFundamental(ctx.macro["VIXCLS"] as (number | null)[], i),
  },
  {
    id: "real_10y",
    label: "10Y real yield",
    description: "10Y TIPS yield (DFII10)",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.macro["DFII10"] as (number | null)[], i),
  },
  {
    id: "breakeven_10y",
    label: "10Y breakeven",
    description: "10Y inflation breakeven (T10YIE)",
    category: "macro",
    format: "pct",
    decimals: 2,
    compute: (ctx, i) => lastFundamental(ctx.macro["T10YIE"] as (number | null)[], i),
  },
];

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return sorted[lo + 1] !== undefined ? sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}

function ksStat(a: number[], b: number[]): number {
  const sa = a.filter(Number.isFinite).sort((x, y) => x - y);
  const sb = b.filter(Number.isFinite).sort((x, y) => x - y);
  if (sa.length === 0 || sb.length === 0) return 0;
  let i = 0;
  let j = 0;
  let maxD = 0;
  while (i < sa.length && j < sb.length) {
    const va = sa[i];
    const vb = sb[j];
    if (va <= vb) i++;
    else j++;
    const da = i / sa.length;
    const db = j / sb.length;
    const diff = Math.abs(da - db);
    if (diff > maxD) maxD = diff;
  }
  return maxD;
}

function ksPValue(d: number, n1: number, n2: number): number {
  if (n1 < 1 || n2 < 1) return 1;
  const n = (n1 * n2) / (n1 + n2);
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * d;
  let sum = 0;
  let prev = 0;
  let converged = false;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += term;
    if (k > 1 && Math.abs(term) < 1e-10 && Math.abs(prev) < 1e-10) {
      converged = true;
      break;
    }
    prev = term;
  }
  if (!converged) sum = sum >= 0 ? sum : 0;
  if (sum < 0) sum = 0;
  if (sum > 1) sum = 1;
  return sum;
}

function auc(hits: number[], misses: number[]): number {
  const a = hits.filter(Number.isFinite);
  const b = misses.filter(Number.isFinite);
  if (a.length === 0 || b.length === 0) return 0.5;
  const all = a.map((x) => ({ x, g: 1 })).concat(b.map((x) => ({ x, g: 0 })));
  all.sort((u, v) => u.x - v.x);
  let pos = 0;
  let rankSum = 0;
  while (pos < all.length) {
    let end = pos;
    while (end + 1 < all.length && all[end + 1].x === all[pos].x) end++;
    const avgRank = (pos + end) / 2 + 1;
    for (let k = pos; k <= end; k++) {
      if (all[k].g === 1) rankSum += avgRank;
    }
    pos = end + 1;
  }
  return (rankSum - (a.length * (a.length + 1)) / 2) / (a.length * b.length);
}

function cohensD(a: number[], b: number[]): number {
  const na = a.filter(Number.isFinite);
  const nb = b.filter(Number.isFinite);
  if (na.length === 0 || nb.length === 0) return 0;
  const meanA = na.reduce((s, v) => s + v, 0) / na.length;
  const meanB = nb.reduce((s, v) => s + v, 0) / nb.length;
  const varA = na.reduce((s, v) => s + (v - meanA) * (v - meanA), 0) / na.length;
  const varB = nb.reduce((s, v) => s + (v - meanB) * (v - meanB), 0) / nb.length;
  const pooledSd = Math.sqrt((varA * na.length + varB * nb.length) / (na.length + nb.length));
  return pooledSd > 0 ? (meanA - meanB) / pooledSd : 0;
}

function bhCorrection(pValues: number[]): number[] {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(n);
  let runMin = 1;
  for (let k = indexed.length - 1; k >= 0; k--) {
    const { p, i } = indexed[k];
    const q = Math.min(runMin, (p * n) / (k + 1));
    adjusted[i] = q;
    runMin = q;
  }
  return adjusted;
}

// ---------------------------------------------------------------------------
// Core analysis functions
// ---------------------------------------------------------------------------

function analyzeHitConditions(params: {
  signals: SignalProfile[];
  horizon: string;
  useBand: boolean;
  context: FeatureContext;
  minSamples?: number;
  features?: FeatureDef[];
}): HitConditionsAnalysis {
  const features = params.features ?? FEATURES;
  const minSamples = params.minSamples ?? 5;
  const hits: SignalProfile[] = [];
  const misses: SignalProfile[] = [];
  for (const sig of params.signals) {
    if (sig.signalIdx === undefined) continue;
    const hit = params.useBand
      ? sig.hitBand?.[params.horizon]
      : sig.hitTarget[params.horizon];
    hit ? hits.push(sig) : misses.push(sig);
  }
  const rows: FeatureAnalysisRow[] = [];
  const rawPValues: number[] = [];

  for (const feat of features) {
    const hitVals: number[] = [];
    const missVals: number[] = [];
    for (const sig of hits) {
      const v = feat.compute(params.context, sig.signalIdx!);
      if (v !== null && Number.isFinite(v)) hitVals.push(v);
    }
    for (const sig of misses) {
      const v = feat.compute(params.context, sig.signalIdx!);
      if (v !== null && Number.isFinite(v)) missVals.push(v);
    }
    if (hitVals.length < minSamples || missVals.length < minSamples) continue;
    const hitMedian = median(hitVals);
    const missMedian = median(missVals);
    const ks = ksStat(hitVals, missVals);
    const ksPVal = ksPValue(ks, hitVals.length, missVals.length);
    const row: FeatureAnalysisRow = {
      feature: {
        id: feat.id,
        label: feat.label,
        description: feat.description,
        category: feat.category,
        format: feat.format,
        decimals: feat.decimals,
      },
      hitValues: hitVals,
      missValues: missVals,
      hitN: hitVals.length,
      missN: missVals.length,
      hitMedian,
      missMedian,
      hitP25: percentile(hitVals, 0.25),
      hitP75: percentile(hitVals, 0.75),
      missP25: percentile(missVals, 0.25),
      missP75: percentile(missVals, 0.75),
      medianSpread: hitMedian - missMedian,
      cohensD: cohensD(hitVals, missVals),
      ks,
      ksPVal,
      auc: auc(hitVals, missVals),
      separationScore: ks * Math.sqrt(Math.min(hitVals.length, missVals.length)),
    };
    rows.push(row);
    rawPValues.push(ksPVal);
  }

  const qArr = bhCorrection(rawPValues);
  const qValues: Record<string, number> = {};
  rows.forEach((r, idx) => {
    qValues[r.feature.id] = qArr[idx];
  });
  rows.sort((a, b) => b.separationScore - a.separationScore);

  return {
    totalSignals: hits.length + misses.length,
    hitCount: hits.length,
    missCount: misses.length,
    rows,
    qValues,
  };
}

function aggregateFiltered(
  signals: SignalProfile[],
  horizon: string,
  useBand: boolean,
  filters: FilterRule[],
  context: FeatureContext,
  features: FeatureDef[] = FEATURES
): FilteredStats {
  const featMap = new Map(features.map((f) => [f.id, f]));
  let retained = 0;
  let retainedHits = 0;
  let retainedMisses = 0;
  let dropped = 0;
  let totalHits = 0;
  let total = 0;

  for (const sig of signals) {
    if (sig.signalIdx === undefined) continue;
    total++;
    const isHit = useBand ? sig.hitBand?.[horizon] : sig.hitTarget[horizon];
    if (isHit) totalHits++;
    let pass = true;
    for (const rule of filters) {
      const feat = featMap.get(rule.featureId);
      if (!feat) { pass = false; break; }
      const val = feat.compute(context, sig.signalIdx);
      if (val === null || !Number.isFinite(val)) { pass = false; break; }
      switch (rule.op) {
        case ">": if (!(val > rule.threshold)) pass = false; break;
        case "<": if (!(val < rule.threshold)) pass = false; break;
        case ">=": if (!(val >= rule.threshold)) pass = false; break;
        case "<=": if (!(val <= rule.threshold)) pass = false; break;
      }
      if (!pass) break;
    }
    if (pass) {
      retained++;
      isHit ? retainedHits++ : retainedMisses++;
    } else {
      dropped++;
    }
  }

  const hitRate = retained > 0 ? retainedHits / retained : 0;
  const baseHitRate = total > 0 ? totalHits / total : 0;
  return {
    retained,
    dropped,
    hitRate,
    baseHitRate,
    lift: baseHitRate > 0 ? hitRate / baseHitRate : 0,
    retainedHits,
    retainedMisses,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatValue(
  val: number | null | undefined,
  format: string,
  decimals = 1
): string {
  if (val == null || !Number.isFinite(val)) return "—";
  switch (format) {
    case "pct":
      return (val * 100).toFixed(decimals) + "%";
    case "bp":
      return val.toFixed(decimals) + " bp";
    case "z":
      return (val >= 0 ? "+" : "") + val.toFixed(decimals);
    case "ratio":
      return val.toFixed(decimals) + "×";
    default:
      return val.toFixed(decimals);
  }
}

function formatSpread(
  val: number | null | undefined,
  format: string,
  decimals = 1
): string {
  if (!Number.isFinite(val as number)) return "—";
  const v = val as number;
  switch (format) {
    case "pct":
      return (v >= 0 ? "+" : "") + (v * 100).toFixed(decimals) + "pp";
    case "bp":
      return (v >= 0 ? "+" : "") + v.toFixed(decimals) + " bp";
    case "z":
      return (v >= 0 ? "+" : "") + v.toFixed(decimals);
    case "ratio":
      return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "×";
    default:
      return (v >= 0 ? "+" : "") + v.toFixed(decimals);
  }
}

function formatPVal(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "<0.001";
  if (p < 0.01 || p < 1) return p.toFixed(3);
  return p.toFixed(2);
}

function formatPct(val: number, decimals = 1): string {
  return Number.isFinite(val) ? `${(val * 100).toFixed(decimals)}%` : "—";
}

function formatFixed(val: number): string {
  return Number.isFinite(val) ? val.toFixed(2) : "—";
}

const CATEGORY_COLORS: Record<string, string> = {
  "price-action": "bg-sky-500/15 text-sky-300",
  technical: "bg-violet-500/15 text-violet-300",
  valuation: "bg-emerald-500/15 text-emerald-300",
  fundamentals: "bg-amber-500/15 text-amber-300",
  sentiment: "bg-pink-500/15 text-pink-300",
  macro: "bg-orange-500/15 text-orange-300",
};

const OP_LABELS: Record<string, string> = {
  ">": "greater than",
  "<": "less than",
  ">=": "≥",
  "<=": "≤",
};

const HORIZON_LABELS = (HORIZONS as { label: string }[]).map((h) => h.label);

function aucColorClass(val: number): string {
  const dist = Math.abs(val - 0.5);
  if (dist > 0.25) return "text-emerald-400 font-bold";
  if (dist > 0.15) return "text-emerald-300";
  if (dist > 0.08) return "text-yellow-300";
  return "text-muted-foreground";
}

function cohensColorClass(val: number): string {
  const abs = Math.abs(val);
  if (abs > 0.8) return "text-emerald-400 font-bold";
  if (abs > 0.5) return "text-emerald-300";
  if (abs > 0.2) return "text-yellow-300";
  return "text-muted-foreground";
}

function niceStep(range: number, targetTicks = 5): number {
  if (!isFinite(range) || range <= 0) return 1;
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

// ---------------------------------------------------------------------------
// Mini distribution bar (violin proxy)
// ---------------------------------------------------------------------------

interface DistBarProps {
  p25: number;
  p75: number;
  median: number;
  lo: number;
  hi: number;
  color: string;
}

function DistBar({ p25, p75, median: med, lo, hi, color }: DistBarProps) {
  const range = hi - lo;
  if (!(range > 0)) {
    return <div className="h-2 w-24 bg-muted/20" />;
  }
  const toPercent = (v: number) => Math.max(0, Math.min(100, ((v - lo) / range) * 100));
  return (
    <div className="relative h-2 w-24 bg-muted/15 rounded-sm">
      <div
        className={`absolute h-2 ${color} rounded-sm`}
        style={{ left: `${toPercent(p25)}%`, width: `${toPercent(p75) - toPercent(p25)}%` }}
      />
      <div
        className="absolute h-2 w-[2px] bg-white/80"
        style={{ left: `${toPercent(med)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HitRate badge
// ---------------------------------------------------------------------------

function HitRateBadge({ value }: { value: number }) {
  let cls = "bg-red-500/15 text-red-300 border-red-500/30";
  if (value >= 0.55) cls = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  else if (value >= 0.4) cls = "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded border ${cls}`}>
      {formatPct(value, 0)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TStatBadge
// ---------------------------------------------------------------------------

function TStatBadge({ value }: { value: number }) {
  const abs = Math.abs(value);
  let cls = "text-muted-foreground";
  if (abs >= 2) cls = "text-emerald-400 font-semibold";
  else if (abs >= 1.5) cls = "text-amber-300";
  return <span className={cls}>{formatFixed(value)}</span>;
}

// ---------------------------------------------------------------------------
// EquityCurveChart
// ---------------------------------------------------------------------------

interface EquityCurveChartProps {
  result: BacktestResult;
}

function EquityCurveChart({ result }: EquityCurveChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 720);
    return () => ro.disconnect();
  }, []);

  const curve = result.equityCurve;

  const layout = React.useMemo(() => {
    const W = Math.max(320, Math.floor(width));
    const H = 220;
    const padL = 52;
    const padR = 16;
    const padT = 14;
    const padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const returns = curve.map((p) => p.cumReturn);
    const yLo = Math.min(0, ...returns.length ? returns : [0]);
    const yHi = Math.max(0, ...returns.length ? returns : [0]);
    const pad = (yHi - yLo || 0.01) * 0.08;
    const yLoP = yLo - pad;
    const yHiP = yHi + pad;
    const yRange = yHiP - yLoP || 1;
    const xToPx = (i: number) =>
      curve.length <= 1 ? padL + innerW / 2 : padL + (i / (curve.length - 1)) * innerW;
    const yToPx = (v: number) => padT + innerH - ((v - yLoP) / yRange) * innerH;
    const step = niceStep(yRange, 5);
    const tickStart = Math.ceil(yLoP / step) * step;
    const ticks: number[] = [];
    for (let v = tickStart; v <= yHiP + 1e-9; v += step) {
      ticks.push(Number(v.toFixed(10)));
    }
    return { W, H, padL, padR, padT, padB, innerW, innerH, xToPx, yToPx, yTicks: ticks, yLo: yLoP, yHi: yHiP };
  }, [width, curve]);

  if (curve.length < 1) {
    return (
      <div
        ref={containerRef}
        className="h-[220px] flex items-center justify-center text-xs text-muted-foreground"
      >
        Not enough signals to plot equity curve.
      </div>
    );
  }

  const { W, H, padL, padR, padT, padB, innerW, innerH, xToPx, yToPx, yTicks } = layout;
  const linePath = curve
    .map((pt, i) => `${i === 0 ? "M" : "L"}${xToPx(i)},${yToPx(pt.cumReturn)}`)
    .join(" ");
  const lastReturn = curve[curve.length - 1].cumReturn;
  const lineColor = lastReturn >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
  const fillColor =
    lastReturn >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)";
  const zeroY = yToPx(0);
  const fillPath = `${curve
    .map((pt, i) => `${i === 0 ? "M" : "L"}${xToPx(i)},${yToPx(pt.cumReturn)}`)
    .join(" ")} L${xToPx(curve.length - 1)},${zeroY} L${xToPx(0)},${zeroY} Z`;

  const xLabelIdxs = (() => {
    if (curve.length <= 1) return [0];
    const count = Math.min(5, curve.length);
    const set = new Set<number>();
    for (let k = 0; k < count; k++) {
      set.add(Math.round((k / (count - 1)) * (curve.length - 1)));
    }
    return Array.from(set).sort((a, b) => a - b);
  })();

  return (
    <div ref={containerRef} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        style={{ maxWidth: "100%" }}
      >
        {yTicks.map((tick, idx) => {
          const py = yToPx(tick);
          const isZero = Math.abs(tick) < 1e-9;
          return (
            <g key={`y-${idx}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={py}
                y2={py}
                stroke={isZero ? "rgb(113 113 122)" : "rgb(63 63 70)"}
                strokeWidth={isZero ? 1 : 0.6}
                strokeDasharray={isZero ? undefined : "2,3"}
              />
              <text
                x={padL - 6}
                y={py + 3}
                textAnchor="end"
                fontSize={10}
                fill="rgb(161 161 170)"
                fontFamily="ui-monospace,monospace"
              >
                {formatPct(tick, 0)}
              </text>
            </g>
          );
        })}
        <line
          x1={padL}
          x2={W - padR}
          y1={padT + innerH}
          y2={padT + innerH}
          stroke="rgb(82 82 91)"
          strokeWidth={0.8}
        />
        {xLabelIdxs.map((i) => {
          const px = xToPx(i);
          const isLast = i === curve.length - 1;
          const anchor = i === 0 ? "start" : isLast ? "end" : "middle";
          return (
            <text
              key={`x-${i}`}
              x={px}
              y={padT + innerH + 16}
              textAnchor={anchor}
              fontSize={10}
              fill="rgb(161 161 170)"
              fontFamily="ui-monospace,monospace"
            >
              {curve[i].date}
            </text>
          );
        })}
        <path d={fillPath} fill={fillColor} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {curve.length <= 80 &&
          curve.map((pt, i) => (
            <circle
              key={`d-${i}`}
              cx={xToPx(i)}
              cy={yToPx(pt.cumReturn)}
              r={1.8}
              fill={lineColor}
            />
          ))}
        <text
          x={W - padR}
          y={padT}
          textAnchor="end"
          fontSize={11}
          fill={lineColor}
          fontFamily="ui-monospace,monospace"
          fontWeight={600}
        >
          {`cum ${formatPct(lastReturn, 1)} · n=${curve.length}`}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalStatsTable
// ---------------------------------------------------------------------------

interface SignalStatsTableProps {
  rows: HorizonRow[];
}

function SignalStatsTable({ rows }: SignalStatsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left px-2 py-1 font-medium">Horizon</th>
            <th className="text-right px-2 py-1 font-medium">N</th>
            <th
              className="text-right px-2 py-1 font-medium"
              title="% of signals reaching the target return threshold within the horizon"
            >
              Hit
            </th>
            <th
              className="text-right px-2 py-1 font-medium"
              title="% of signals with positive directional endpoint return"
            >
              Win
            </th>
            <th className="text-right px-2 py-1 font-medium">Avg</th>
            <th className="text-right px-2 py-1 font-medium">Median</th>
            <th
              className="text-right px-2 py-1 font-medium"
              title="Std-dev of endpoint returns"
            >
              Std
            </th>
            <th
              className="text-right px-2 py-1 font-medium"
              title="t-stat = avg / (std / sqrt(n)). |t|≥2 ≈ 95% significance."
            >
              t
            </th>
            <th
              className="text-right px-2 py-1 font-medium"
              title="Average max drawdown (trough) within the horizon"
            >
              Max DD
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.horizon} className="border-b border-border/50">
              <td className="px-2 py-1 font-mono text-foreground">{row.horizon}</td>
              <td className="text-right px-2 py-1 font-mono text-muted-foreground">
                {row.count}
              </td>
              <td className="text-right px-2 py-1">
                <HitRateBadge value={row.hitRate} />
              </td>
              <td className="text-right px-2 py-1 font-mono">
                {formatPct(row.winRate, 0)}
              </td>
              <td
                className={`text-right px-2 py-1 font-mono ${
                  row.avgReturn >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {formatPct(row.avgReturn)}
              </td>
              <td
                className={`text-right px-2 py-1 font-mono ${
                  row.medianReturn >= 0 ? "text-emerald-300/80" : "text-red-300/80"
                }`}
              >
                {formatPct(row.medianReturn)}
              </td>
              <td className="text-right px-2 py-1 font-mono text-muted-foreground">
                {formatPct(row.stdReturn, 1)}
              </td>
              <td className="text-right px-2 py-1 font-mono">
                <TStatBadge value={row.tStat} />
              </td>
              <td className="text-right px-2 py-1 font-mono text-red-300/80">
                {formatPct(row.avgTrough)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalDetailTable
// ---------------------------------------------------------------------------

interface SignalDetailTableProps {
  signals: SignalDetailRow[];
}

function SignalDetailTable({ signals }: SignalDetailTableProps) {
  const [open, setOpen] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<string>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const sorted = React.useMemo(() => {
    const copy = [...signals];
    copy.sort((a, b) => {
      let va: number;
      let vb: number;
      if (sortKey === "date") {
        va = a.num;
        vb = b.num;
      } else {
        va = a.returns[sortKey] ?? -Infinity;
        vb = b.returns[sortKey] ?? -Infinity;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return copy;
  }, [signals, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "asc" : "desc");
    }
  }

  function downloadCsv() {
    const header = [
      "#",
      "date",
      "entry",
      ...(HORIZONS as { label: string }[]).map((h) => h.label),
      ...(HORIZONS as { label: string }[]).map((h) => `${h.label}_hit`),
    ].join(",");
    const rows = signals.map((sig) => {
      const cells = [String(sig.num), sig.date, sig.entryPrice.toFixed(4)];
      for (const { label } of HORIZONS as { label: string }[]) {
        const v = sig.returns[label];
        cells.push(v == null ? "" : (v * 100).toFixed(4));
      }
      for (const { label } of HORIZONS as { label: string }[]) {
        cells.push(sig.hitTarget[label] ? "1" : "0");
      }
      return cells.join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `signals_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (signals.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/30 transition-colors"
        data-testid="toggle-signal-detail"
      >
        <span className="font-medium text-foreground">
          <span className="font-mono mr-2">{open ? "▼" : "▶"}</span>
          Per-signal detail · {signals.length} signal{signals.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">
          {open ? "hide" : "show entry dates and forward returns"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[10px] text-muted-foreground">
              Each row is one signal. Cells are endpoint returns at each horizon —
              green dot indicates the +/− target was touched intra-window.
            </div>
            <button
              type="button"
              onClick={downloadCsv}
              className="text-[10px] font-mono px-2 py-1 rounded border border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-card">
                <tr className="text-muted-foreground border-b border-border">
                  <th
                    className="text-right px-2 py-1 cursor-pointer hover:text-foreground"
                    onClick={() => handleSort("date")}
                  >
                    #{sortKey === "date" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="text-left px-2 py-1">Date</th>
                  <th className="text-right px-2 py-1">Entry</th>
                  {(HORIZONS as { label: string; days: number }[]).map((h) => (
                    <th
                      key={h.label}
                      className="text-right px-2 py-1 cursor-pointer hover:text-foreground"
                      onClick={() => handleSort(h.label)}
                      title={`Endpoint return at ${h.days} trading days. Click to sort.`}
                    >
                      {h.label}
                      {sortKey === h.label ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((sig) => (
                  <tr
                    key={sig.num}
                    className="border-b border-border/40 hover:bg-accent/20"
                  >
                    <td className="text-right px-2 py-1 text-muted-foreground">
                      {sig.num}
                    </td>
                    <td className="text-left px-2 py-1 text-foreground">{sig.date}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">
                      {sig.entryPrice.toFixed(2)}
                    </td>
                    {(HORIZONS as { label: string }[]).map((h) => {
                      const ret = sig.returns[h.label];
                      const hit = sig.hitTarget[h.label];
                      if (ret == null) {
                        return (
                          <td
                            key={h.label}
                            className="text-right px-2 py-1 text-muted-foreground/40"
                          >
                            —
                          </td>
                        );
                      }
                      const retClass = ret >= 0 ? "text-emerald-300" : "text-red-300";
                      return (
                        <td key={h.label} className="text-right px-2 py-1">
                          <span className={retClass}>
                            {(ret >= 0 ? "+" : "") + (ret * 100).toFixed(2) + "%"}
                          </span>
                          {hit && (
                            <span
                              className="ml-1 text-emerald-400"
                              title="Target hit intra-window"
                            >
                              ●
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HitConditionsTable (filter sandbox)
// ---------------------------------------------------------------------------

interface HitConditionsTableProps {
  signals: SignalProfile[];
  context: FeatureContext;
  defaultHorizon?: string;
  useBand?: boolean;
  direction?: "buy" | "sell";
  title?: string;
}

function HitConditionsTable({
  signals,
  context,
  defaultHorizon = "1M",
  useBand = false,
  direction = "buy",
  title,
}: HitConditionsTableProps) {
  const [horizon, setHorizon] = React.useState(defaultHorizon);
  const [minSamples, setMinSamples] = React.useState(5);
  const [filters, setFilters] = React.useState<FilterRule[]>([]);
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [sigFilter, setSigFilter] = React.useState("all");

  const analysis = React.useMemo(
    () =>
      analyzeHitConditions({
        signals,
        horizon,
        useBand,
        context,
        minSamples,
      }),
    [signals, horizon, useBand, context, minSamples]
  );

  const filtered = React.useMemo<FilteredStats | null>(
    () =>
      filters.length === 0
        ? null
        : aggregateFiltered(signals, horizon, useBand, filters, context),
    [signals, horizon, useBand, filters, context]
  );

  const rangeMap = React.useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const row of analysis.rows) {
      const all = [...row.hitValues, ...row.missValues];
      if (all.length === 0) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of all) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      map.set(row.feature.id, [lo, hi]);
    }
    return map;
  }, [analysis.rows]);

  const visibleRows = React.useMemo(
    () =>
      analysis.rows.filter((row) => {
        if (categoryFilter !== "all" && row.feature.category !== categoryFilter) return false;
        if (sigFilter === "q05") {
          const q = analysis.qValues[row.feature.id];
          if (q === undefined || q > 0.05) return false;
        }
        return true;
      }),
    [analysis, categoryFilter, sigFilter]
  );

  function updateFilter(idx: number, patch: Partial<FilterRule>) {
    setFilters((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function removeFilter(idx: number) {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
  }

  function addFilter(featureId: string, threshold: number) {
    if (filters.length >= 3) return;
    setFilters((prev) => [...prev, { featureId, op: ">", threshold }]);
  }

  const baseHitRate =
    analysis.totalSignals > 0 ? analysis.hitCount / analysis.totalSignals : 0;

  return (
    <div className="border border-border rounded p-3 bg-card/30 space-y-3">
      {/* Header */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-bold text-foreground">Hit Conditions</span>
        {title && (
          <span className="text-[10px] text-muted-foreground">· {title}</span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {analysis.totalSignals} signals ·{" "}
          <span className="text-emerald-300">{analysis.hitCount} hits</span> ·{" "}
          <span className="text-rose-300">{analysis.missCount} misses</span> · base hit
          rate{" "}
          <span className={hitRateColorClass(baseHitRate)}>
            {formatHitRate(baseHitRate)}
          </span>
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Horizon</span>
          <select
            className="bg-background border border-border rounded px-1 py-0.5"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
          >
            {HORIZON_LABELS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Min n</span>
          <input
            type="number"
            className="bg-background border border-border rounded px-1 py-0.5 w-12"
            value={minSamples}
            min={3}
            onChange={(e) => setMinSamples(Math.max(3, parseInt(e.target.value) || 5))}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Group</span>
          <select
            className="bg-background border border-border rounded px-1 py-0.5"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            <option value="price-action">Price action</option>
            <option value="technical">Technical</option>
            <option value="valuation">Valuation</option>
            <option value="fundamentals">Fundamentals</option>
            <option value="sentiment">Sentiment</option>
            <option value="macro">Macro</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={sigFilter === "q05"}
            onChange={(e) => setSigFilter(e.target.checked ? "q05" : "all")}
          />
          <span className="text-muted-foreground">Only BH q&lt;0.05</span>
        </label>
        <span className="text-muted-foreground ml-auto">
          {direction === "buy"
            ? "Hit = signal reached upside target"
            : "Hit = signal reached downside target"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="text-[9px] text-muted-foreground uppercase tracking-wide border-b border-border/40">
            <tr>
              <th className="text-left px-1 py-1">Indicator</th>
              <th className="text-center px-1 py-1">Hit median</th>
              <th className="text-center px-1 py-1">Miss median</th>
              <th className="text-center px-1 py-1">Δ med</th>
              <th className="text-center px-1 py-1">|d|</th>
              <th className="text-center px-1 py-1">KS</th>
              <th className="text-center px-1 py-1">AUC</th>
              <th className="text-center px-1 py-1">p</th>
              <th className="text-center px-1 py-1">q</th>
              <th className="text-center px-1 py-1">n hit</th>
              <th className="text-center px-1 py-1">n miss</th>
              <th className="text-left px-1 py-1">Distribution (IQR + median)</th>
              <th className="text-center px-1 py-1">Filter</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-4 text-muted-foreground">
                  No features have enough hit AND miss samples (≥ {minSamples} each).
                  Try lowering Min n, or pick a horizon with more hits.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const fmt = row.feature.format;
              const dec = row.feature.decimals ?? 1;
              const qVal = analysis.qValues[row.feature.id];
              const range = rangeMap.get(row.feature.id);
              const lo = range ? range[0] : 0;
              const hi = range ? range[1] : 1;
              return (
                <tr
                  key={row.feature.id}
                  className="border-b border-border/20 hover:bg-muted/10"
                >
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      <span
                        className={`px-1 rounded text-[8px] uppercase ${
                          CATEGORY_COLORS[row.feature.category] ?? "bg-muted/20"
                        }`}
                      >
                        {row.feature.category.split("-")[0].slice(0, 4)}
                      </span>
                      <span
                        className="text-foreground"
                        title={row.feature.description}
                      >
                        {row.feature.label}
                      </span>
                    </div>
                  </td>
                  <td className="text-center px-1 py-1 text-emerald-300">
                    {formatValue(row.hitMedian, fmt, dec)}
                  </td>
                  <td className="text-center px-1 py-1 text-rose-300">
                    {formatValue(row.missMedian, fmt, dec)}
                  </td>
                  <td className="text-center px-1 py-1 text-foreground">
                    {formatSpread(row.medianSpread, fmt, dec)}
                  </td>
                  <td className={`text-center px-1 py-1 ${cohensColorClass(row.cohensD)}`}>
                    {Math.abs(row.cohensD).toFixed(2)}
                  </td>
                  <td className="text-center px-1 py-1 text-foreground">
                    {row.ks.toFixed(2)}
                  </td>
                  <td className={`text-center px-1 py-1 ${aucColorClass(row.auc)}`}>
                    {row.auc.toFixed(2)}
                  </td>
                  <td className="text-center px-1 py-1 text-muted-foreground">
                    {formatPVal(row.ksPVal)}
                  </td>
                  <td
                    className={`text-center px-1 py-1 ${
                      qVal !== undefined && qVal < 0.05
                        ? "text-emerald-300 font-bold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {qVal !== undefined ? formatPVal(qVal) : "—"}
                  </td>
                  <td className="text-center px-1 py-1 text-emerald-300">
                    {row.hitN}
                  </td>
                  <td className="text-center px-1 py-1 text-rose-300">{row.missN}</td>
                  <td className="px-1 py-1">
                    <div className="flex flex-col gap-0.5">
                      <DistBar
                        p25={row.hitP25}
                        p75={row.hitP75}
                        median={row.hitMedian}
                        lo={lo}
                        hi={hi}
                        color="bg-emerald-500/60"
                      />
                      <DistBar
                        p25={row.missP25}
                        p75={row.missP75}
                        median={row.missMedian}
                        lo={lo}
                        hi={hi}
                        color="bg-rose-500/60"
                      />
                    </div>
                  </td>
                  <td className="text-center px-1 py-1">
                    <button
                      className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30"
                      disabled={
                        filters.length >= 3 ||
                        filters.some((f) => f.featureId === row.feature.id)
                      }
                      onClick={() => addFilter(row.feature.id, row.hitMedian)}
                      title={
                        filters.length >= 3
                          ? "Max 3 filters"
                          : "Add this indicator as a filter"
                      }
                    >
                      + filter
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Filter sandbox */}
      <div className="border-t border-border/40 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-foreground">Filter sandbox</span>
          <span className="text-[10px] text-muted-foreground">
            Stack up to 3 AND-rules. We require ALL rules to pass; signals where any
            feature is unavailable are dropped.
          </span>
        </div>
        {filters.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">
            Click{" "}
            <span className="text-primary">+ filter</span> on any indicator above, or
            pick one to start:
            <select
              className="bg-background border border-border rounded ml-2 px-1 py-0.5"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id || !FEATURES.find((f) => f.id === id)) return;
                const row = analysis.rows.find((r) => r.feature.id === id);
                addFilter(id, row?.hitMedian ?? 0);
              }}
            >
              <option value="">Choose indicator…</option>
              {FEATURES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            {filters.map((rule, idx) => {
              const featDef = FEATURES.find((f) => f.id === rule.featureId);
              const analysisRow = analysis.rows.find(
                (r) => r.feature.id === rule.featureId
              );
              if (!featDef) return null;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-[10px] flex-wrap"
                >
                  {idx > 0 && (
                    <span className="text-muted-foreground">AND</span>
                  )}
                  <select
                    className="bg-background border border-border rounded px-1 py-0.5"
                    value={rule.featureId}
                    onChange={(e) => updateFilter(idx, { featureId: e.target.value })}
                  >
                    {FEATURES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="bg-background border border-border rounded px-1 py-0.5"
                    value={rule.op}
                    onChange={(e) =>
                      updateFilter(idx, { op: e.target.value as FilterRule["op"] })
                    }
                  >
                    <option value=">">{OP_LABELS[">"]}</option>
                    <option value="<">{OP_LABELS["<"]}</option>
                    <option value=">=">{OP_LABELS[">="]}</option>
                    <option value="<=">{OP_LABELS["<="]}</option>
                  </select>
                  <input
                    type="number"
                    step="any"
                    className="bg-background border border-border rounded px-1 py-0.5 w-24 font-mono"
                    value={rule.threshold}
                    onChange={(e) =>
                      updateFilter(idx, { threshold: parseFloat(e.target.value) })
                    }
                  />
                  <span className="text-muted-foreground">
                    (
                    {featDef.format === "pct"
                      ? "decimal — 0.05 = 5%"
                      : featDef.format === "bp"
                      ? "bp"
                      : featDef.format === "z"
                      ? "stdevs"
                      : featDef.format === "ratio"
                      ? "× multiple"
                      : "raw"}
                    )
                  </span>
                  {analysisRow && (
                    <span className="text-muted-foreground">
                      hit median{" "}
                      {formatValue(analysisRow.hitMedian, featDef.format, featDef.decimals)}{" "}
                      · miss median{" "}
                      {formatValue(
                        analysisRow.missMedian,
                        featDef.format,
                        featDef.decimals
                      )}
                    </span>
                  )}
                  <button
                    className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
                    onClick={() => removeFilter(idx)}
                  >
                    remove
                  </button>
                </div>
              );
            })}
            {filtered && (
              <div className="border-t border-border/30 pt-2 mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase">
                    Retained
                  </div>
                  <div className="text-foreground">
                    {filtered.retained}{" "}
                    <span className="text-muted-foreground">/ {analysis.totalSignals}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase">Dropped</div>
                  <div className="text-rose-300">{filtered.dropped}</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase">
                    Filtered hit rate
                  </div>
                  <div className={hitRateColorClass(filtered.hitRate) + " font-bold"}>
                    {formatHitRate(filtered.hitRate)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase">
                    Base hit rate
                  </div>
                  <div className={hitRateColorClass(filtered.baseHitRate)}>
                    {formatHitRate(filtered.baseHitRate)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase">Lift</div>
                  <div
                    className={
                      filtered.lift >= 1.2
                        ? "text-emerald-400 font-bold"
                        : filtered.lift >= 1
                        ? "text-yellow-300"
                        : "text-rose-300"
                    }
                  >
                    {filtered.lift.toFixed(2)}×
                  </div>
                </div>
              </div>
            )}
            {filtered && filtered.retained < 5 && (
              <div className="text-[10px] text-yellow-400 italic">
                ⚠ Only {filtered.retained} signals retained — too few for any conclusion.
                Loosen the rule(s) or pick a coarser threshold.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Methodology */}
      <details className="text-[9px] text-muted-foreground">
        <summary className="cursor-pointer">Methodology</summary>
        <ul className="list-disc ml-4 mt-1 space-y-0.5">
          <li>
            <b>Look-ahead safe:</b> every indicator reads only data up to and including
            the signal bar.
          </li>
          <li>
            <b>KS:</b> two-sample Kolmogorov-Smirnov test statistic between hit and miss
            distributions, [0, 1]; bigger = more separation.
          </li>
          <li>
            <b>p:</b> two-sided asymptotic KS p-value. <b>q:</b> Benjamini-Hochberg
            adjusted (FDR) — controls for testing many features at once.
          </li>
          <li>
            <b>AUC:</b> probability a random hit&apos;s value exceeds a random miss&apos;s
            value. 0.5 = no info, ≥0.7 or ≤0.3 is meaningful.
          </li>
          <li>
            <b>|d|:</b> Cohen&apos;s d (pooled) — standardized median spread; rough
            effect-size guide: 0.2 small, 0.5 medium, 0.8 large.
          </li>
          <li>
            <b>Distribution bar:</b> P25–P75 box with median tick. Green = hits, red =
            misses.
          </li>
          <li>
            <b>Sample sizes:</b> n &lt; 10 makes any &quot;100% hit rate&quot; filter
            unreliable. Default sort penalises tiny samples (KS × √min(n)).
          </li>
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fundamental metric keys and macro keys
// ---------------------------------------------------------------------------

const FUNDAMENTAL_METRICS = [
  "P/FFO FY2",
  "FFO Yield FY2",
  "Dividend Yield",
  "EV/EBITDA FY2",
  "FY1 EPS Growth",
  "FY2 FFO Growth",
  "FFO FY2",
  "% off 52wk High",
  "% off 52wk Low",
  "Short Interest%",
  "Buy Ratings",
  "Hold Ratings",
  "Sell Ratings",
  "Bull%",
  "Bear%",
];

const MACRO_SERIES = [
  "DGS10",
  "DGS2",
  "SPREAD_10Y_2Y",
  "BAMLC0A0CM",
  "BAMLH0A0HYM2",
  "VIXCLS",
  "DFII10",
  "T10YIE",
];

function alignSeriesToDates(
  pts: { time: string; value: number }[],
  dates: string[]
): (number | null)[] {
  const map = new Map<string, number>();
  for (const pt of pts) {
    if (Number.isFinite(pt.value)) map.set(pt.time, pt.value);
  }
  const out: (number | null)[] = new Array(dates.length).fill(null);
  let carry: number | null = null;
  for (let k = 0; k < dates.length; k++) {
    const v = map.get(dates[k]);
    if (v !== undefined) carry = v;
    out[k] = carry;
  }
  return out;
}

// ---------------------------------------------------------------------------
// EvaluatorPanelResult (named export: E in bundle → EvaluatorPanelResult)
// ---------------------------------------------------------------------------

export interface EvaluatorPanelResultProps {
  result: BacktestResult | null;
  loading: boolean;
  setupLabel: string;
  tickerLabel: string;
}

export function EvaluatorPanelResult({
  result,
  loading,
  setupLabel,
  tickerLabel,
}: EvaluatorPanelResultProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded p-4 text-sm text-muted-foreground">
        Evaluating setup…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-card border border-border rounded p-4 text-xs text-muted-foreground">
        Configure your indicator parameters above and click{" "}
        <span className="font-semibold text-foreground">Evaluate</span> to see hit rate,
        average return, and signal count for this exact setup.
      </div>
    );
  }

  if (result.signalCount === 0) {
    return (
      <div className="bg-card border border-border rounded p-4 text-xs">
        <div className="text-foreground font-medium mb-1">No signals fired</div>
        <div className="text-muted-foreground">
          The setup{" "}
          <span className="font-mono text-amber-300">{setupLabel}</span> produced 0
          signals on <span className="font-mono">{tickerLabel}</span> across the available
          history. Try relaxing parameters or pick a different ticker.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded p-3">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div>
            <div className="text-xs text-muted-foreground">Setup</div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {setupLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Instrument</div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {tickerLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Signals</div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {result.signalCount}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Window</div>
            <div className="text-xs text-foreground font-mono">
              {result.firstSignalDate ?? "—"} → {result.lastSignalDate ?? "—"}
            </div>
          </div>
        </div>
        <SignalStatsTable rows={result.rows} />
      </div>

      <div className="bg-card border border-border rounded p-3">
        <div className="text-xs text-muted-foreground mb-2">
          Equity curve (cumulative 1M return per signal, direction-adjusted)
        </div>
        <EquityCurveChart result={result} />
      </div>

      <SignalDetailTable signals={result.signals} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvaluatorPanelLoader (named export: H in bundle → EvaluatorPanelLoader)
// Loads fundamentals + macro then renders HitConditionsTable
// ---------------------------------------------------------------------------

export interface EvaluatorPanelLoaderProps {
  ticker: string;
  priceContext: PriceContext;
  signals: SignalProfile[];
  defaultHorizon?: string;
  useBand?: boolean;
  direction?: "buy" | "sell";
  title?: string;
}

export function EvaluatorPanelLoader({
  ticker,
  priceContext,
  signals,
  defaultHorizon = "1M",
  useBand = false,
  direction = "buy",
  title,
}: EvaluatorPanelLoaderProps) {
  const [context, setContext] = React.useState<FeatureContext | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Loading…");

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus("Loading fundamentals…");
        const fundamentals: Record<string, (number | null)[]> = {};

        // For pair mode, use legA as the fundamental source ticker
        const fundTicker =
          priceContext.mode === "pair" && priceContext.pairLegA
            ? priceContext.pairLegA
            : ticker;

        const fundResults = await Promise.all(
          FUNDAMENTAL_METRICS.map(async (metric) => {
            try {
              const series = await fetchMetricSeries(fundTicker, metric);
              const pts = series.dates
                .map((time, idx) => ({ time, value: series.values[idx] }))
                .filter((p): p is { time: string; value: number } => p.value != null);
              return [metric, alignSeriesToDates(pts, priceContext.dates)] as const;
            } catch {
              return [
                metric,
                new Array(priceContext.dates.length).fill(null),
              ] as const;
            }
          })
        );
        if (cancelled) return;
        for (const [metric, arr] of fundResults) {
          fundamentals[metric] = arr;
        }

        setStatus("Loading macro series…");
        const macro: Record<string, (number | null)[]> = {};
        try {
          const macroBatch = await fetchMacroSeriesBatch(MACRO_SERIES);
          if (cancelled) return;
          const macroByKey = new Map(macroBatch.map((m) => [m.seriesKey, m]));
          for (const key of MACRO_SERIES) {
            const entry = macroByKey.get(key);
            const pts = entry
              ? entry.dates
                  .map((time, idx) => ({ time, value: entry.values[idx] }))
                  .filter((p): p is { time: string; value: number } => p.value != null)
              : [];
            macro[key] = alignSeriesToDates(pts, priceContext.dates);
          }
        } catch {
          for (const key of MACRO_SERIES) {
            macro[key] = new Array(priceContext.dates.length).fill(null);
          }
        }
        if (cancelled) return;

        setContext({
          prices: priceContext.prices,
          highs: priceContext.highs,
          lows: priceContext.lows,
          volumes: priceContext.volumes,
          dates: priceContext.dates,
          benchmarkPrices: priceContext.benchmarkPrices,
          fundamentals,
          macro,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            String((err as { message?: string })?.message ?? err)
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker, priceContext]);

  if (error) {
    return (
      <div className="border border-red-500/30 rounded p-2 bg-red-500/5 mt-2">
        <div className="text-[10px] text-red-300 font-mono">
          Hit Conditions failed to load: {error}
        </div>
      </div>
    );
  }

  if (context) {
    return (
      <HitConditionsTable
        signals={signals}
        context={context}
        defaultHorizon={defaultHorizon}
        useBand={useBand}
        direction={direction}
        title={title}
      />
    );
  }

  return (
    <div className="border border-border/30 rounded p-2 bg-card/30 mt-2">
      <div className="text-[10px] text-muted-foreground font-mono">
        Hit Conditions — {status}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// buildBacktestResult (named export: e in bundle → buildBacktestResult)
// ---------------------------------------------------------------------------

export function buildBacktestResult(
  prices: number[],
  dates: string[],
  signalIndices: number[],
  direction: "long" | "short",
  targetPct = 0.05,
  cooldown = 0,
  benchmarkPrices?: number[],
  primaryHorizon = "1M"
): BacktestResult {
  const side: "buy" | "sell" = direction === "long" ? "buy" : "sell";
  const profiles: SignalProfile[] = [];
  const signalDates: string[] = [];
  const entryPrices: number[] = [];
  let lastSignalIdx = -1;

  for (const idx of signalIndices) {
    if (cooldown > 0 && lastSignalIdx >= 0 && idx < lastSignalIdx + cooldown) continue;
    const profile = buildSignalProfile(
      prices,
      idx,
      targetPct,
      side,
      null,
      cooldown,
      benchmarkPrices
    );
    profiles.push(profile);
    signalDates.push(dates[idx] ?? "");
    entryPrices.push(prices[idx]);
    lastSignalIdx = idx;
  }

  const agg = aggregateSignalProfiles(profiles, side);

  const rows: HorizonRow[] = (HORIZONS as { label: string }[]).map(({ label }) => {
    const count = profiles.filter((p) => p.returns[label] !== null).length;
    const avgReturn = agg.avgReturn[label];
    const stdReturn = agg.stdReturn[label];
    const tStat =
      count > 1 && stdReturn > 0 ? avgReturn / (stdReturn / Math.sqrt(count)) : 0;
    return {
      horizon: label,
      count,
      hitRate: agg.hitRate?.[label] ?? 0,
      winRate: agg.winRate[label],
      avgReturn,
      medianReturn: agg.medianReturn[label],
      stdReturn,
      tStat,
      avgTrough: agg.avgTrough[label],
    };
  });

  const equityCurve: { date: string; cumReturn: number }[] = [];
  let cumRet = 0;
  for (let k = 0; k < profiles.length; k++) {
    const ret = profiles[k].returns[primaryHorizon];
    if (ret == null) continue;
    const adj = direction === "long" ? ret : -ret;
    cumRet += adj;
    equityCurve.push({ date: signalDates[k] ?? "", cumReturn: cumRet });
  }

  const signals: SignalDetailRow[] = profiles.map((p, k) => ({
    num: k + 1,
    date: signalDates[k] ?? "",
    entryPrice: entryPrices[k],
    returns: { ...p.returns },
    hitTarget: { ...p.hitTarget },
  }));

  return {
    count: profiles.length,
    rows,
    equityCurve,
    signalCount: profiles.length,
    firstSignalDate: signalDates[0] ?? null,
    lastSignalDate: signalDates[signalDates.length - 1] ?? null,
    signals,
    profiles,
  };
}

// ---------------------------------------------------------------------------
// Bundle alias exports (minified names used by optimizer pages)
// e = buildBacktestResult, E = EvaluatorPanelResult, H = EvaluatorPanelLoader
// ---------------------------------------------------------------------------
export {
  buildBacktestResult as e,
  EvaluatorPanelResult as E,
  EvaluatorPanelLoader as H,
};
