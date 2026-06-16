// Reconstructed from recovered-bundle/MACrossoverOptimizer-BDlYyAhI.js

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { PresetBar } from "@/components/PresetBar";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import {
  buildBacktestResult,
  EvaluatorPanelResult,
  EvaluatorPanelLoader,
} from "@/components/EvaluatorPanel";
import { BasketPicker } from "@/components/BasketPicker";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "@/lib/icons";
import {
  getTickers,
  getDates,
  getTickerRaw,
  getGroupMedianByIndex,
  refreshTickerData,
  CLASSIFICATION_DIMENSION_KEYS,
} from "@/lib/dataService";
import {
  fetchInputSeries,
  filterByDateRange,
  defaultInputSelection,
  type InputSelection,
} from "@/lib/optimizerInputSeries";
import {
  DATE_PRESETS,
  createDateRangeFromPreset,
  TARGET_THRESHOLDS,
  RETURN_BAND_PRESETS,
  RANK_BY_OPTIONS,
  FORWARD_HORIZONS,
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
  getScoreWeights,
  pickBestByRankMode,
  isBasketTicker,
  scoreColor,
  scoreTextColor,
  hitRateColor,
  profitFactorColor,
  pct,
  pctSigned,
  type SignalSummary,
  type CompositeScore,
  type ForwardReturnProfile,
  type ReturnBand,
} from "@/lib/forwardReturns";
import { weeklyDownsample, mapWeeklyIndexToDaily } from "@/lib/weeklyDownsample";
import { sliceDateRange } from "@/lib/datePresets";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import "@/lib/globalUniverse";
import "@/components/ClassificationFiltersWithSource";
import "@/lib/harsi";
import "@/lib/tva";

// ── Slope/Curvature signal families ──

const FAMILY_SIGNALS: Record<string, string[]> = {
  price_cross: ["price_above", "price_below"],
  slope: ["slope_up", "slope_down"],
  curvature: ["accel_up", "accel_down"],
  all: ["price_above", "price_below", "slope_up", "slope_down", "accel_up", "accel_down"],
};

const SLOPE_SIGNAL_META: Record<
  string,
  { label: string; shortLabel: string; description: string; direction: "buy" | "sell"; family: string }
> = {
  price_above: {
    label: "Price Cross Above",
    shortLabel: "Px↑MA",
    description: "Price crosses above MA from below — bullish breakout",
    direction: "buy",
    family: "price_cross",
  },
  price_below: {
    label: "Price Cross Below",
    shortLabel: "Px↓MA",
    description: "Price crosses below MA from above — bearish breakdown",
    direction: "sell",
    family: "price_cross",
  },
  slope_up: {
    label: "MA Slope Turn Up",
    shortLabel: "Slp↑",
    description: "MA slope turns positive — trend re-acceleration",
    direction: "buy",
    family: "slope",
  },
  slope_down: {
    label: "MA Slope Turn Down",
    shortLabel: "Slp↓",
    description: "MA slope turns negative — trend rollover",
    direction: "sell",
    family: "slope",
  },
  accel_up: {
    label: "MA Curvature Turn Up",
    shortLabel: "Crv↑",
    description: "MA curvature crosses above 0 — slope accelerating up",
    direction: "buy",
    family: "curvature",
  },
  accel_down: {
    label: "MA Curvature Turn Down",
    shortLabel: "Crv↓",
    description: "MA curvature crosses below 0 — slope decelerating",
    direction: "sell",
    family: "curvature",
  },
};

// ── Slope/curvature math helpers ──

function rocSeries(arr: (number | null)[], lookback: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (lookback < 1) return out;
  for (let i = lookback; i < n; i++) {
    const x = arr[i];
    const y = arr[i - lookback];
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || y === 0) continue;
    out[i] = (x as number) / (y as number) - 1;
  }
  return out;
}

function diffSeries(arr: number[]): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const x = arr[i];
    const y = arr[i - 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[i] = x - y;
  }
  return out;
}

function findZeroCrossings(arr: number[], dir: "up" | "down"): number[] {
  const out: number[] = [];
  let prev = NaN;
  let gap = 0;
  const maxGap = 5;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) {
      gap += 1;
      if (gap > maxGap) prev = NaN;
      continue;
    }
    gap = 0;
    if (
      Number.isFinite(prev) &&
      ((dir === "up" && prev <= 0 && v > 0) || (dir === "down" && prev >= 0 && v < 0))
    )
      out.push(i);
    prev = v;
  }
  return out;
}

function detectSlopeCurvatureSignals(
  prices: number[],
  ma: (number | null)[],
  slopeLookback: number,
  signals: string[],
  startIdx: number
): Record<string, number[]> {
  const out: Record<string, number[]> = {
    price_above: [],
    price_below: [],
    slope_up: [],
    slope_down: [],
    accel_up: [],
    accel_down: [],
  };
  const wantAbove = signals.includes("price_above");
  const wantBelow = signals.includes("price_below");
  if (wantAbove || wantBelow) {
    let prevAbove: boolean | null = null;
    for (let i = startIdx; i < prices.length; i++) {
      if (ma[i] === null) continue;
      const m = ma[i] as number;
      const above: boolean = prices[i] > m ? true : prices[i] < m ? false : prevAbove ?? true;
      if (prevAbove !== null && above !== prevAbove) {
        if (above && wantAbove) out.price_above.push(i);
        else if (!above && wantBelow) out.price_below.push(i);
      }
      prevAbove = above;
    }
  }
  const wantSlope = signals.includes("slope_up") || signals.includes("slope_down");
  const wantCurv = signals.includes("accel_up") || signals.includes("accel_down");
  if (wantSlope || wantCurv) {
    const slope = rocSeries(ma, slopeLookback);
    if (wantSlope) {
      const ups = findZeroCrossings(slope, "up");
      const downs = findZeroCrossings(slope, "down");
      for (const i of ups) if (i >= startIdx && signals.includes("slope_up")) out.slope_up.push(i);
      for (const i of downs) if (i >= startIdx && signals.includes("slope_down")) out.slope_down.push(i);
    }
    if (wantCurv) {
      const curv = diffSeries(slope);
      const ups = findZeroCrossings(curv, "up");
      const downs = findZeroCrossings(curv, "down");
      for (const i of ups) if (i >= startIdx && signals.includes("accel_up")) out.accel_up.push(i);
      for (const i of downs) if (i >= startIdx && signals.includes("accel_down")) out.accel_down.push(i);
    }
  }
  return out;
}

// ── Indicator source transforms ──

function rocTransform(arr: number[], lookback: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (lookback < 1) return out;
  for (let i = lookback; i < n; i++) {
    const x = arr[i];
    const y = arr[i - lookback];
    if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) continue;
    out[i] = x / y - 1;
  }
  return out;
}

function rsiTransform(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (period < 1 || n < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = arr[i] - arr[i - 1];
    if (Number.isFinite(d)) {
      if (d > 0) gain += d;
      else loss += -d;
    }
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < n; i++) {
    const d = arr[i] - arr[i - 1];
    if (!Number.isFinite(d)) {
      out[i] = out[i - 1];
      continue;
    }
    const up = d > 0 ? d : 0;
    const dn = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + up) / period;
    loss = (loss * (period - 1) + dn) / period;
    out[i] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function momentumTransform(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (period < 1) return out;
  for (let i = period; i < n; i++) {
    const x = arr[i];
    const y = arr[i - period];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[i] = x - y;
  }
  return out;
}

interface IndicatorSpec {
  kind: string;
  period?: number;
}

function applyIndicator(arr: number[], spec: IndicatorSpec): number[] {
  if (spec.kind === "price") return arr.slice();
  const p = spec.period ?? 14;
  return spec.kind === "roc"
    ? rocTransform(arr, p)
    : spec.kind === "rsi"
    ? rsiTransform(arr, p)
    : spec.kind === "momentum"
    ? momentumTransform(arr, p)
    : arr.slice();
}

function indicatorLabel(spec: IndicatorSpec): string {
  if (spec.kind === "price") return "Price";
  const p = spec.period ?? 14;
  return spec.kind === "roc"
    ? `ROC(${p})`
    : spec.kind === "rsi"
    ? `RSI(${p})`
    : spec.kind === "momentum"
    ? `Momentum(${p})`
    : "Price";
}

function indicatorShortLabel(spec: IndicatorSpec): string {
  if (spec.kind === "price") return "Px";
  const p = spec.period ?? 14;
  return spec.kind === "roc"
    ? `ROC${p}`
    : spec.kind === "rsi"
    ? `RSI${p}`
    : spec.kind === "momentum"
    ? `MOM${p}`
    : "Px";
}

function indicatorBurn(spec: IndicatorSpec): number {
  return spec.kind === "price" ? 0 : spec.period ?? 14;
}

// ── MA types & metadata ──

const MA_TYPES = ["SMA", "EMA", "HMA", "WMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"] as const;

const FAMILY_LABELS: Record<string, string> = {
  price_cross: "Price Cross",
  slope: "Slope",
  curvature: "Curvature",
  all: "All",
};

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  price_cross: "Price crosses above/below the MA",
  slope: "MA slope flips sign — trend turns up or down",
  curvature: "MA curvature flips sign — slope accelerates / decelerates",
  all: "All six signals: price-cross + slope + curvature",
};

interface ComboLeg {
  kind: "price_cross" | "ma_cross";
  maType: string;
  slowMaType?: string;
  fastPeriod: number;
  slowPeriod: number;
  polarity: "above" | "below";
}

function legSlowMaType(leg: ComboLeg): string {
  return leg.slowMaType ?? leg.maType;
}

const BULL_CATEGORIES = ["golden_cross", "price_above", "combo_bull", "slope_up", "accel_up"];
const BEAR_CATEGORIES = ["death_cross", "price_below", "combo_bear", "slope_down", "accel_down"];

function findSideCategory(cfg: any, side: "long" | "short"): any | null {
  const cats = side === "long" ? BULL_CATEGORIES : BEAR_CATEGORIES;
  return cfg.categories.find((c: any) => cats.includes(c.category)) ?? null;
}

const CROSSOVER_DEFS: Record<string, { label: string; description: string }> = {
  golden_cross: {
    label: "Golden Cross",
    description: "Fast MA crosses above slow MA — bullish trend change",
  },
  death_cross: {
    label: "Death Cross",
    description: "Fast MA crosses below slow MA — bearish trend change",
  },
};

const PRICE_CROSS_DEFS: Record<string, { label: string; description: string }> = {
  price_above: {
    label: "Price Cross Above",
    description: "Price crosses above MA from below — bullish breakout",
  },
  price_below: {
    label: "Price Cross Below",
    description: "Price crosses below MA from above — bearish breakdown",
  },
};

const COMBO_DEFS: Record<string, { label: string; description: string }> = {
  combo_bull: {
    label: "Combo Bull",
    description: "Both legs flipped to true together — confluence entry",
  },
  combo_bear: {
    label: "Combo Bear",
    description: "At least one leg dropped — confluence broken",
  },
};

const FAST_PERIODS = [10, 20, 50];
const SLOW_PERIODS = [50, 100, 200];
const PRICE_CROSS_PERIODS = Array.from({ length: 100 }, (_, i) => (i + 1) * 2);

// ── MA computation ──

function computeSMA(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function computeEMA(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) sum += prices[i];
  if (prices.length < period) return out;
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function computeHMA(prices: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = computeWMA(prices, half);
  const wmaFull = computeWMA(prices, period);
  const diff: (number | null)[] = new Array(prices.length).fill(null);
  for (let i = 0; i < prices.length; i++)
    if (wmaHalf[i] !== null && wmaFull[i] !== null) diff[i] = 2 * (wmaHalf[i] as number) - (wmaFull[i] as number);
  const out: (number | null)[] = new Array(prices.length).fill(null);
  const wsum = (sqrtP * (sqrtP + 1)) / 2;
  for (let i = sqrtP - 1; i < prices.length; i++) {
    let acc = 0;
    let bad = false;
    for (let j = 0; j < sqrtP; j++) {
      const v = diff[i - j];
      if (v === null) {
        bad = true;
        break;
      }
      acc += v * (sqrtP - j);
    }
    if (!bad) out[i] = acc / wsum;
  }
  return out;
}

function computeWMA(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (period < 1 || prices.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < prices.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += prices[i - j] * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

function computeKAMA(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length <= period) return out;
  const fastSC = 0.666;
  const slowSC = 0.0645;
  let kama = prices[period];
  out[period] = kama;
  for (let i = period + 1; i < prices.length; i++) {
    const change = Math.abs(prices[i] - prices[i - period]);
    let vol = 0;
    for (let j = 0; j < period; j++) vol += Math.abs(prices[i - j] - prices[i - j - 1]);
    const er = vol !== 0 ? change / vol : 0;
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    kama = kama + sc * (prices[i] - kama);
    out[i] = kama;
  }
  return out;
}

function computeFRAMA(
  highs: number[],
  lows: number[],
  period: number,
  fc = 1,
  sc = 198
): (number | null)[] {
  const out: (number | null)[] = new Array(highs.length).fill(null);
  const n = period;
  const half = Math.floor(n / 2);
  if (n < 2 || half < 1 || highs.length < n + half) return out;
  const w = Math.log(2 / (sc + 1));
  const minA = 2 / (sc + 1);
  const hl2 = new Array(highs.length);
  for (let i = 0; i < highs.length; i++) hl2[i] = (highs[i] + lows[i]) / 2;
  let frama = hl2[0];
  let prevDim: number | null = null;
  for (let i = 0; i < highs.length; i++) {
    let alpha: number;
    let dim: number | null = null;
    if (i >= n + half - 1) {
      let h1 = -Infinity;
      let l1 = Infinity;
      for (let k = i - half + 1; k <= i; k++) {
        if (highs[k] > h1) h1 = highs[k];
        if (lows[k] < l1) l1 = lows[k];
      }
      let h2 = -Infinity;
      let l2 = Infinity;
      for (let k = i - half - n + 1; k <= i - half; k++) {
        if (highs[k] > h2) h2 = highs[k];
        if (lows[k] < l2) l2 = lows[k];
      }
      let h3 = -Infinity;
      let l3 = Infinity;
      for (let k = i - n + 1; k <= i; k++) {
        if (highs[k] > h3) h3 = highs[k];
        if (lows[k] < l3) l3 = lows[k];
      }
      const n1 = (h1 - l1) / half;
      const n2 = (h2 - l2) / half;
      const n3 = (h3 - l3) / n;
      let d: number;
      if (n1 > 0 && n2 > 0 && n3 > 0) {
        d = (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2);
        prevDim = d;
      } else d = prevDim ?? 0;
      dim = d;
    }
    if (dim !== null) {
      const e = Math.exp(w * (dim - 1));
      const a0 = e > 1 ? 1 : e < 0.01 ? 0.01 : e;
      const oldN = (2 - a0) / a0;
      const a = 2 / (((sc - fc) * (oldN - 1)) / (sc - 1) + fc + 1);
      alpha = a < minA ? minA : a > 1 ? 1 : a;
    } else alpha = minA;
    frama = (1 - alpha) * frama + alpha * hl2[i];
    if (i >= n + half - 1) out[i] = frama;
  }
  return out;
}

function computeT3(prices: number[], period: number, vf = 0.7): (number | null)[] {
  const n = prices.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0 || period < 1) return out;
  const k = 2 / (period + 1);
  const ema = (arr: number[]): number[] => {
    const r = new Array(arr.length);
    r[0] = arr[0];
    for (let i = 1; i < arr.length; i++) r[i] = k * arr[i] + (1 - k) * r[i - 1];
    return r;
  };
  const e1 = ema(prices);
  const e2 = ema(e1);
  const e3 = ema(e2);
  const e4 = ema(e3);
  const e5 = ema(e4);
  const e6 = ema(e5);
  const v2 = vf * vf;
  const v3 = v2 * vf;
  const c1 = -v3;
  const c2 = 3 * v2 + 3 * v3;
  const c3 = -6 * v2 - 3 * vf - 3 * v3;
  const c4 = 1 + 3 * vf + v3 + 3 * v2;
  const start = Math.min(n, 3 * period);
  for (let i = start; i < n; i++) out[i] = c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i];
  return out;
}

function computeALMA(prices: number[], period: number, offset = 0.85, sigma = 6): (number | null)[] {
  const n = prices.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0 || period < 2 || n < period) return out;
  const m = offset * (period - 1);
  const s = period / sigma;
  const weights = new Array(period);
  let wsum = 0;
  for (let i = 0; i < period; i++) {
    const w = Math.exp(-Math.pow(i - m, 2) / (2 * s * s));
    weights[i] = w;
    wsum += w;
  }
  if (wsum === 0) return out;
  for (let i = period - 1; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += weights[j] * prices[i - period + 1 + j];
    out[i] = acc / wsum;
  }
  return out;
}

function linregMA(prices: number[], period: number, offset = 0): (number | null)[] {
  const n = prices.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0 || period < 2 || n < period) return out;
  const p = period;
  const sumX = (p * (p - 1)) / 2;
  const sumXX = ((p - 1) * p * (2 * p - 1)) / 6;
  const denom = p * sumXX - sumX * sumX;
  if (denom === 0) return out;
  for (let i = period - 1; i < n; i++) {
    let sumY = 0;
    let sumXY = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = prices[i - period + 1 + j];
      if (v === null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sumY += v;
      sumXY += j * v;
    }
    if (!ok) continue;
    const slope = (p * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / p;
    out[i] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

function computeLSMA(prices: number[], period: number, offset = 0): (number | null)[] {
  return linregMA(prices, period, offset);
}

function computeSLSMA(prices: number[], period: number, offset = 0): (number | null)[] {
  const first = linregMA(prices, period, offset);
  return linregMA(first as number[], period, offset);
}

interface MaOpts {
  highs?: number[];
  lows?: number[];
  framaFC?: number;
  framaSC?: number;
  t3VolumeFactor?: number;
  almaOffset?: number;
  almaSigma?: number;
  lsmaOffset?: number;
}

function computeMA(prices: number[], period: number, type: string, opts?: MaOpts): (number | null)[] {
  if (type === "SMA") return computeSMA(prices, period);
  if (type === "EMA") return computeEMA(prices, period);
  if (type === "HMA") return computeHMA(prices, period);
  if (type === "WMA") return computeWMA(prices, period);
  if (type === "KAMA") return computeKAMA(prices, period);
  if (type === "T3") return computeT3(prices, period, opts?.t3VolumeFactor ?? 0.7);
  if (type === "ALMA") return computeALMA(prices, period, opts?.almaOffset ?? 0.85, opts?.almaSigma ?? 6);
  if (type === "LSMA") return computeLSMA(prices, period, opts?.lsmaOffset ?? 0);
  if (type === "SLSMA") return computeSLSMA(prices, period, opts?.lsmaOffset ?? 0);
  const highs = opts?.highs ?? prices;
  const lows = opts?.lows ?? prices;
  const fc = opts?.framaFC ?? 1;
  const sc = opts?.framaSC ?? 198;
  return computeFRAMA(highs, lows, period, fc, sc);
}

function legLabel(leg: ComboLeg): string {
  const op = leg.polarity === "above" ? ">" : "<";
  return leg.kind === "price_cross"
    ? `Px ${op} ${leg.maType}${leg.fastPeriod}`
    : `${leg.maType}${leg.fastPeriod} ${op} ${legSlowMaType(leg)}${leg.slowPeriod}`;
}

function maBurnFactor(type: string): number {
  return type === "SLSMA" ? 2 : 1.25;
}

function legBurnIn(leg: ComboLeg): number {
  const fast = leg.fastPeriod;
  const slow = leg.kind === "price_cross" ? 0 : leg.slowPeriod;
  const maxP = Math.max(fast, slow);
  const factor = Math.max(maBurnFactor(leg.maType), maBurnFactor(legSlowMaType(leg)));
  return Math.ceil(maxP * factor) + Math.ceil(Math.sqrt(maxP));
}

// ── Grid-search constants (Find Best Combo) ──

const GRID_PX_PERIODS = [20, 50, 100, 200];
const GRID_FAST_SLOW_PAIRS: [number, number][] = [
  [10, 50],
  [10, 100],
  [10, 200],
  [20, 50],
  [20, 100],
  [20, 200],
  [50, 100],
  [50, 200],
  [100, 200],
];
const GRID_TOTAL_COMBOS =
  MA_TYPES.length * GRID_PX_PERIODS.length * MA_TYPES.length * MA_TYPES.length * GRID_FAST_SLOW_PAIRS.length;

// ── Grid sort helpers ──

function gridSortValue(combo: any, side: "long" | "short", col: string): string | number {
  const summary = side === "long" ? combo.bullSummary : combo.bearSummary;
  const signals = side === "long" ? combo.bullSignals : combo.bearSignals;
  const score = side === "long" ? combo.bullScore : combo.bearScore;
  switch (col) {
    case "side":
      return side === "long" ? "Long" : "Short";
    case "legA":
      return combo.legAlabel;
    case "legB":
      return combo.legBlabel;
    case "signals":
      return signals;
    case "score":
      return score;
    case "hit-1M":
      return summary?.hitRate?.["1M"] ?? -Infinity;
    case "hit-3M":
      return summary?.hitRate?.["3M"] ?? -Infinity;
    case "hit-6M":
      return summary?.hitRate?.["6M"] ?? -Infinity;
    case "avg-3M":
      return summary?.avgReturn?.["3M"] ?? -Infinity;
    case "pf-3M":
      return summary?.profitFactor?.["3M"] ?? -Infinity;
    default:
      return -Infinity;
  }
}

function sortGridCombos(combos: any[], side: "long" | "short", sort: { col: string; dir: string }): any[] {
  const arr = [...combos];
  arr.sort((a, b) => {
    const av = gridSortValue(a, side, sort.col);
    const bv = gridSortValue(b, side, sort.col);
    let cmp = 0;
    if (typeof av === "string" || typeof bv === "string") cmp = String(av).localeCompare(String(bv));
    else cmp = av - bv;
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return arr;
}

// ── Weekly aggregation (legacy "weekly" frequency path) ──

function isoWeekKey(dateStr: string): string {
  const a = new Date(dateStr + "T00:00:00Z");
  if (isNaN(a.getTime())) return dateStr;
  const t = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const r = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const e = Math.ceil(((t.getTime() - r.getTime()) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(e).padStart(2, "0")}`;
}

function weeklyHighLow(highs: number[], lows: number[], dates: string[]): { highs: number[]; lows: number[] } {
  const outHighs: number[] = [];
  const outLows: number[] = [];
  let cur = "";
  let hi = -Infinity;
  let lo = Infinity;
  let started = false;
  for (let i = 0; i < highs.length; i++) {
    const wk = isoWeekKey(dates[i]);
    if (wk !== cur) {
      if (started) {
        outHighs.push(hi);
        outLows.push(lo);
      }
      cur = wk;
      hi = -Infinity;
      lo = Infinity;
      started = true;
    }
    if (highs[i] > hi) hi = highs[i];
    if (lows[i] < lo) lo = lows[i];
  }
  if (started) {
    outHighs.push(hi);
    outLows.push(lo);
  }
  return { highs: outHighs, lows: outLows };
}

function weeklyClose(prices: number[], dates: string[]): { prices: number[]; weekIndex: number[] } {
  const outPrices: number[] = [];
  const outIdx: number[] = [];
  let cur = "";
  let last = NaN;
  let lastIdx = -1;
  for (let i = 0; i < prices.length; i++) {
    const wk = isoWeekKey(dates[i]);
    if (wk !== cur) {
      if (lastIdx >= 0) {
        outPrices.push(last);
        outIdx.push(lastIdx);
      }
      cur = wk;
    }
    last = prices[i];
    lastIdx = i;
  }
  if (lastIdx >= 0) {
    outPrices.push(last);
    outIdx.push(lastIdx);
  }
  return { prices: outPrices, weekIndex: outIdx };
}

// ── Price data fetch ──

interface PriceData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  priceDates: string[];
}

async function fetchTickerPriceData(
  ticker: string,
  dates: string[],
  dateRange: any,
  selection?: InputSelection
): Promise<PriceData | null> {
  const sel = selection ?? defaultInputSelection;
  if (sel.kind !== "close") {
    const x = await fetchInputSeries(ticker, sel, { dateRange: dateRange ?? null });
    return x
      ? {
          closes: x.closes,
          highs: x.highs,
          lows: x.lows,
          volumes: x.volumes,
          priceDates: x.priceDates ?? (x as any).dates,
        }
      : null;
  }
  try {
    const raw = await getTickerRaw(ticker);
    const c = filterByDateRange(raw, dateRange ?? null);
    if (c.adjCloses.length > 0) {
      const n = c.adjCloses.length;
      const highs = new Array(n);
      const lows = new Array(n);
      for (let i = 0; i < n; i++) {
        const close = c.closes[i];
        const adj = c.adjCloses[i];
        const ratio = Number.isFinite(close) && close > 0 && Number.isFinite(adj) ? adj / close : 1;
        highs[i] = c.highs[i] * ratio;
        lows[i] = c.lows[i] * ratio;
      }
      return {
        closes: c.adjCloses,
        highs,
        lows,
        volumes: c.volumes ?? [],
        priceDates: (c as any).dates,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  weekly_on_daily: "Weekly→Daily",
};

const FREQUENCY_TITLES: Record<string, string> = {
  daily: "Compute MAs and detect signals on daily bars.",
  weekly: "Down-sample to weekly bars, then compute MAs and signals on the weekly series.",
  weekly_on_daily: "Compute MAs on weekly bars, then project them back onto daily bars for daily-resolution signals.",
};

// ── Component ──

export default function MACrossoverOptimizer() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [inputSelection, setInputSelection] = usePersistedState<InputSelection>(
    "macross-input-selection",
    defaultInputSelection
  );
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [minHold, setMinHold] = useState(0);
  const [returnBasis, setReturnBasis] = useState<"absolute" | "relative">("absolute");
  const [peerLevel, setPeerLevel] = useState("subsector");
  const [signalType, setSignalType] = useState("crossover");
  const [signalFamily, setSignalFamily] = useState("slope");
  const [slopeLookback, setSlopeLookback] = useState(5);
  const [indicatorSource, setIndicatorSource] = useState("roc");
  const [indicatorSourcePeriod, setIndicatorSourcePeriod] = useState(12);
  const [maType, setMaType] = useState("SMA");
  const [framaFC, setFramaFC] = useState(1);
  const [framaSC, setFramaSC] = useState(198);
  const [t3Vf, setT3Vf] = useState(0.7);
  const [almaOffset, setAlmaOffset] = useState(0.85);
  const [almaSigma, setAlmaSigma] = useState(6);
  const [optimizerMaScope, setOptimizerMaScope] = useState("all");
  const [legA, setLegA] = useState<ComboLeg>({
    kind: "price_cross",
    maType: "SMA",
    fastPeriod: 50,
    slowPeriod: 200,
    polarity: "above",
  });
  const [legB, setLegB] = useState<ComboLeg>({
    kind: "ma_cross",
    maType: "SMA",
    fastPeriod: 50,
    slowPeriod: 200,
    polarity: "above",
  });
  const [mode, setMode] = useState("single");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState<any>(() => createDateRangeFromPreset("10y"));
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState<string>("macross-basket-mode", "stocks");
  const { baskets } = useBaskets();
  const [running, setRunning] = useState(false);
  const { frequency, setFrequency, frequencyUI } = useFrequency("ma", "daily", running);
  const timeframeMode = frequency === "weekly" ? "weekly" : "daily";
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = usePersistedState<any[]>("ma:results", []);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [expandedHits, setExpandedHits] = useState<Set<string>>(new Set());
  const toggleHits = useCallback((key: string) => {
    setExpandedHits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => getScoreWeights(rankBy), [rankBy]);
  const [resultsFilter, setResultsFilter] = useState("");
  const [runSort, setRunSort] = useState<{ col: string; dir: string }>({ col: "score", dir: "desc" });
  const [gridLongSort, setGridLongSort] = useState<{ col: string; dir: string }>({ col: "score", dir: "desc" });
  const [gridShortSort, setGridShortSort] = useState<{ col: string; dir: string }>({ col: "score", dir: "desc" });
  const [gridResults, setGridResults] = usePersistedState<any[]>("ma:gridResults", []);
  const [expandedGridTicker, setExpandedGridTicker] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("ma:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalFastPeriod, setEvalFastPeriod] = useState(50);
  const [evalSlowPeriod, setEvalSlowPeriod] = useState(200);
  const [evalSlowMaType, setEvalSlowMaType] = useState("SMA");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);
  const { universeTickers: universeSet, isFiltered } = useUniverse();

  const tickers = useMemo(
    () => (universeSet ? allTickers.filter((t) => universeSet.has(t.ticker)) : allTickers),
    [allTickers, universeSet]
  );
  const classFilter = useOptimizerClassFilter(tickers, mode === "universe", "ma-clf");
  const pairCombo = usePairComboPicker(
    tickers.map((t) => t.ticker),
    mode === "pairCombo",
    "ma-pc"
  );
  const filteredUniverse = classFilter.filteredTickers;

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
      if (t.length > 0) {
        setPairTickerA((v) => v || t[0].ticker);
        setPairTickerB((v) => v || (t[1]?.ticker ?? t[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (
      tickers.length > 0 &&
      selectedTicker &&
      allTickers.some((t) => t.ticker === selectedTicker) &&
      !tickers.find((t) => t.ticker === selectedTicker)
    )
      setSelectedTicker(tickers[0].ticker);
  }, [tickers, selectedTicker, allTickers]);

  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    abortRef.current = false;
    const scopeTypes = optimizerMaScope === "all" ? [...MA_TYPES] : [optimizerMaScope];
    const dates = await getDates();
    let list: any[];
    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      list = [{ ticker: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "single") {
      const sel = selectedTicker;
      const meta = tickers.find((t) => t.ticker === sel);
      list = meta ? [meta] : sel ? [{ ticker: sel, name: sel }] : [];
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const def = buildBasketOhlc(basketTickers, baskets);
        list = [{ ticker: `BASKET:${def.name}`, name: `BASKET:${def.name}` }];
      } else {
        list = basketTickers.map(
          (d) => tickers.find((t) => t.ticker.toUpperCase() === d.toUpperCase()) ?? { ticker: d, name: d }
        );
      }
    } else if (mode === "pairCombo") {
      if (pairCombo.pairs.length === 0) {
        setRunning(false);
        return;
      }
      list = pairCombo.pairs.map((d: any) => ({ ticker: d.label, name: d.label, pairA: d.a, pairB: d.b }));
    } else list = filteredUniverse;

    if (list.length === 0) {
      setRunning(false);
      return;
    }
    setProgress({ current: 0, total: list.length });
    const combinedBasket = mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;
    const out: any[] = [];

    for (let di = 0; di < list.length && !abortRef.current; di++) {
      const meta = list[di];
      setProgress({ current: di + 1, total: list.length });
      try {
        let closes: number[], priceDates: string[], highs: number[], lows: number[];
        let volumes: number[] | null = null;
        let globalIndices: number[];
        const legAticker = mode === "pairCombo" ? meta.pairA : pairTickerA;
        const legBticker = mode === "pairCombo" ? meta.pairB : pairTickerB;
        if (mode === "pair" || mode === "pairCombo") {
          const ratio = await getYahooPairsRatio(legAticker, legBticker, dates);
          if (!ratio || ratio.indices.length < 252) continue;
          const ratioMap = new Map<number, number>();
          for (let a = 0; a < ratio.indices.length; a++) ratioMap.set(ratio.indices[a], ratio.prices[a]);
          const present: number[] = [];
          for (let a = 0; a < dates.length; a++) if (ratioMap.has(a)) present.push(a);
          const presentDates = present.map((a) => dates[a]);
          const slice = sliceDateRange(presentDates, dateRange);
          const kept = slice ? present.slice((slice as any).start, (slice as any).end + 1) : [];
          if (kept.length < 252) continue;
          closes = kept.map((a) => ratioMap.get(a) as number);
          priceDates = kept.map((a) => dates[a]);
          highs = closes.slice();
          lows = closes.slice();
          globalIndices = kept;
        } else {
          const data = combinedBasket
            ? await getBasketOhlc(combinedBasket, dateRange)
            : await fetchTickerPriceData(meta.ticker, dates, dateRange, inputSelection);
          if (!data || data.closes.length < 252) continue;
          closes = data.closes;
          priceDates = data.priceDates;
          highs = data.highs;
          lows = data.lows;
          volumes = data.volumes;
          const idxMap = new Map<string, number>();
          for (let a = 0; a < dates.length; a++) idxMap.set(dates[a], a);
          globalIndices = priceDates.map((d) => idxMap.get(d) ?? -1);
        }

        const dailyCloses = closes.slice();
        let weekly: any = null;
        if (timeframeMode === "weekly" && mode !== "pair") {
          weekly = weeklyDownsample(
            { dates: priceDates, highs, lows, closes, adjCloses: closes },
            "weekly"
          );
          if (weekly.closes.length < 52) continue;
          if (volumes) {
            const wv = new Array(weekly.dailyIndexMap.length);
            let prevIdx = -1;
            for (let h = 0; h < weekly.dailyIndexMap.length; h++) {
              const di2 = weekly.dailyIndexMap[h];
              let acc = 0;
              for (let a = prevIdx + 1; a <= di2; a++) acc += volumes[a] || 0;
              wv[h] = acc;
              prevIdx = di2;
            }
            volumes = wv;
          }
          closes = weekly.closes;
          priceDates = weekly.dates;
          highs = weekly.highs;
          lows = weekly.lows;
          globalIndices = weekly.dailyIndexMap.map((r: number) => globalIndices[r] ?? -1);
        }
        const baseSeries = weekly ? dailyCloses : closes;
        const mapHit = (i: number) => (weekly ? mapWeeklyIndexToDaily(weekly, i) : i);

        let workClose: number[],
          workHigh: number[],
          workLow: number[],
          workVol: number[] | null = null,
          workDates: string[],
          workGlobal: number[];
        let wodWeekly: any = null;
        let wodHighLow: any = null;
        if (frequency === "weekly") {
          const wc = weeklyClose(closes, priceDates);
          const whl = weeklyHighLow(highs, lows, priceDates);
          workClose = wc.prices;
          workHigh = whl.highs;
          workLow = whl.lows;
          workDates = wc.weekIndex.map((r) => priceDates[r] ?? "");
          workGlobal = wc.weekIndex.map((r) => globalIndices[r] ?? -1);
          if (volumes) {
            const wv = new Array(wc.weekIndex.length);
            let prevIdx = -1;
            for (let a = 0; a < wc.weekIndex.length; a++) {
              const wi = wc.weekIndex[a];
              let acc = 0;
              for (let c = prevIdx + 1; c <= wi; c++) acc += volumes[c] || 0;
              wv[a] = acc;
              prevIdx = wi;
            }
            workVol = wv;
          }
          if (workClose.length < 60) continue;
        } else if (frequency === "weekly_on_daily") {
          workClose = closes;
          workHigh = highs;
          workLow = lows;
          workVol = volumes;
          workDates = priceDates;
          workGlobal = globalIndices;
          wodWeekly = weeklyClose(closes, priceDates);
          wodHighLow = weeklyHighLow(highs, lows, priceDates);
          if (wodWeekly.prices.length < 60) continue;
        } else {
          workClose = closes;
          workHigh = highs;
          workLow = lows;
          workVol = volumes;
          workDates = priceDates;
          workGlobal = globalIndices;
        }
        const barMultiplier = frequency === "weekly" ? 5 : 1;
        const sigPrices = workClose;

        let benchmark: number[] | null = null;
        if (returnBasis === "relative") {
          const peerVal = meta[peerLevel];
          if (peerVal && peerVal.trim() !== "")
            try {
              const peerSeries = await getGroupMedianByIndex(peerLevel, peerVal, meta.ticker, "median");
              const aligned = globalIndices.map((h) => {
                if (h < 0) return NaN;
                const v = peerSeries[h];
                return Number.isFinite(v) ? v : NaN;
              });
              if (frequency === "weekly") {
                const wk: number[] = [];
                let cur = "";
                let last = NaN;
                let started = false;
                for (let a = 0; a < aligned.length; a++) {
                  const key = isoWeekKey(priceDates[a]);
                  if (key !== cur) {
                    if (started) wk.push(last);
                    cur = key;
                    started = true;
                  }
                  if (Number.isFinite(aligned[a])) last = aligned[a];
                }
                if (started) wk.push(last);
                benchmark = wk;
              } else benchmark = aligned;
              if (benchmark) {
                let carry = NaN;
                for (let a = 0; a < benchmark.length; a++)
                  if (Number.isFinite(benchmark[a])) carry = benchmark[a];
                  else benchmark[a] = carry;
              }
            } catch {
              benchmark = null;
            }
        }

        const configs: any[] = [];
        const maForWork = (type: string, period: number): (number | null)[] => {
          if (frequency === "weekly_on_daily" && wodWeekly) {
            const weeklyMa = computeMA(wodWeekly.prices, period, type, {
              highs: wodHighLow?.highs,
              lows: wodHighLow?.lows,
              framaFC,
              framaSC,
              t3VolumeFactor: t3Vf,
              almaOffset,
              almaSigma,
            });
            const projected: (number | null)[] = new Array(workClose.length).fill(null);
            const wi = wodWeekly.weekIndex;
            let k = -1;
            for (let a = 0; a < workClose.length; a++) {
              while (k + 1 < wi.length && wi[k + 1] <= a) k++;
              if (k >= 0 && weeklyMa[k] !== null) projected[a] = weeklyMa[k];
            }
            return projected;
          }
          return computeMA(workClose, period, type, {
            highs: workHigh,
            lows: workLow,
            framaFC,
            framaSC,
            t3VolumeFactor: t3Vf,
            almaOffset,
            almaSigma,
          });
        };
        const burnIn = (p: number) =>
          frequency === "weekly_on_daily"
            ? Math.max(p * 5, 21) + 126
            : frequency === "weekly"
            ? p + Math.ceil(126 / barMultiplier)
            : p + 126;
        const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;

        if (signalType === "crossover") {
          const cache = new Map<string, (number | null)[]>();
          const ma = (type: string, period: number) => {
            const key = `${type}-${period}`;
            let v = cache.get(key);
            if (!v) {
              v = maForWork(type, period);
              cache.set(key, v);
            }
            return v;
          };
          for (const fastType of scopeTypes)
            for (const slowType of scopeTypes)
              for (const fast of FAST_PERIODS)
                for (const slow of SLOW_PERIODS) {
                  if (fast >= slow) continue;
                  const fastMA = ma(fastType, fast);
                  const slowMA = ma(slowType, slow);
                  const profiles: Record<string, ForwardReturnProfile[]> = { golden_cross: [], death_cross: [] };
                  let prevAbove: boolean | null = null;
                  let holdUntil = -1;
                  const start = burnIn(slow);
                  for (let i = start; i < sigPrices.length; i++) {
                    if (fastMA[i] === null || slowMA[i] === null) continue;
                    const above = (fastMA[i] as number) > (slowMA[i] as number);
                    if (prevAbove !== null && above !== prevAbove && i >= holdUntil) {
                      const cat = above ? "golden_cross" : "death_cross";
                      const dir = above ? "buy" : "sell";
                      const hi = mapHit(i);
                      if (hi >= 0)
                        profiles[cat].push(
                          computeForwardProfile(baseSeries, hi, targetReturn, dir, activeBand, minHold, benchmark)
                        );
                      if (minHold > 0) holdUntil = i + minHold;
                    }
                    prevAbove = above;
                  }
                  const cats: any[] = [];
                  for (const [cat, profs] of Object.entries(profiles)) {
                    const dir: "buy" | "sell" = cat === "golden_cross" ? "buy" : "sell";
                    const useBand = returnMode === "band";
                    const summary = summarizeSignals(profs, dir);
                    const composite = computeCompositeScore(summary, dir, useBand);
                    cats.push({
                      category: cat,
                      label: CROSSOVER_DEFS[cat].label,
                      description: CROSSOVER_DEFS[cat].description,
                      summary,
                      composite,
                      profiles: profs,
                    });
                  }
                  const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
                  const same = fastType === slowType;
                  configs.push({
                    config: { signalType: "crossover", maType: fastType, slowMaType: slowType, fastPeriod: fast, slowPeriod: slow },
                    configLabel: same ? `${fastType} ${fast}/${slow}` : `${fastType}${fast}/${slowType}${slow}`,
                    categories: cats,
                    bestCategory: best.category,
                    bestScore: best.composite.score,
                  });
                }
        } else if (signalType === "price_cross") {
          const cache = new Map<string, (number | null)[]>();
          const ma = (type: string, period: number) => {
            const key = `${type}-${period}`;
            let v = cache.get(key);
            if (!v) {
              v = maForWork(type, period);
              cache.set(key, v);
            }
            return v;
          };
          for (const type of scopeTypes)
            for (const period of PRICE_CROSS_PERIODS) {
              const maArr = ma(type, period);
              const profiles: Record<string, ForwardReturnProfile[]> = { price_above: [], price_below: [] };
              let prevAbove: boolean | null = null;
              let holdUntil = -1;
              const start = burnIn(period);
              for (let i = start; i < sigPrices.length; i++) {
                if (maArr[i] === null) continue;
                const above = sigPrices[i] > (maArr[i] as number);
                if (prevAbove !== null && above !== prevAbove && i >= holdUntil) {
                  const cat = above ? "price_above" : "price_below";
                  const dir = above ? "buy" : "sell";
                  const hi = mapHit(i);
                  if (hi >= 0)
                    profiles[cat].push(
                      computeForwardProfile(baseSeries, hi, targetReturn, dir, activeBand, minHold, benchmark)
                    );
                  if (minHold > 0) holdUntil = i + minHold;
                }
                prevAbove = above;
              }
              const cats: any[] = [];
              for (const [cat, profs] of Object.entries(profiles)) {
                const dir: "buy" | "sell" = cat === "price_above" ? "buy" : "sell";
                const useBand = returnMode === "band";
                const summary = summarizeSignals(profs, dir);
                const composite = computeCompositeScore(summary, dir, useBand);
                cats.push({
                  category: cat,
                  label: PRICE_CROSS_DEFS[cat].label,
                  description: PRICE_CROSS_DEFS[cat].description,
                  summary,
                  composite,
                  profiles: profs,
                });
              }
              const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
              configs.push({
                config: { signalType: "price_cross", maType: type, fastPeriod: period, slowPeriod: 0 },
                configLabel: `Price × ${type} ${period}`,
                categories: cats,
                bestCategory: best.category,
                bestScore: best.composite.score,
              });
            }
        } else if (signalType === "combo") {
          const legState = (leg: ComboLeg): (boolean | null)[] => {
            const out: (boolean | null)[] = new Array(sigPrices.length).fill(null);
            const fastMA = maForWork(leg.maType, leg.fastPeriod);
            if (leg.kind === "price_cross")
              for (let i = 0; i < sigPrices.length; i++) {
                if (fastMA[i] === null) continue;
                const above = sigPrices[i] > (fastMA[i] as number);
                out[i] = leg.polarity === "above" ? above : !above;
              }
            else {
              const slowMA = maForWork(legSlowMaType(leg), leg.slowPeriod);
              for (let i = 0; i < sigPrices.length; i++) {
                if (fastMA[i] === null || slowMA[i] === null) continue;
                const above = (fastMA[i] as number) > (slowMA[i] as number);
                out[i] = leg.polarity === "above" ? above : !above;
              }
            }
            return out;
          };
          const aState = legState(legA);
          const bState = legState(legB);
          const profiles: Record<string, ForwardReturnProfile[]> = { combo_bull: [], combo_bear: [] };
          let prevOn: boolean | null = null;
          let holdUntil = -1;
          const start = Math.max(burnIn(legBurnIn(legA)), burnIn(legBurnIn(legB)));
          for (let i = start; i < sigPrices.length; i++) {
            const a = aState[i];
            const b = bState[i];
            if (a === null || b === null) continue;
            const on = a && b;
            if (prevOn !== null && on !== prevOn && i >= holdUntil) {
              const cat = on ? "combo_bull" : "combo_bear";
              const dir = on ? "buy" : "sell";
              const hi = mapHit(i);
              if (hi >= 0)
                profiles[cat].push(
                  computeForwardProfile(baseSeries, hi, targetReturn, dir, activeBand, minHold, benchmark)
                );
              if (minHold > 0) holdUntil = i + minHold;
            }
            prevOn = on;
          }
          const cats: any[] = [];
          for (const [cat, profs] of Object.entries(profiles)) {
            const dir: "buy" | "sell" = cat === "combo_bull" ? "buy" : "sell";
            const useBand = returnMode === "band";
            const summary = summarizeSignals(profs, dir);
            const composite = computeCompositeScore(summary, dir, useBand);
            cats.push({
              category: cat,
              label: COMBO_DEFS[cat].label,
              description: COMBO_DEFS[cat].description,
              summary,
              composite,
              profiles: profs,
            });
          }
          const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
          configs.push({
            config: { signalType: "combo", maType, fastPeriod: 0, slowPeriod: 0, legA, legB },
            configLabel: `${legLabel(legA)} ∧ ${legLabel(legB)}`,
            categories: cats,
            bestCategory: best.category,
            bestScore: best.composite.score,
          });
        } else if (signalType === "slope_curvature") {
          const cache = new Map<string, (number | null)[]>();
          const ma = (type: string, period: number) => {
            const key = `${type}-${period}`;
            let v = cache.get(key);
            if (!v) {
              v = maForWork(type, period);
              cache.set(key, v);
            }
            return v;
          };
          const famSignals = FAMILY_SIGNALS[signalFamily];
          for (const type of scopeTypes)
            for (const period of PRICE_CROSS_PERIODS) {
              const maArr = ma(type, period);
              const start = burnIn(period);
              if (sigPrices.length <= start + 5) continue;
              const detected = detectSlopeCurvatureSignals(sigPrices, maArr, slopeLookback, famSignals, start);
              const cats: any[] = [];
              let total = 0;
              for (const sig of famSignals) {
                const dir = SLOPE_SIGNAL_META[sig].direction;
                const profs: ForwardReturnProfile[] = [];
                let lastIdx = -1;
                for (const idx of detected[sig]) {
                  if (minHold > 0 && lastIdx >= 0 && idx < lastIdx + minHold) continue;
                  const hi = mapHit(idx);
                  if (hi >= 0)
                    profs.push(computeForwardProfile(baseSeries, hi, targetReturn, dir, activeBand, minHold, benchmark));
                  lastIdx = idx;
                }
                const useBand = returnMode === "band";
                const summary = summarizeSignals(profs, dir);
                const composite = computeCompositeScore(summary, dir, useBand);
                total += summary.count;
                cats.push({
                  category: sig,
                  label: SLOPE_SIGNAL_META[sig].label,
                  description: SLOPE_SIGNAL_META[sig].description,
                  summary,
                  composite,
                  profiles: profs,
                });
              }
              if (total < 3) continue;
              const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
              configs.push({
                config: { signalType: "slope_curvature", maType: type, fastPeriod: period, slowPeriod: 0 },
                configLabel: `${type}(${period}) ${FAMILY_LABELS[signalFamily]}`,
                categories: cats,
                bestCategory: best.category,
                bestScore: best.composite.score,
              });
            }
        } else {
          const spec: IndicatorSpec = { kind: indicatorSource, period: indicatorSourcePeriod };
          const indSeries = applyIndicator(workClose, spec);
          const wodInd = frequency === "weekly_on_daily" && wodWeekly ? applyIndicator(wodWeekly.prices, spec) : null;
          const indMA = (type: string, period: number): (number | null)[] => {
            if (frequency === "weekly_on_daily" && wodWeekly && wodInd) {
              const weeklyMa = computeMA(wodInd, period, type, {
                framaFC,
                framaSC,
                t3VolumeFactor: t3Vf,
                almaOffset,
                almaSigma,
              });
              const projected: (number | null)[] = new Array(workClose.length).fill(null);
              const wi = wodWeekly.weekIndex;
              let k = -1;
              for (let a = 0; a < workClose.length; a++) {
                while (k + 1 < wi.length && wi[k + 1] <= a) k++;
                if (k >= 0 && weeklyMa[k] !== null) projected[a] = weeklyMa[k];
              }
              return projected;
            }
            return computeMA(indSeries, period, type, {
              framaFC,
              framaSC,
              t3VolumeFactor: t3Vf,
              almaOffset,
              almaSigma,
            });
          };
          const burn = indicatorBurn(spec);
          const cache = new Map<string, (number | null)[]>();
          const ma = (type: string, period: number) => {
            const key = `${type}-${period}`;
            let v = cache.get(key);
            if (!v) {
              v = indMA(type, period);
              cache.set(key, v);
            }
            return v;
          };
          const famSignals = FAMILY_SIGNALS[signalFamily];
          const indLabel = indicatorLabel(spec);
          for (const type of scopeTypes)
            for (const period of PRICE_CROSS_PERIODS) {
              const maArr = ma(type, period);
              const start = burnIn(period) + burn;
              if (workClose.length <= start + 5) continue;
              const detected = detectSlopeCurvatureSignals(indSeries, maArr, slopeLookback, famSignals, start);
              const cats: any[] = [];
              let total = 0;
              for (const sig of famSignals) {
                const dir = SLOPE_SIGNAL_META[sig].direction;
                const profs: ForwardReturnProfile[] = [];
                let lastIdx = -1;
                for (const idx of detected[sig]) {
                  if (minHold > 0 && lastIdx >= 0 && idx < lastIdx + minHold) continue;
                  const hi = mapHit(idx);
                  if (hi >= 0)
                    profs.push(computeForwardProfile(baseSeries, hi, targetReturn, dir, activeBand, minHold, benchmark));
                  lastIdx = idx;
                }
                const useBand = returnMode === "band";
                const summary = summarizeSignals(profs, dir);
                const composite = computeCompositeScore(summary, dir, useBand);
                total += summary.count;
                cats.push({
                  category: sig,
                  label: SLOPE_SIGNAL_META[sig].label,
                  description: SLOPE_SIGNAL_META[sig].description,
                  summary,
                  composite,
                  profiles: profs,
                });
              }
              if (total < 3) continue;
              const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
              configs.push({
                config: { signalType: "indicator_cross", maType: type, fastPeriod: period, slowPeriod: 0 },
                configLabel: `${indLabel} × ${type}${period} ${FAMILY_LABELS[signalFamily]}`,
                categories: cats,
                bestCategory: best.category,
                bestScore: best.composite.score,
              });
            }
        }

        if (configs.length === 0) continue;
        const bestConfig = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
        const currentSignalByConfig: Record<string, string> = {};
        const currentValueByConfig: Record<string, number> = {};
        const currentDetailByConfig: Record<string, any> = {};
        const last = sigPrices.length - 1;

        for (const cfg of configs) {
          let sig = "None";
          let value: number | null = null;
          if (signalType === "crossover") {
            const fastType = cfg.config.maType;
            const slowType = cfg.config.slowMaType ?? cfg.config.maType;
            const fastMA = maForWork(fastType, cfg.config.fastPeriod);
            const slowMA = maForWork(slowType, cfg.config.slowPeriod);
            if (fastMA[last] !== null && slowMA[last] !== null) {
              for (let i = last; i > Math.max(0, last - 63); i--) {
                if (fastMA[i] === null || slowMA[i] === null || fastMA[i - 1] === null || slowMA[i - 1] === null) continue;
                const nowAbove = (fastMA[i] as number) > (slowMA[i] as number);
                const prevAbove = (fastMA[i - 1] as number) > (slowMA[i - 1] as number);
                if (nowAbove !== prevAbove) {
                  sig = nowAbove ? "Golden Cross" : "Death Cross";
                  break;
                }
              }
              if (sig === "None") sig = (fastMA[last] as number) > (slowMA[last] as number) ? "Above (Bullish)" : "Below (Bearish)";
              if ((slowMA[last] as number) !== 0) value = (fastMA[last] as number) / (slowMA[last] as number) - 1;
              currentDetailByConfig[cfg.configLabel] = {
                price: sigPrices[last],
                fastMA: fastMA[last],
                slowMA: slowMA[last],
                fastType,
                slowType,
                fastPeriod: cfg.config.fastPeriod,
                slowPeriod: cfg.config.slowPeriod,
                freq: frequency,
              };
            }
          } else if (signalType === "price_cross") {
            const maArr = maForWork(cfg.config.maType, cfg.config.fastPeriod);
            if (maArr[last] !== null) {
              for (let i = last; i > Math.max(0, last - 21); i--) {
                if (maArr[i] === null || maArr[i - 1] === null) continue;
                const nowAbove = sigPrices[i] > (maArr[i] as number);
                const prevAbove = sigPrices[i - 1] > (maArr[i - 1] as number);
                if (nowAbove !== prevAbove) {
                  sig = nowAbove ? "Price Cross Above" : "Price Cross Below";
                  break;
                }
              }
              if (sig === "None") sig = sigPrices[last] > (maArr[last] as number) ? "Above MA" : "Below MA";
              if ((maArr[last] as number) !== 0) value = sigPrices[last] / (maArr[last] as number) - 1;
              currentDetailByConfig[cfg.configLabel] = {
                price: sigPrices[last],
                ma: maArr[last],
                maType: cfg.config.maType,
                fastPeriod: cfg.config.fastPeriod,
                freq: frequency,
              };
            }
          } else if (signalType === "combo") {
            const legState = (leg: ComboLeg): (boolean | null)[] => {
              const out: (boolean | null)[] = new Array(sigPrices.length).fill(null);
              const fastMA = maForWork(leg.maType, leg.fastPeriod);
              if (leg.kind === "price_cross")
                for (let i = 0; i < sigPrices.length; i++) {
                  if (fastMA[i] === null) continue;
                  const above = sigPrices[i] > (fastMA[i] as number);
                  out[i] = leg.polarity === "above" ? above : !above;
                }
              else {
                const slowMA = maForWork(legSlowMaType(leg), leg.slowPeriod);
                for (let i = 0; i < sigPrices.length; i++) {
                  if (fastMA[i] === null || slowMA[i] === null) continue;
                  const above = (fastMA[i] as number) > (slowMA[i] as number);
                  out[i] = leg.polarity === "above" ? above : !above;
                }
              }
              return out;
            };
            const aState = legState(legA);
            const bState = legState(legB);
            if (aState[last] !== null && bState[last] !== null) {
              const on = aState[last] && bState[last];
              for (let i = last; i > Math.max(0, last - 63); i--) {
                const a = aState[i];
                const b = bState[i];
                const pa = aState[i - 1];
                const pb = bState[i - 1];
                if (a === null || b === null || pa === null || pb === null) continue;
                const cur = a && b;
                if (cur !== (pa && pb)) {
                  sig = cur ? "Combo Bull" : "Combo Bear";
                  break;
                }
              }
              if (sig === "None") sig = on ? "Combo On" : "Combo Off";
            }
          } else if (signalType === "slope_curvature") {
            const maArr = maForWork(cfg.config.maType, cfg.config.fastPeriod);
            if (maArr[last] !== null) {
              const fam = SLOPE_SIGNAL_META[cfg.bestCategory]?.family;
              currentDetailByConfig[cfg.configLabel] = {
                price: sigPrices[last],
                ma: maArr[last],
                maType: cfg.config.maType,
                fastPeriod: cfg.config.fastPeriod,
                freq: frequency,
              };
              if (fam === "price_cross") {
                sig = sigPrices[last] > (maArr[last] as number) ? "Above MA" : "Below MA";
                if ((maArr[last] as number) !== 0) value = sigPrices[last] / (maArr[last] as number) - 1;
              } else if (fam === "slope" && last > slopeLookback) {
                const s =
                  maArr[last] !== null && maArr[last - slopeLookback] !== null && (maArr[last - slopeLookback] as number) !== 0
                    ? (maArr[last] as number) / (maArr[last - slopeLookback] as number) - 1
                    : NaN;
                sig = Number.isFinite(s) ? (s > 0 ? "Slope Up" : "Slope Down") : "None";
                if (Number.isFinite(s)) value = s;
              } else if (fam === "curvature" && last > slopeLookback + 1) {
                const s1 =
                  maArr[last] !== null && maArr[last - slopeLookback] !== null && (maArr[last - slopeLookback] as number) !== 0
                    ? (maArr[last] as number) / (maArr[last - slopeLookback] as number) - 1
                    : NaN;
                const s2 =
                  maArr[last - 1] !== null && maArr[last - 1 - slopeLookback] !== null && (maArr[last - 1 - slopeLookback] as number) !== 0
                    ? (maArr[last - 1] as number) / (maArr[last - 1 - slopeLookback] as number) - 1
                    : NaN;
                const c = Number.isFinite(s1) && Number.isFinite(s2) ? s1 - s2 : NaN;
                sig = Number.isFinite(c) ? (c > 0 ? "Curvature Up" : "Curvature Down") : "None";
                if (Number.isFinite(c)) value = c;
              }
            }
          } else {
            const spec: IndicatorSpec = { kind: indicatorSource, period: indicatorSourcePeriod };
            const indSeries = applyIndicator(sigPrices, spec);
            const wodInd = frequency === "weekly_on_daily" && wodWeekly ? applyIndicator(wodWeekly.prices, spec) : null;
            const indMA = ((type: string, period: number): (number | null)[] => {
              if (frequency === "weekly_on_daily" && wodWeekly && wodInd) {
                const weeklyMa = computeMA(wodInd, period, type, {
                  framaFC,
                  framaSC,
                  t3VolumeFactor: t3Vf,
                  almaOffset,
                  almaSigma,
                });
                const projected: (number | null)[] = new Array(sigPrices.length).fill(null);
                const wi = wodWeekly.weekIndex;
                let k = -1;
                for (let a = 0; a < sigPrices.length; a++) {
                  while (k + 1 < wi.length && wi[k + 1] <= a) k++;
                  if (k >= 0 && weeklyMa[k] !== null) projected[a] = weeklyMa[k];
                }
                return projected;
              }
              return computeMA(indSeries, period, type, {
                framaFC,
                framaSC,
                t3VolumeFactor: t3Vf,
                almaOffset,
                almaSigma,
              });
            })(cfg.config.maType, cfg.config.fastPeriod);
            const indVal = indSeries[last];
            if (Number.isFinite(indVal) && indMA[last] !== null) {
              const fam = SLOPE_SIGNAL_META[cfg.bestCategory]?.family;
              const sl = indicatorShortLabel(spec);
              currentDetailByConfig[cfg.configLabel] = {
                price: indVal,
                ma: indMA[last],
                maType: cfg.config.maType,
                fastPeriod: cfg.config.fastPeriod,
                freq: frequency,
              };
              if (fam === "price_cross") {
                sig = indVal > (indMA[last] as number) ? `${sl} Above MA` : `${sl} Below MA`;
                value = indVal - (indMA[last] as number);
              } else if (fam === "slope" && last > slopeLookback) {
                const d = indMA[last] !== null && indMA[last - slopeLookback] !== null ? (indMA[last] as number) - (indMA[last - slopeLookback] as number) : NaN;
                sig = Number.isFinite(d) ? (d > 0 ? "Slope Up" : "Slope Down") : "None";
                if (Number.isFinite(d)) value = d;
              } else if (fam === "curvature" && last > slopeLookback + 1) {
                const d1 = indMA[last] !== null && indMA[last - slopeLookback] !== null ? (indMA[last] as number) - (indMA[last - slopeLookback] as number) : NaN;
                const d2 = indMA[last - 1] !== null && indMA[last - 1 - slopeLookback] !== null ? (indMA[last - 1] as number) - (indMA[last - 1 - slopeLookback] as number) : NaN;
                const c = Number.isFinite(d1) && Number.isFinite(d2) ? d1 - d2 : NaN;
                sig = Number.isFinite(c) ? (c > 0 ? "Curvature Up" : "Curvature Down") : "None";
                if (Number.isFinite(c)) value = c;
              }
            }
          }
          currentSignalByConfig[cfg.configLabel] = sig;
          if (value !== null && Number.isFinite(value)) currentValueByConfig[cfg.configLabel] = value;
        }

        if (signalType === "combo")
          for (const cfg of configs)
            if (!currentDetailByConfig[cfg.configLabel])
              currentDetailByConfig[cfg.configLabel] = { price: sigPrices[last], freq: frequency };

        const currentSignal = currentSignalByConfig[bestConfig.configLabel] ?? "None";
        const allDefs: Record<string, { label: string; description: string }> = {
          ...CROSSOVER_DEFS,
          ...PRICE_CROSS_DEFS,
          ...COMBO_DEFS,
          ...Object.fromEntries(
            Object.entries(SLOPE_SIGNAL_META).map(([k, v]) => [k, { label: v.label, description: v.description }])
          ),
        };
        const keepCount = 6;
        const sortedByScore = [...configs].sort((a, b) => b.bestScore - a.bestScore);
        const keepSet = new Set(sortedByScore.slice(0, keepCount).map((c) => c.configLabel));
        for (const cfg of configs)
          if (!keepSet.has(cfg.configLabel))
            for (const cat of cfg.categories) cat.profiles = undefined;

        const priceContext = {
          prices: sigPrices,
          highs: workHigh,
          lows: workLow,
          volumes: workVol,
          dates: workDates,
          globalIndices: workGlobal,
          benchmarkPrices: benchmark,
          mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
          pairLegA: mode === "pair" || mode === "pairCombo" ? legAticker : undefined,
          pairLegB: mode === "pair" || mode === "pairCombo" ? legBticker : undefined,
        };
        out.push({
          ticker: meta.ticker,
          name: meta.name,
          configs,
          bestCategory: allDefs[bestConfig.bestCategory]?.label ?? bestConfig.bestCategory,
          bestScore: bestConfig.bestScore,
          currentSignal,
          currentSignalByConfig,
          currentValueByConfig,
          currentDetailByConfig,
          priceContext,
        });
        if (di % 5 === 0 || di === list.length - 1) setResults([...out]);
      } catch {
        /* skip */
      }
    }
    setResults(out);
    setRunning(false);
  }, [
    tickers, selectedTicker, pairTickerA, pairTickerB, mode, signalType, maType, targetReturn,
    returnMode, bandMin, bandMax, minHold, legA, legB, frequency, signalFamily, slopeLookback,
    returnBasis, peerLevel, framaFC, framaSC, t3Vf, almaOffset, almaSigma, optimizerMaScope,
    dateRange, indicatorSource, indicatorSourcePeriod, filteredUniverse, basketTickers, basketMode,
    baskets, pairCombo.pairs, inputSelection, timeframeMode,
  ]);

  const runEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const dates = await getDates();
      let closes: number[], highs: number[], lows: number[];
      let volumes: number[] | null = null;
      let priceDates: string[];
      let baseTicker = "";
      let globalIndices: number[];
      if (mode === "pair") {
        if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
          setEvaluating(false);
          return;
        }
        const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, dates);
        if (!ratio || ratio.indices.length < 252) {
          setEvaluating(false);
          return;
        }
        const ratioDates = ratio.indices.map((z) => dates[z] ?? "");
        const slice = sliceDateRange(ratioDates, dateRange);
        const keptIdx = slice ? ratio.indices.slice((slice as any).start, (slice as any).end + 1) : [];
        const keptPrices = slice ? ratio.prices.slice((slice as any).start, (slice as any).end + 1) : [];
        if (keptIdx.length < 252) {
          setEvaluating(false);
          return;
        }
        closes = keptPrices;
        priceDates = keptIdx.map((z) => dates[z] ?? "");
        highs = closes.slice();
        lows = closes.slice();
        baseTicker = pairTickerA;
        globalIndices = keptIdx.slice();
      } else if (mode === "basket") {
        if (basketTickers.length === 0) {
          setEvaluating(false);
          return;
        }
        if (basketMode === "combined") {
          const def = buildBasketOhlc(basketTickers, baskets);
          const data = await getBasketOhlc(def, dateRange);
          if (!data || data.closes.length < 252) {
            setEvaluating(false);
            return;
          }
          closes = data.closes;
          priceDates = data.priceDates;
          highs = data.highs;
          lows = data.lows;
          volumes = data.volumes;
          baseTicker = basketTickers[0];
          const idxMap = new Map<string, number>();
          for (let a = 0; a < dates.length; a++) idxMap.set(dates[a], a);
          globalIndices = data.priceDates.map((d) => idxMap.get(d) ?? -1);
        } else {
          const first = basketTickers[0];
          const data = await fetchTickerPriceData(first, dates, dateRange, inputSelection);
          if (!data || data.closes.length < 252) {
            setEvaluating(false);
            return;
          }
          closes = data.closes;
          priceDates = data.priceDates;
          highs = data.highs;
          lows = data.lows;
          volumes = data.volumes;
          baseTicker = first;
          const idxMap = new Map<string, number>();
          for (let a = 0; a < dates.length; a++) idxMap.set(dates[a], a);
          globalIndices = data.priceDates.map((d) => idxMap.get(d) ?? -1);
        }
      } else {
        const sym = mode === "single" ? selectedTicker : tickers[0]?.ticker ?? "";
        if (!sym) {
          setEvaluating(false);
          return;
        }
        const data = await fetchTickerPriceData(sym, dates, dateRange, inputSelection);
        if (!data || data.closes.length < 252) {
          setEvaluating(false);
          return;
        }
        closes = data.closes;
        priceDates = data.priceDates;
        highs = data.highs;
        lows = data.lows;
        volumes = data.volumes;
        baseTicker = sym;
        const idxMap = new Map<string, number>();
        for (let a = 0; a < dates.length; a++) idxMap.set(dates[a], a);
        globalIndices = data.priceDates.map((d) => idxMap.get(d) ?? -1);
      }

      let workClose: number[],
        workHigh: number[],
        workLow: number[],
        workVol: number[] | null = null,
        workDates: string[],
        workGlobal: number[];
      let wodWeekly: any = null;
      let wodHighLow: any = null;
      if (frequency === "weekly") {
        const wc = weeklyClose(closes, priceDates);
        const whl = weeklyHighLow(highs, lows, priceDates);
        if (wc.prices.length < 60) {
          setEvaluating(false);
          return;
        }
        workClose = wc.prices;
        workHigh = whl.highs;
        workLow = whl.lows;
        workDates = wc.weekIndex.map((r) => priceDates[r] ?? "");
        workGlobal = wc.weekIndex.map((r) => globalIndices[r] ?? -1);
        if (volumes) {
          const wv = new Array(wc.weekIndex.length);
          let prevIdx = -1;
          for (let a = 0; a < wc.weekIndex.length; a++) {
            const wi = wc.weekIndex[a];
            let acc = 0;
            for (let c = prevIdx + 1; c <= wi; c++) acc += volumes[c] || 0;
            wv[a] = acc;
            prevIdx = wi;
          }
          workVol = wv;
        }
      } else if (frequency === "weekly_on_daily") {
        wodWeekly = weeklyClose(closes, priceDates);
        wodHighLow = weeklyHighLow(highs, lows, priceDates);
        if (wodWeekly.prices.length < 60) {
          setEvaluating(false);
          return;
        }
        workClose = closes;
        workHigh = highs;
        workLow = lows;
        workVol = volumes;
        workDates = priceDates;
        workGlobal = globalIndices;
      } else {
        workClose = closes;
        workHigh = highs;
        workLow = lows;
        workVol = volumes;
        workDates = priceDates;
        workGlobal = globalIndices;
      }

      const maForWork = (type: string, period: number): (number | null)[] => {
        if (frequency === "weekly_on_daily" && wodWeekly) {
          const weeklyMa = computeMA(wodWeekly.prices, period, type, {
            highs: wodHighLow?.highs,
            lows: wodHighLow?.lows,
            framaFC,
            framaSC,
            t3VolumeFactor: t3Vf,
            almaOffset,
            almaSigma,
          });
          const projected: (number | null)[] = new Array(workClose.length).fill(null);
          const wi = wodWeekly.weekIndex;
          let k = -1;
          for (let a = 0; a < workClose.length; a++) {
            while (k + 1 < wi.length && wi[k + 1] <= a) k++;
            if (k >= 0 && weeklyMa[k] !== null) projected[a] = weeklyMa[k];
          }
          return projected;
        }
        return computeMA(workClose, period, type, {
          highs: workHigh,
          lows: workLow,
          framaFC,
          framaSC,
          t3VolumeFactor: t3Vf,
          almaOffset,
          almaSigma,
        });
      };
      const legState = (leg: ComboLeg): (boolean | null)[] => {
        const out: (boolean | null)[] = new Array(workClose.length).fill(null);
        const fastMA = maForWork(leg.maType, leg.fastPeriod);
        if (leg.kind === "price_cross")
          for (let i = 0; i < workClose.length; i++) {
            if (fastMA[i] === null) continue;
            const above = workClose[i] > (fastMA[i] as number);
            out[i] = leg.polarity === "above" ? above : !above;
          }
        else {
          const slowMA = maForWork(legSlowMaType(leg), leg.slowPeriod);
          for (let i = 0; i < workClose.length; i++) {
            if (fastMA[i] === null || slowMA[i] === null) continue;
            const above = (fastMA[i] as number) > (slowMA[i] as number);
            out[i] = leg.polarity === "above" ? above : !above;
          }
        }
        return out;
      };

      const signalIndices: number[] = [];
      const wantLong = evalSide === "long";
      if (signalType === "crossover") {
        const fastMA = maForWork(maType, evalFastPeriod);
        const slowMA = maForWork(evalSlowMaType, evalSlowPeriod);
        const start = evalSlowPeriod + 5;
        let prevAbove: boolean | null = null;
        for (let i = start; i < workClose.length; i++) {
          if (fastMA[i] === null || slowMA[i] === null) continue;
          const above = (fastMA[i] as number) > (slowMA[i] as number);
          if (prevAbove !== null && above !== prevAbove && ((wantLong && above) || (!wantLong && !above))) signalIndices.push(i);
          prevAbove = above;
        }
      } else if (signalType === "price_cross") {
        const maArr = maForWork(maType, evalFastPeriod);
        const start = evalFastPeriod + 5;
        let prevAbove: boolean | null = null;
        for (let i = start; i < workClose.length; i++) {
          if (maArr[i] === null) continue;
          const above = workClose[i] > (maArr[i] as number);
          if (prevAbove !== null && above !== prevAbove && ((wantLong && above) || (!wantLong && !above))) signalIndices.push(i);
          prevAbove = above;
        }
      } else if (signalType === "combo") {
        const aState = legState(legA);
        const bState = legState(legB);
        const start = Math.max(legBurnIn(legA), legBurnIn(legB)) + 5;
        let prevOn: boolean | null = null;
        for (let i = start; i < workClose.length; i++) {
          const a = aState[i];
          const b = bState[i];
          if (a === null || b === null) continue;
          const on = a && b;
          if (prevOn !== null && on !== prevOn && ((wantLong && on) || (!wantLong && !on))) signalIndices.push(i);
          prevOn = on;
        }
      } else if (signalType === "slope_curvature") {
        const maArr = maForWork(maType, evalFastPeriod);
        const start = evalFastPeriod + 5;
        const famSignals = FAMILY_SIGNALS[signalFamily];
        const detected = detectSlopeCurvatureSignals(workClose, maArr, slopeLookback, famSignals, start);
        const dir = wantLong ? "buy" : "sell";
        const seen = new Set<number>();
        for (const sig of famSignals)
          if (SLOPE_SIGNAL_META[sig].direction === dir)
            for (const idx of detected[sig]) if (!seen.has(idx)) (seen.add(idx), signalIndices.push(idx));
      } else {
        const spec: IndicatorSpec = { kind: indicatorSource, period: indicatorSourcePeriod };
        const indSeries = applyIndicator(workClose, spec);
        const wodInd = frequency === "weekly_on_daily" && wodWeekly ? applyIndicator(wodWeekly.prices, spec) : null;
        const indMA = (() => {
          if (frequency === "weekly_on_daily" && wodWeekly && wodInd) {
            const weeklyMa = computeMA(wodInd, evalFastPeriod, maType, {
              framaFC,
              framaSC,
              t3VolumeFactor: t3Vf,
              almaOffset,
              almaSigma,
            });
            const projected: (number | null)[] = new Array(workClose.length).fill(null);
            const wi = wodWeekly.weekIndex;
            let k = -1;
            for (let a = 0; a < workClose.length; a++) {
              while (k + 1 < wi.length && wi[k + 1] <= a) k++;
              if (k >= 0 && weeklyMa[k] !== null) projected[a] = weeklyMa[k];
            }
            return projected;
          }
          return computeMA(indSeries, evalFastPeriod, maType, {
            framaFC,
            framaSC,
            t3VolumeFactor: t3Vf,
            almaOffset,
            almaSigma,
          });
        })();
        const start = evalFastPeriod + indicatorBurn(spec) + 5;
        const famSignals = FAMILY_SIGNALS[signalFamily];
        const detected = detectSlopeCurvatureSignals(indSeries, indMA, slopeLookback, famSignals, start);
        const dir = wantLong ? "buy" : "sell";
        const seen = new Set<number>();
        for (const sig of famSignals)
          if (SLOPE_SIGNAL_META[sig].direction === dir)
            for (const idx of detected[sig]) if (!seen.has(idx)) (seen.add(idx), signalIndices.push(idx));
      }
      signalIndices.sort((a, b) => a - b);

      let benchmark: number[] | null = null;
      if (returnBasis === "relative" && baseTicker && mode !== "pair") {
        const meta = tickers.find((t) => t.ticker === baseTicker);
        const peerVal = meta ? meta[peerLevel] : "";
        if (peerVal && peerVal.trim() !== "")
          try {
            const peerSeries = await getGroupMedianByIndex(peerLevel, peerVal, baseTicker, "median");
            const aligned = globalIndices.map((z) => {
              if (z < 0) return NaN;
              const v = peerSeries[z];
              return Number.isFinite(v) ? v : NaN;
            });
            let carry = NaN;
            for (let z = 0; z < aligned.length; z++) if (Number.isFinite(aligned[z])) carry = aligned[z];
              else aligned[z] = carry;
            if (frequency === "weekly") {
              const wk: number[] = [];
              let cur = "";
              let last = NaN;
              let started = false;
              for (let a = 0; a < aligned.length; a++) {
                const key = isoWeekKey(priceDates[a]);
                if (key !== cur) {
                  if (started) wk.push(last);
                  cur = key;
                  started = true;
                }
                if (Number.isFinite(aligned[a])) last = aligned[a];
              }
              if (started) wk.push(last);
              benchmark = wk;
            } else benchmark = aligned;
          } catch {
            benchmark = null;
          }
      }

      const result = buildBacktestResult(
        workClose,
        workDates,
        signalIndices,
        evalSide,
        targetReturn,
        minHold,
        benchmark ?? undefined,
        "3M"
      );
      setEvalResult(result);
      setEvalPriceContext({
        prices: workClose,
        highs: workHigh,
        lows: workLow,
        volumes: workVol,
        dates: workDates,
        globalIndices: workGlobal,
        benchmarkPrices: benchmark,
        mode: mode === "pair" ? "pair" : "single",
        pairLegA: mode === "pair" ? pairTickerA : undefined,
        pairLegB: mode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [
    mode, pairTickerA, pairTickerB, selectedTicker, tickers, signalType, maType, evalSlowMaType,
    evalFastPeriod, evalSlowPeriod, legA, legB, signalFamily, slopeLookback, targetReturn, minHold,
    evalSide, framaFC, framaSC, t3Vf, almaOffset, almaSigma, frequency, returnBasis, peerLevel,
    dateRange, indicatorSource, indicatorSourcePeriod, basketTickers, basketMode, baskets, inputSelection,
  ]);

  const setupLabel = useMemo(
    () =>
      signalType === "crossover"
        ? `${maType === evalSlowMaType ? `${maType} ${evalFastPeriod}/${evalSlowPeriod}` : `${maType}${evalFastPeriod}/${evalSlowMaType}${evalSlowPeriod}`} crossover [${evalSide}]`
        : signalType === "price_cross"
        ? `Price × ${maType}${evalFastPeriod} [${evalSide}]`
        : signalType === "combo"
        ? `${legLabel(legA)} ∧ ${legLabel(legB)} [${evalSide}]`
        : signalType === "indicator_cross"
        ? `${indicatorLabel({ kind: indicatorSource, period: indicatorSourcePeriod })} × ${maType}${evalFastPeriod} ${FAMILY_LABELS[signalFamily]} [${evalSide}]`
        : `${maType}(${evalFastPeriod}) ${FAMILY_LABELS[signalFamily]} [${evalSide}]`,
    [signalType, maType, evalSlowMaType, evalFastPeriod, evalSlowPeriod, legA, legB, signalFamily, evalSide, indicatorSource, indicatorSourcePeriod]
  );
  const tickerLabel = useMemo(
    () => (mode === "pair" ? `${pairTickerA || "A"}/${pairTickerB || "B"}` : mode === "single" ? selectedTicker || "—" : tickers[0]?.ticker || "—"),
    [mode, pairTickerA, pairTickerB, selectedTicker, tickers]
  );

  const runGridSearch = useCallback(async () => {
    setRunning(true);
    setGridResults([]);
    abortRef.current = false;
    const dates = await getDates();
    let list: any[];
    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      list = [{ ticker: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "single") {
      const sel = selectedTicker;
      const meta = tickers.find((t) => t.ticker === sel);
      list = meta ? [meta] : sel ? [{ ticker: sel, name: sel }] : [];
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const def = buildBasketOhlc(basketTickers, baskets);
        list = [{ ticker: `BASKET:${def.name}`, name: `BASKET:${def.name}` }];
      } else list = basketTickers.map((d) => tickers.find((t) => t.ticker.toUpperCase() === d.toUpperCase()) ?? { ticker: d, name: d });
    } else if (mode === "pairCombo") {
      if (pairCombo.pairs.length === 0) {
        setRunning(false);
        return;
      }
      list = pairCombo.pairs.map((d: any) => ({ ticker: d.label, name: d.label, pairA: d.a, pairB: d.b }));
    } else list = filteredUniverse;
    if (list.length === 0) {
      setRunning(false);
      return;
    }
    const combinedBasket = mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;
    const scopeTypes = optimizerMaScope === "all" ? [...MA_TYPES] : [optimizerMaScope];
    const comboDefs: { legA: ComboLeg; legB: ComboLeg }[] = [];
    for (const aType of scopeTypes)
      for (const pxPeriod of GRID_PX_PERIODS)
        for (const bFast of scopeTypes)
          for (const bSlow of scopeTypes)
            for (const [fast, slow] of GRID_FAST_SLOW_PAIRS)
              comboDefs.push({
                legA: { kind: "price_cross", maType: aType, fastPeriod: pxPeriod, slowPeriod: 0, polarity: "above" },
                legB: { kind: "ma_cross", maType: bFast, slowMaType: bSlow, fastPeriod: fast, slowPeriod: slow, polarity: "above" },
              });
    const total = list.length * comboDefs.length;
    setProgress({ current: 0, total });
    const out: any[] = [];

    for (let di = 0; di < list.length && !abortRef.current; di++) {
      const meta = list[di];
      try {
        let closes: number[], highs: number[], lows: number[], priceDates: string[], globalIndices: number[];
        const legAticker = mode === "pairCombo" ? meta.pairA : pairTickerA;
        const legBticker = mode === "pairCombo" ? meta.pairB : pairTickerB;
        if (mode === "pair" || mode === "pairCombo") {
          const ratio = await getYahooPairsRatio(legAticker, legBticker, dates);
          if (!ratio || ratio.indices.length < 252) {
            setProgress({ current: (di + 1) * comboDefs.length, total });
            continue;
          }
          const ratioMap = new Map<number, number>();
          for (let z = 0; z < ratio.indices.length; z++) ratioMap.set(ratio.indices[z], ratio.prices[z]);
          const present: number[] = [];
          for (let z = 0; z < dates.length; z++) if (ratioMap.has(z)) present.push(z);
          const presentDates = present.map((z) => dates[z] ?? "");
          const slice = sliceDateRange(presentDates, dateRange);
          const kept = slice ? present.slice((slice as any).start, (slice as any).end + 1) : [];
          if (kept.length < 252) {
            setProgress({ current: (di + 1) * comboDefs.length, total });
            continue;
          }
          closes = kept.map((z) => ratioMap.get(z) as number);
          highs = closes.slice();
          lows = closes.slice();
          priceDates = kept.map((z) => dates[z] ?? "");
          globalIndices = kept;
        } else {
          const data = combinedBasket ? await getBasketOhlc(combinedBasket, dateRange) : await fetchTickerPriceData(meta.ticker, dates, dateRange, inputSelection);
          if (!data || data.closes.length < 252) {
            setProgress({ current: (di + 1) * comboDefs.length, total });
            continue;
          }
          closes = data.closes;
          highs = data.highs;
          lows = data.lows;
          priceDates = data.priceDates;
          const idxMap = new Map<string, number>();
          for (let z = 0; z < dates.length; z++) idxMap.set(dates[z], z);
          globalIndices = data.priceDates.map((d) => idxMap.get(d) ?? -1);
        }
        const dailyCloses = closes.slice();
        let weekly: any = null;
        if (timeframeMode === "weekly" && mode !== "pair") {
          weekly = weeklyDownsample({ dates: priceDates, highs, lows, closes, adjCloses: closes }, "weekly");
          if (weekly.closes.length < 52) {
            setProgress({ current: (di + 1) * comboDefs.length, total });
            continue;
          }
          closes = weekly.closes;
          highs = weekly.highs;
          lows = weekly.lows;
          globalIndices = weekly.dailyIndexMap.map((r: number) => globalIndices[r] ?? -1);
        }
        const baseSeries = weekly ? dailyCloses : closes;
        const mapHit = (i: number) => (weekly ? mapWeeklyIndexToDaily(weekly, i) : i);

        let benchmark: number[] | null = null;
        if (returnBasis === "relative") {
          const peerVal = meta[peerLevel];
          if (peerVal && peerVal.trim() !== "")
            try {
              const peerSeries = await getGroupMedianByIndex(peerLevel, peerVal, meta.ticker, "median");
              const aligned = globalIndices.map((z) => {
                if (z < 0) return NaN;
                const v = peerSeries[z];
                return Number.isFinite(v) ? v : NaN;
              });
              let carry = NaN;
              for (let z = 0; z < aligned.length; z++) if (Number.isFinite(aligned[z])) carry = aligned[z];
                else aligned[z] = carry;
              benchmark = aligned;
            } catch {
              benchmark = null;
            }
        }

        const cache = new Map<string, (number | null)[]>();
        const ma = (type: string, period: number) => {
          const key = `${type}-${period}`;
          let v = cache.get(key);
          if (!v) {
            v = computeMA(closes, period, type, { highs, lows, framaFC, framaSC, t3VolumeFactor: t3Vf, almaOffset, almaSigma });
            cache.set(key, v);
          }
          return v;
        };
        const combos: any[] = [];
        const useBand = returnMode === "band";
        const activeBand: ReturnBand | null = useBand ? { minReturn: bandMin, maxReturn: bandMax } : null;
        for (let g = 0; g < comboDefs.length && !abortRef.current; g++) {
          const def = comboDefs[g];
          const aState = (() => {
            const fastMA = ma(def.legA.maType, def.legA.fastPeriod);
            const arr = new Array(closes.length).fill(null);
            for (let i = 0; i < closes.length; i++) if (fastMA[i] !== null) arr[i] = closes[i] > (fastMA[i] as number);
            return arr;
          })();
          const bState = (() => {
            const fastMA = ma(def.legB.maType, def.legB.fastPeriod);
            const slowMA = ma(legSlowMaType(def.legB), def.legB.slowPeriod);
            const arr = new Array(closes.length).fill(null);
            for (let i = 0; i < closes.length; i++)
              if (fastMA[i] !== null && slowMA[i] !== null) arr[i] = (fastMA[i] as number) > (slowMA[i] as number);
            return arr;
          })();
          const start = Math.max(legBurnIn(def.legA), legBurnIn(def.legB)) + 126;
          const bullProfiles: ForwardReturnProfile[] = [];
          const bearProfiles: ForwardReturnProfile[] = [];
          let prevOn: boolean | null = null;
          let holdUntil = -1;
          for (let i = start; i < closes.length; i++) {
            const a = aState[i];
            const b = bState[i];
            if (a === null || b === null) continue;
            const on = a && b;
            if (prevOn !== null && on !== prevOn && i >= holdUntil) {
              const hi = mapHit(i);
              if (hi >= 0)
                on
                  ? bullProfiles.push(computeForwardProfile(baseSeries, hi, targetReturn, "buy", activeBand, minHold, benchmark))
                  : bearProfiles.push(computeForwardProfile(baseSeries, hi, targetReturn, "sell", activeBand, minHold, benchmark));
              if (minHold > 0) holdUntil = i + minHold;
            }
            prevOn = on;
          }
          const bullSummary = bullProfiles.length > 0 ? summarizeSignals(bullProfiles, "buy") : null;
          const bearSummary = bearProfiles.length > 0 ? summarizeSignals(bearProfiles, "sell") : null;
          const bullScore = bullSummary ? computeCompositeScore(bullSummary, "buy", useBand).score : 0;
          const bearScore = bearSummary ? computeCompositeScore(bearSummary, "sell", useBand).score : 0;
          const bestSide = bullScore >= bearScore ? "bull" : "bear";
          const bestScore = Math.max(bullScore, bearScore);
          combos.push({
            legA: def.legA,
            legB: def.legB,
            legAlabel: legLabel(def.legA),
            legBlabel: legLabel(def.legB),
            bullSummary,
            bullScore,
            bullSignals: bullProfiles.length,
            bearSummary,
            bearScore,
            bearSignals: bearProfiles.length,
            bestSide,
            bestScore,
          });
          if ((g & 31) === 0) {
            setProgress({ current: di * comboDefs.length + g + 1, total });
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        const filtered = combos.filter((c) => c.bullSignals + c.bearSignals > 0);
        filtered.sort((a, b) => b.bestScore - a.bestScore);
        const topCombos = filtered.slice(0, 25);
        out.push({ ticker: meta.ticker, name: meta.name, topCombos });
        setProgress({ current: (di + 1) * comboDefs.length, total });
        setGridResults([...out]);
      } catch {
        setProgress({ current: (di + 1) * comboDefs.length, total });
      }
    }
    setGridResults(out);
    setRunning(false);
  }, [
    tickers, selectedTicker, pairTickerA, pairTickerB, mode, targetReturn, returnMode, bandMin, bandMax,
    minHold, returnBasis, peerLevel, framaFC, framaSC, t3Vf, almaOffset, almaSigma, optimizerMaScope,
    frequency, dateRange, filteredUniverse, basketTickers, basketMode, baskets, pairCombo.pairs, inputSelection, timeframeMode,
  ]);

  const captureState = useCallback(
    () => ({
      selectedTicker,
      targetReturn,
      signalType,
      maType,
      mode,
      results,
      expandedTicker,
      sortBy,
      runSort,
      gridLongSort,
      gridShortSort,
      returnMode,
      bandMin,
      bandMax,
      minHold,
      legA,
      legB,
      gridResults,
      expandedGridTicker,
      frequency,
      signalFamily,
      slopeLookback,
      returnBasis,
      peerLevel,
      framaFC,
      framaSC,
      t3Vf,
      almaOffset,
      almaSigma,
      optimizerMaScope,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      indicatorSource,
      indicatorSourcePeriod,
      inputSelection,
    }),
    [
      selectedTicker, targetReturn, signalType, maType, mode, results, expandedTicker, sortBy, runSort,
      gridLongSort, gridShortSort, returnMode, bandMin, bandMax, minHold, legA, legB, gridResults,
      expandedGridTicker, frequency, signalFamily, slopeLookback, returnBasis, peerLevel, framaFC,
      framaSC, t3Vf, almaOffset, almaSigma, optimizerMaScope, pairTickerA, pairTickerB, basketTickers,
      basketMode, indicatorSource, indicatorSourcePeriod, inputSelection,
    ]
  );

  const restoreState = useCallback(
    (s: any) => {
      if (!s) return;
      if (s.selectedTicker) {
        setSelectedTicker(s.selectedTicker);
        restoredTickerRef.current = true;
      }
      if (typeof s.targetReturn === "number") setTargetReturn(s.targetReturn);
      if (s.returnMode) setReturnMode(s.returnMode);
      if (typeof s.bandMin === "number") setBandMin(s.bandMin);
      if (typeof s.bandMax === "number") setBandMax(s.bandMax);
      if (typeof s.minHold === "number") setMinHold(s.minHold);
      if (s.signalType) setSignalType(s.signalType);
      if (s.frequency === "daily" || s.frequency === "weekly" || s.frequency === "weekly_on_daily") setFrequency(s.frequency);
      else if (s.timeframe === "weekly" && s.frequency === undefined) setFrequency("weekly");
      if (s.signalFamily === "slope" || s.signalFamily === "curvature" || s.signalFamily === "all" || s.signalFamily === "price_cross") setSignalFamily(s.signalFamily);
      if (typeof s.slopeLookback === "number") setSlopeLookback(s.slopeLookback);
      if (s.legA) setLegA(s.legA);
      if (s.legB) setLegB(s.legB);
      if (s.maType) setMaType(s.maType);
      if (s.mode === "single" || s.mode === "universe" || s.mode === "pair" || s.mode === "pairCombo" || s.mode === "basket") setMode(s.mode);
      if (s.pairCombo) pairCombo.hydrate(s.pairCombo);
      if (Array.isArray(s.results)) setResults(s.results);
      if (s.expandedTicker !== undefined) setExpandedTicker(s.expandedTicker);
      if (s.sortBy) setSortBy(s.sortBy);
      if (s.runSort && s.runSort.col && s.runSort.dir) setRunSort(s.runSort);
      if (s.gridLongSort && s.gridLongSort.col && s.gridLongSort.dir) setGridLongSort(s.gridLongSort);
      if (s.gridShortSort && s.gridShortSort.col && s.gridShortSort.dir) setGridShortSort(s.gridShortSort);
      if (Array.isArray(s.gridResults)) setGridResults(s.gridResults);
      if (s.expandedGridTicker !== undefined) setExpandedGridTicker(s.expandedGridTicker);
      if (s.returnBasis === "absolute" || s.returnBasis === "relative") setReturnBasis(s.returnBasis);
      if (typeof s.peerLevel === "string" && CLASSIFICATION_DIMENSION_KEYS.includes(s.peerLevel)) setPeerLevel(s.peerLevel);
      if (typeof s.framaFC === "number" && s.framaFC >= 1) setFramaFC(s.framaFC);
      if (typeof s.framaSC === "number" && s.framaSC > 1) setFramaSC(s.framaSC);
      if (typeof s.t3Vf === "number" && s.t3Vf >= 0 && s.t3Vf <= 1) setT3Vf(s.t3Vf);
      if (typeof s.almaOffset === "number" && s.almaOffset >= 0 && s.almaOffset <= 1) setAlmaOffset(s.almaOffset);
      if (typeof s.almaSigma === "number" && s.almaSigma > 0) setAlmaSigma(s.almaSigma);
      if (s.optimizerMaScope === "all" || (MA_TYPES as readonly string[]).includes(s.optimizerMaScope)) setOptimizerMaScope(s.optimizerMaScope);
      if (Array.isArray(s.basketTickers)) setBasketTickers(s.basketTickers.filter((x: any) => typeof x === "string"));
      if (s.basketMode === "stocks" || s.basketMode === "combined") setBasketMode(s.basketMode);
      if (s.indicatorSource === "price" || s.indicatorSource === "roc" || s.indicatorSource === "rsi" || s.indicatorSource === "momentum") setIndicatorSource(s.indicatorSource);
      if (typeof s.indicatorSourcePeriod === "number" && s.indicatorSourcePeriod >= 1) setIndicatorSourcePeriod(s.indicatorSourcePeriod);
      if (s.inputSelection && typeof s.inputSelection === "object") {
        const sel = s.inputSelection;
        if (sel.kind === "close") setInputSelection({ kind: "close" } as InputSelection);
        else if (sel.kind === "workbook" && typeof sel.metric === "string") setInputSelection({ kind: "workbook", metric: sel.metric } as InputSelection);
      }
    },
    [setInputSelection, pairCombo, setResults, setGridResults, setBasketMode]
  );

  useWorkspaceTab("ma-crossover-optimizer", captureState, restoreState);

  const capturePresetInputs = useCallback(() => {
    const all = captureState();
    const {
      selectedTicker: _a,
      pairTickerA: _b,
      pairTickerB: _c,
      results: _d,
      gridResults: _e,
      expandedTicker: _f,
      expandedGridTicker: _g,
      sortBy: _h,
      runSort: _i,
      gridLongSort: _j,
      gridShortSort: _k,
      ...rest
    } = all as any;
    return rest;
  }, [captureState]);
  const applyPresetInputs = useCallback((s: any) => restoreState(s), [restoreState]);

  // Re-score results by current rankBy
  const scoredResults = useMemo(
    () =>
      results.map((tr) => ({
        ...tr,
        configs: tr.configs.map((cfg: any) => {
          let bestScore = -Infinity;
          let bestCat = cfg.categories[0];
          for (const cat of cfg.categories) {
            const dir =
              cat.category === "golden_cross" || cat.category === "price_above" || cat.category === "combo_bull" || cat.category === "slope_up" || cat.category === "accel_up"
                ? "buy"
                : "sell";
            const sc = pickBestByRankMode(cat.summary, cat.composite.score, dir, scoreWeights);
            if (sc > bestScore) {
              bestScore = sc;
              bestCat = cat;
            }
          }
          return { ...cfg, bestScore, bestCategory: bestCat.category, _bestCategoryResult: bestCat };
        }),
      })),
    [results, scoreWeights]
  );

  const rows = useMemo(
    () =>
      scoredResults.map((tr) => {
        const sideBest = (side: "long" | "short") => {
          let cfg: any = null;
          let cat: any = null;
          let score = -Infinity;
          for (const c of tr.configs) {
            const found = findSideCategory(c, side);
            if (!found || found.summary.count === 0) continue;
            if (c.bestScore > score) {
              score = c.bestScore;
              cfg = c;
              cat = found;
            }
          }
          return cfg && cat ? { cfg, cat, score } : null;
        };
        return { tr, longBest: sideBest("long"), shortBest: sideBest("short") };
      }),
    [scoredResults]
  );

  const rowSortValue = (row: any, col: string): string | number => {
    const { tr, longBest, shortBest } = row;
    const best = longBest && shortBest ? (longBest.score >= shortBest.score ? longBest : shortBest) : longBest ?? shortBest;
    const summary = best?.cat.summary;
    switch (col) {
      case "ticker":
        return tr.ticker;
      case "currentSignal":
        return tr.currentSignal;
      case "side":
        return best === longBest ? "Long" : "Short";
      case "bestConfig":
        return best?.cfg.configLabel ?? "";
      case "bestSignal":
        return best?.cat.label ?? "";
      case "score":
        return Math.max(longBest?.score ?? -1, shortBest?.score ?? -1);
      case "signals":
        return best?.cat.summary.count ?? -1;
      default: {
        const m = col.match(/^(hit|avg|pf)-(1M|2M|3M|6M)$/);
        if (!m || !summary) return -Infinity;
        const [, kind, hz] = m;
        return kind === "hit"
          ? returnMode === "band"
            ? summary.bandHitRate?.[hz] ?? summary.hitRate[hz]
            : summary.hitRate[hz]
          : kind === "avg"
          ? summary.avgReturn[hz]
          : kind === "pf"
          ? summary.profitFactor[hz]
          : -Infinity;
      }
    }
  };

  const filteredRows = useMemo(() => {
    const q = resultsFilter.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.tr.ticker.toLowerCase().includes(q) || (r.tr.name && r.tr.name.toLowerCase().includes(q)))
      : [...rows];
    const { col, dir } = runSort;
    base.sort((a, b) => {
      const av = rowSortValue(a, col);
      const bv = rowSortValue(b, col);
      let cmp = 0;
      if (typeof av === "string" || typeof bv === "string") cmp = String(av).localeCompare(String(bv));
      else cmp = av - bv;
      return dir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [rows, runSort, returnMode, resultsFilter]);

  const toggleRunSort = (col: string) => {
    setRunSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { col, dir: col === "ticker" || col === "currentSignal" || col === "side" || col === "bestConfig" || col === "bestSignal" ? "asc" : "desc" }
    );
  };

  const exportCsv = () => {
    const horizons = FORWARD_HORIZONS.filter((_, i) => i >= 2);
    const rowsOut: any[] = [];
    for (const row of filteredRows) {
      const tr = row.tr;
      for (const side of ["long", "short"] as const) {
        let cfg: any = null;
        let cat: any = null;
        let score = -1;
        for (const c of tr.configs) {
          const found = findSideCategory(c, side);
          if (!found || found.summary.count === 0) continue;
          if (found.composite.score > score) {
            score = found.composite.score;
            cfg = c;
            cat = found;
          }
        }
        const summary = cat?.summary;
        const out: any = {
          ticker: tr.ticker,
          name: tr.name,
          side: side === "long" ? "Long" : "Short",
          currentSignal: tr.currentSignal,
          bestConfig: cfg?.configLabel ?? "",
          bestSignal: cat?.label ?? "",
          score: score < 0 ? null : score,
        };
        horizons.forEach((h) => {
          out[`hitRate_${h.label}`] = summary?.hitRate[h.label] ?? null;
          out[`avgReturn_${h.label}`] = summary?.avgReturn[h.label] ?? null;
          out[`pf_${h.label}`] = summary?.profitFactor[h.label] ?? null;
        });
        rowsOut.push(out);
      }
    }
    const keys = Object.keys(rowsOut[0] || {});
    const csv = [keys.join(","), ...rowsOut.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "ma_crossover_optimizer.csv";
    a.click();
  };

  const signalBadgeColor = (s: string) =>
    s.includes("Combo Bull") || s.includes("Combo On")
      ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
      : s.includes("Combo Bear") || s.includes("Combo Off")
      ? "bg-red-600/20 text-red-400 border-red-600/30"
      : s.includes("Golden") || s.includes("Above") || s.includes("Slope Up") || s.includes("Curvature Up")
      ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
      : s.includes("Death") || s.includes("Below") || s.includes("Slope Down") || s.includes("Curvature Down")
      ? "bg-red-600/20 text-red-400 border-red-600/30"
      : s.includes("Bullish")
      ? "bg-blue-600/20 text-blue-400 border-blue-600/30"
      : s.includes("Bearish")
      ? "bg-orange-600/20 text-orange-400 border-orange-600/30"
      : "bg-muted text-muted-foreground border-border";

  const signalDirection = (s: string) =>
    !s || s === "None"
      ? "neutral"
      : s.includes("Combo Bull") || s.includes("Combo On")
      ? "buy"
      : s.includes("Combo Bear") || s.includes("Combo Off")
      ? "short"
      : s.includes("Golden") || s.includes("Above") || s.includes("Bullish") || s.includes("Slope Up") || s.includes("Curvature Up")
      ? "buy"
      : s.includes("Death") || s.includes("Below") || s.includes("Bearish") || s.includes("Slope Down") || s.includes("Curvature Down")
      ? "short"
      : "neutral";

  const currentSignalFor = (tr: any, label?: string) => {
    if (!label) return "None";
    const byCfg = tr.currentSignalByConfig;
    return byCfg && byCfg[label] ? byCfg[label] : tr.currentSignal;
  };
  const currentValueFor = (tr: any, label?: string) => {
    if (!label) return null;
    const v = tr.currentValueByConfig?.[label];
    return v === undefined || !Number.isFinite(v) ? null : pctSigned(v);
  };
  const currentDetailFor = (tr: any, label?: string) => {
    if (!label) return null;
    const d = tr.currentDetailByConfig?.[label];
    if (!d) return null;
    const fmt = (x: any) => (x === undefined || !Number.isFinite(x) ? "–" : x >= 1e3 ? `$${x.toFixed(0)}` : x >= 10 ? `$${x.toFixed(2)}` : `$${x.toFixed(3)}`);
    const fq = d.freq === "weekly" ? "weekly" : d.freq === "weekly_on_daily" ? "weekly→daily" : "daily";
    return d.ma !== undefined && d.maType && d.fastPeriod !== undefined
      ? `${fmt(d.price)} vs ${d.maType}${d.fastPeriod} ${fmt(d.ma)} · ${fq}`
      : d.fastMA !== undefined && d.slowMA !== undefined && d.fastType && d.slowType
      ? `${d.fastType}${d.fastPeriod} ${fmt(d.fastMA)} vs ${d.slowType}${d.slowPeriod} ${fmt(d.slowMA)} · ${fq}`
      : d.price !== undefined
      ? `${fmt(d.price)} · ${fq}`
      : null;
  };

  const crossoverComboCount = (() => {
    let n = 0;
    for (const f of FAST_PERIODS) for (const s of SLOW_PERIODS) if (f < s) n++;
    return n;
  })();
  const configCount =
    signalType === "crossover"
      ? MA_TYPES.length * MA_TYPES.length * crossoverComboCount
      : signalType === "price_cross" || signalType === "slope_curvature" || signalType === "indicator_cross"
      ? MA_TYPES.length * PRICE_CROSS_PERIODS.length
      : 1;

  const detailTickerForExpanded = expandedTicker;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">MA Cross</h2>
        <div className="flex gap-px">
          <button
            data-testid="ma-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${viewMode === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setViewMode("optimize")}
          >
            Optimize
          </button>
          <button
            data-testid="ma-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${viewMode === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setViewMode("evaluate")}
          >
            Evaluate
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {viewMode === "optimize" ? "Search MA parameter space by hit rate" : "Score one specific MA setup"}
        </span>
      </div>

      {viewMode === "evaluate" ? (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "single" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setMode("single")}
                  >
                    Single
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "pair" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setMode("pair")}
                  >
                    Pair
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "basket" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setMode("basket")}
                  >
                    Basket
                  </button>
                </div>
              </div>
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker tickers={tickers} value={basketTickers} onChange={setBasketTickers} disabled={evaluating} testIdPrefix="ma-eval-basket" />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="ma-eval-basket-mode">
                      {["stocks", "combined"].map((t) => (
                        <button
                          key={t}
                          data-testid={`ma-eval-basket-mode-${t}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setBasketMode(t)}
                          disabled={evaluating}
                          title={t === "stocks" ? "Evaluate the first basket constituent" : "Evaluate a single synthetic series using the basket's weighting scheme"}
                        >
                          {t === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker tickers={tickers} value={isBasketTicker(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} label="Ticker" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={tickers[0]?.ticker ?? null} />
                  </div>
                </div>
              )}
              {mode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}
              {mode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="ma_cross" label="" />
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("long")}
                  >
                    Long
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("short")}
                  >
                    Short
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value)}
                >
                  <option value="crossover">MA Crossover</option>
                  <option value="price_cross">Price Cross MA</option>
                  <option value="combo">Combo (A ∧ B)</option>
                  <option value="slope_curvature">Slope/Curvature</option>
                  <option value="indicator_cross">Indicator × MA</option>
                </select>
              </div>
              <div
                className="flex flex-col gap-0.5"
                title="Frequency at which MAs and signals are computed. Forward-return horizons stay in BAR units of the chosen frequency."
              >
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Frequency</label>
                <div className="flex gap-px">
                  {["daily", "weekly", "weekly_on_daily"].map((t) => (
                    <button
                      key={t}
                      data-testid={`eval-frequency-${t}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${frequency === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setFrequency(t as any)}
                      disabled={evaluating}
                      title={FREQUENCY_TITLES[t]}
                    >
                      {FREQUENCY_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              {signalType !== "combo" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{signalType === "crossover" ? "Fast Type" : "MA Type"}</label>
                  <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={maType} onChange={(e) => setMaType(e.target.value)}>
                    {MA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {signalType === "crossover" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slow Type</label>
                  <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={evalSlowMaType} onChange={(e) => setEvalSlowMaType(e.target.value)}>
                    {MA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(maType === "FRAMA" || (signalType === "crossover" && evalSlowMaType === "FRAMA") || signalType === "combo" || signalType === "slope_curvature" || signalType === "indicator_cross") && (
                <>
                  <div className="flex flex-col gap-0.5" title="FRAMA fast constant (Pine FC). Default 1.">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">FRAMA FC</label>
                    <input data-testid="frama-fc-eval" type="number" min={1} max={200} value={framaFC} onChange={(e) => setFramaFC(Math.max(1, parseInt(e.target.value) || 1))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5" title="FRAMA slow constant (Pine SC). Default 198.">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">FRAMA SC</label>
                    <input data-testid="frama-sc-eval" type="number" min={2} max={500} value={framaSC} onChange={(e) => setFramaSC(Math.max(2, parseInt(e.target.value) || 198))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                </>
              )}
              {(maType === "T3" || (signalType === "crossover" && evalSlowMaType === "T3") || signalType === "combo" || signalType === "slope_curvature" || signalType === "indicator_cross") && (
                <div className="flex flex-col gap-0.5" title="T3 volume factor (0..1). Tillson default 0.7. Higher = more responsive (DEMA-like), lower = smoother (EMA-like).">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">T3 VF</label>
                  <input data-testid="t3-vf-eval" type="number" min={0} max={1} step={0.01} value={t3Vf} onChange={(e) => setT3Vf(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.7)))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                </div>
              )}
              {(maType === "ALMA" || (signalType === "crossover" && evalSlowMaType === "ALMA") || signalType === "combo" || signalType === "slope_curvature" || signalType === "indicator_cross") && (
                <>
                  <div className="flex flex-col gap-0.5" title="ALMA Gaussian peak position (0..1). TradingView default 0.85. Higher = more responsive to recent prices.">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">ALMA Off</label>
                    <input data-testid="alma-offset-eval" type="number" min={0} max={1} step={0.01} value={almaOffset} onChange={(e) => setAlmaOffset(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.85)))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5" title="ALMA Gaussian width. TradingView default 6. Higher = smoother, lower = sharper.">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">ALMA Sig</label>
                    <input data-testid="alma-sigma-eval" type="number" min={0.5} max={50} step={0.5} value={almaSigma} onChange={(e) => setAlmaSigma(Math.max(0.5, parseFloat(e.target.value) || 6))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                </>
              )}
              {signalType !== "combo" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{signalType === "crossover" ? "Fast Period" : "Period"}</label>
                  <input type="number" min={2} max={400} value={evalFastPeriod} onChange={(e) => setEvalFastPeriod(parseInt(e.target.value) || 50)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
                </div>
              )}
              {signalType === "crossover" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slow Period</label>
                  <input type="number" min={3} max={400} value={evalSlowPeriod} onChange={(e) => setEvalSlowPeriod(parseInt(e.target.value) || 200)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
                </div>
              )}
              {(signalType === "slope_curvature" || signalType === "indicator_cross") && (
                <>
                  {signalType === "indicator_cross" && (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Source</label>
                        <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={indicatorSource} onChange={(e) => setIndicatorSource(e.target.value)}>
                          <option value="roc">ROC</option>
                          <option value="rsi">RSI</option>
                          <option value="momentum">Momentum</option>
                          <option value="price">Price</option>
                        </select>
                      </div>
                      {indicatorSource !== "price" && (
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Src Period</label>
                          <input type="number" min={1} max={200} value={indicatorSourcePeriod} onChange={(e) => setIndicatorSourcePeriod(Math.max(1, Math.min(200, parseInt(e.target.value) || 12)))} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Family</label>
                    <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={signalFamily} onChange={(e) => setSignalFamily(e.target.value)}>
                      <option value="price_cross">{signalType === "indicator_cross" ? "Ind × MA" : "Price Cross"}</option>
                      <option value="slope">Slope</option>
                      <option value="curvature">Curvature</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slope LB</label>
                    <input type="number" min={2} max={50} value={slopeLookback} onChange={(e) => setSlopeLookback(parseInt(e.target.value) || 5)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input type="number" step={0.5} min={0.5} value={+(targetReturn * 100).toFixed(4)} onChange={(e) => setTargetReturn((parseFloat(e.target.value) || 5) / 100)} title="Hit-rate threshold in percent. 5 = 5%." className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input type="number" min={0} value={minHold} onChange={(e) => setMinHold(parseInt(e.target.value) || 0)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((p: any) => (
                    <button
                      key={p.value}
                      data-testid={`ma-date-preset-${p.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                      onClick={() => {
                        setDatePreset(p.value);
                        setDateRange(createDateRangeFromPreset(p.value));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  data-testid="ma-date-start"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, start: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input
                  type="date"
                  data-testid="ma-date-end"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, end: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button data-testid="ma-eval-run" className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={runEvaluate} disabled={evaluating}>
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
            {signalType === "combo" && (
              <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                Using Combo legs from Optimize tab: {legLabel(legA)} ∧ {legLabel(legB)}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorPanelResult result={evalResult} loading={evaluating} setupLabel={setupLabel} tickerLabel={tickerLabel} />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <EvaluatorPanelLoader
                ticker={evalPriceContext.mode === "pair" ? evalPriceContext.pairLegA || "" : selectedTicker || tickers[0]?.ticker || ""}
                priceContext={evalPriceContext}
                signals={evalResult.profiles}
                direction={evalSide === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${setupLabel} on ${tickerLabel}`}
                useBand={false}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          <PresetBar kind="ma" captureInputs={capturePresetInputs} applyInputs={applyPresetInputs} />
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground tracking-tight">MA Crossover</h2>
                  {isFiltered && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                      {tickers.length}/{allTickers.length}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    Yahoo Finance
                  </span>
                  {refreshedAt && (
                    <span className="text-[9px] font-mono text-muted-foreground">{Math.round((Date.now() - refreshedAt) / 6e4)}m ago</span>
                  )}
                  <button
                    onClick={async () => {
                      const t = selectedTicker;
                      if (t) {
                        setRefreshing(true);
                        try {
                          await refreshTickerData(t);
                          setRefreshedAt(Date.now());
                        } catch {
                        } finally {
                          setRefreshing(false);
                        }
                      }
                    }}
                    disabled={refreshing}
                    title="Force refresh Yahoo price cache"
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {refreshing ? "…" : "↻"}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Test MA crossover &amp; price-cross-MA signals against forward returns</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
                <div className="flex gap-px">
                  {["crossover", "price_cross", "combo", "slope_curvature", "indicator_cross"].map((t) => (
                    <button
                      key={t}
                      data-testid={`signal-type-${t}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalType === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setSignalType(t)}
                      disabled={running}
                      title={t === "indicator_cross" ? "Apply an MA to an indicator (ROC, RSI, Momentum) instead of price. Detects indicator-vs-MA crossings plus slope/curvature of the MA-of-indicator." : undefined}
                    >
                      {t === "crossover" ? "MA Crossover" : t === "price_cross" ? "Price × MA" : t === "combo" ? "Combo" : t === "slope_curvature" ? "Slope/Curv" : "Indicator × MA"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-0.5" title="Relative: subtract the peer-group median return at each horizon. Peer group = tickers sharing the chosen classification value.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Basis</label>
                <div className="flex gap-px">
                  {["absolute", "relative"].map((t) => (
                    <button
                      key={t}
                      data-testid={`return-basis-${t}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnBasis === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setReturnBasis(t as any)}
                      disabled={running}
                    >
                      {t === "absolute" ? "Absolute" : "Relative"}
                    </button>
                  ))}
                </div>
              </div>
              {returnBasis === "relative" && (
                <div className="flex flex-col gap-0.5" title="Each ticker is compared to the median forward return of all tickers sharing its value at this classification level.">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Peer Level</label>
                  <select data-testid="peer-level" className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-1" value={peerLevel} onChange={(e) => setPeerLevel(e.target.value)} disabled={running}>
                    <option value="economy">Economy</option>
                    <option value="sector">Sector</option>
                    <option value="subsector">Subsector</option>
                    <option value="industryGroup">Ind. Group</option>
                    <option value="industry">Industry</option>
                    <option value="subindustry">Subindustry</option>
                  </select>
                </div>
              )}
              {signalType === "indicator_cross" && (
                <>
                  <div className="flex flex-col gap-0.5" title="Series to feed into the MA. ROC = pct change over N bars. RSI = Wilder's RSI. Momentum = price[i] - price[i-N]. Price = same as Price × MA mode.">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Source</label>
                    <select data-testid="indicator-source" className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={indicatorSource} onChange={(e) => setIndicatorSource(e.target.value)} disabled={running}>
                      <option value="roc">ROC</option>
                      <option value="rsi">RSI</option>
                      <option value="momentum">Momentum</option>
                      <option value="price">Price</option>
                    </select>
                  </div>
                  {indicatorSource !== "price" && (
                    <div className="flex flex-col gap-0.5" title="Indicator lookback period (in current-frequency bars).">
                      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Src Period</label>
                      <input type="number" min={1} max={200} step={1} data-testid="indicator-source-period" className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14" value={indicatorSourcePeriod} onChange={(e) => setIndicatorSourcePeriod(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} disabled={running} />
                    </div>
                  )}
                </>
              )}
              {(signalType === "slope_curvature" || signalType === "indicator_cross") && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Family</label>
                    <div className="flex gap-px">
                      {["price_cross", "slope", "curvature", "all"].map((t) => (
                        <button
                          key={t}
                          data-testid={`signal-family-${t}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalFamily === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setSignalFamily(t)}
                          disabled={running}
                          title={t === "price_cross" && signalType === "indicator_cross" ? "Indicator vs MA-of-indicator crossings" : FAMILY_DESCRIPTIONS[t]}
                        >
                          {t === "price_cross" ? (signalType === "indicator_cross" ? "Ind × MA" : "Px × MA") : FAMILY_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Slope lookback in bars (matches selected frequency). Slope = (MA[i] / MA[i−L]) − 1">
                      Slope LB
                    </label>
                    <input type="number" min={1} max={100} step={1} data-testid="slope-lookback" className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-12" value={slopeLookback} onChange={(e) => setSlopeLookback(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} disabled={running} title={`Slope lookback: ${slopeLookback} ${frequency === "weekly" ? "weekly" : "daily"} bars`} />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5" title="Run Optimizer scope. 'All' scans every MA type with mixed fast/slow combinations. Picking a single type restricts the search to that one MA only — useful for finding the best setup for a specific MA.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Scope</label>
                <select data-testid="optimizer-ma-scope" className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={optimizerMaScope} onChange={(e) => setOptimizerMaScope(e.target.value)} disabled={running}>
                  <option value="all">All (mixed)</option>
                  {MA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} only
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5" title="FRAMA fast constant (Pine FC). Default 1. Lower = more responsive when market trends.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">FRAMA FC</label>
                <input data-testid="frama-fc" type="number" min={1} max={200} step={1} value={framaFC} onChange={(e) => setFramaFC(Math.max(1, parseInt(e.target.value) || 1))} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex flex-col gap-0.5" title="FRAMA slow constant (Pine SC). Default 198. Higher = more smoothing when market is choppy.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">FRAMA SC</label>
                <input data-testid="frama-sc" type="number" min={2} max={500} step={1} value={framaSC} onChange={(e) => setFramaSC(Math.max(2, parseInt(e.target.value) || 198))} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex flex-col gap-0.5" title="T3 volume factor (0..1). Tillson default 0.7. Higher = more responsive (DEMA-like), lower = smoother (EMA-like).">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">T3 VF</label>
                <input data-testid="t3-vf" type="number" min={0} max={1} step={0.01} value={t3Vf} onChange={(e) => setT3Vf(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.7)))} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex flex-col gap-0.5" title="ALMA Gaussian peak position (0..1). TradingView default 0.85. Higher = more responsive to recent prices, lower = smoother.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">ALMA Off</label>
                <input data-testid="alma-offset" type="number" min={0} max={1} step={0.01} value={almaOffset} onChange={(e) => setAlmaOffset(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.85)))} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex flex-col gap-0.5" title="ALMA Gaussian width. TradingView default 6. Larger = wider/smoother, smaller = tighter/sharper.">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">ALMA Sig</label>
                <input data-testid="alma-sigma" type="number" min={0.5} max={50} step={0.5} value={almaSigma} onChange={(e) => setAlmaSigma(Math.max(0.5, parseFloat(e.target.value) || 6))} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((p: any) => (
                    <button
                      key={p.value}
                      data-testid={`ma-date-preset-${p.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                      onClick={() => {
                        setDatePreset(p.value);
                        setDateRange(createDateRangeFromPreset(p.value));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input type="date" data-testid="ma-date-start" value={dateRange.start} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input type="date" data-testid="ma-date-end" value={dateRange.end} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
              </div>
              {signalType === "combo" && (
                <>
                  {(["A", "B"] as const).map((t) => {
                    const leg = t === "A" ? legA : legB;
                    const setLeg = t === "A" ? setLegA : setLegB;
                    const tid = (suffix: string) => `leg-${t.toLowerCase()}-${suffix}`;
                    return (
                      <div key={t} className="flex flex-col gap-0.5 border border-border rounded px-2 py-1 bg-background/40">
                        <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Leg {t}</label>
                        <div className="flex items-center gap-1 flex-wrap">
                          <select data-testid={tid("kind")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" value={leg.kind} onChange={(e) => setLeg({ ...leg, kind: e.target.value as any })} disabled={running}>
                            <option value="price_cross">Px vs MA</option>
                            <option value="ma_cross">MA vs MA</option>
                          </select>
                          <select data-testid={tid("polarity")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" value={leg.polarity} onChange={(e) => setLeg({ ...leg, polarity: e.target.value as any })} disabled={running} title="For Px vs MA: price above/below MA. For MA vs MA: fast MA above/below slow MA.">
                            <option value="above">above</option>
                            <option value="below">below</option>
                          </select>
                          <select data-testid={tid("ma-type")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" value={leg.maType} onChange={(e) => setLeg({ ...leg, maType: e.target.value })} disabled={running} title={leg.kind === "ma_cross" ? "Fast MA type" : "MA type"}>
                            {MA_TYPES.map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                          <input type="number" min="2" max="400" step="1" data-testid={tid("fast")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 w-12" value={leg.fastPeriod} onChange={(e) => setLeg({ ...leg, fastPeriod: Math.max(2, Math.min(400, Math.floor(Number(e.target.value) || 0))) })} disabled={running} title="Fast period (or single MA period for Px vs MA)" />
                          {leg.kind === "ma_cross" && (
                            <>
                              <span className="text-[10px] font-mono text-muted-foreground px-0.5">vs</span>
                              <select data-testid={tid("slow-ma-type")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" value={legSlowMaType(leg)} onChange={(e) => setLeg({ ...leg, slowMaType: e.target.value })} disabled={running} title="Slow MA type — can differ from fast MA type">
                                {MA_TYPES.map((w) => (
                                  <option key={w} value={w}>
                                    {w}
                                  </option>
                                ))}
                              </select>
                              <input type="number" min="2" max="400" step="1" data-testid={tid("slow")} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 w-12" value={leg.slowPeriod} onChange={(e) => setLeg({ ...leg, slowPeriod: Math.max(2, Math.min(400, Math.floor(Number(e.target.value) || 0))) })} disabled={running} title="Slow period" />
                            </>
                          )}
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground" data-testid={tid("label")}>
                          {legLabel(leg)}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {["single", "universe", "pair", "pairCombo", "basket"].map((t) => (
                    <button
                      key={t}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setMode(t)}
                      disabled={running}
                      data-testid={`optimizer-mode-${t}`}
                    >
                      {t === "single" ? "Single Ticker" : t === "universe" ? "Universe" : t === "pair" ? "Pair (A/B)" : t === "pairCombo" ? "Pair Combo" : "Basket"}
                    </button>
                  ))}
                </div>
              </div>
              {mode !== "pair" && mode !== "pairCombo" && frequencyUI}
              {mode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                  {pairCombo.ui}
                </div>
              )}
              {mode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full" data-testid="ma-clf-row">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className="flex items-end gap-2">
                    <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                      <UnifiedTickerPicker tickers={tickers} value={isBasketTicker(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} disabled={running} label="Ticker" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                      <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={tickers[0]?.ticker ?? null} />
                    </div>
                  </div>
                </div>
              )}
              {mode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                  <span className="text-[10px] font-mono text-muted-foreground pb-1">
                    Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                  </span>
                </div>
              )}
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker tickers={tickers} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="ma-basket" />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="ma-basket-mode">
                      {["stocks", "combined"].map((t) => (
                        <button
                          key={t}
                          data-testid={`ma-basket-mode-${t}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setBasketMode(t)}
                          disabled={running}
                          title={t === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                        >
                          {t === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
                <div className="flex gap-px">
                  {["threshold", "band"].map((t) => (
                    <button
                      key={t}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setReturnMode(t as any)}
                      disabled={running}
                    >
                      {t === "threshold" ? "Threshold" : "Band"}
                    </button>
                  ))}
                </div>
              </div>
              {returnMode === "threshold" ? (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
                  <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]" value={targetReturn} onChange={(e) => setTargetReturn(Number(e.target.value))} disabled={running}>
                    {TARGET_THRESHOLDS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Band</label>
                    <select
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]"
                      value={`${bandMin}-${bandMax}`}
                      onChange={(e) => {
                        const [mn, mx] = e.target.value.split("-").map(Number);
                        setBandMin(mn);
                        setBandMax(mx);
                      }}
                      disabled={running}
                    >
                      {RETURN_BAND_PRESETS.map((p) => (
                        <option key={p.label} value={`${p.band.minReturn}-${p.band.maxReturn}`}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                    <input type="number" step="1" min="0" max="100" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={Math.round(bandMin * 100)} onChange={(e) => setBandMin(Number(e.target.value) / 100)} disabled={running} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                    <input type="number" step="1" min="0" max="100" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={Math.round(bandMax * 100)} onChange={(e) => setBandMax(Number(e.target.value) / 100)} disabled={running} />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum holding period in trading days. Hit/peak/trough detection ignores the first N days, and new signals are suppressed during the hold window. 0 = off.">
                  Min Hold
                </label>
                <input type="number" step="1" min="0" max="126" data-testid="min-hold" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={minHold} onChange={(e) => setMinHold(Math.max(0, Math.min(126, Math.floor(Number(e.target.value) || 0))))} disabled={running} title="Trading days. Forces hold for at least N days before counting hits and before allowing a new signal." />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                {running ? (
                  <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500" onClick={() => { abortRef.current = true; }}>
                    Cancel ({progress.current}/{progress.total})
                  </button>
                ) : (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={runOptimizer}
                    title={signalType === "combo" ? "Test the specific Leg A + Leg B combo configured in the header against every ticker. Output: per-ticker hit rate for THIS one combo." : "Sweep the full MA-type × period parameter space and rank results by hit rate."}
                  >
                    {signalType === "combo" ? "Test Combo" : "Run Optimizer"}
                  </button>
                )}
              </div>
              {signalType === "combo" && !running && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                  <button
                    data-testid="grid-search-btn"
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={runGridSearch}
                    title={`Brute-force search ${GRID_TOTAL_COMBOS} combo variations per ticker and rank them by hit rate. Searches: ${MA_TYPES.length} Leg A types × ${GRID_PX_PERIODS.length} Px periods × ${MA_TYPES.length} Leg B fast types × ${MA_TYPES.length} Leg B slow types × ${GRID_FAST_SLOW_PAIRS.length} fast/slow pairs. Fast and slow MAs can differ. Each combo evaluated for both bull and bear. Use this to discover the best combo per ticker; use "Test Combo" to backtest one chosen combo across all tickers.`}
                  >
                    Find Best Combo ({GRID_TOTAL_COMBOS})
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && gridResults.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Tests SMA/EMA/HMA/WMA/KAMA crossover, price-cross-MA, and combo signals against forward returns
              </div>
            )}

            {signalType === "combo" && gridResults.length > 0 && (
              <div className="mb-6" data-testid="grid-results">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Find Best Combo — {gridResults.length} ticker{gridResults.length !== 1 ? "s" : ""} — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
                    {minHold > 0 ? ` — min hold ${minHold}d` : ""}
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">Top 25 combos per ticker, ranked by composite score</span>
                </div>
                {gridResults.map((t) => {
                  const open = expandedGridTicker === t.ticker;
                  const bullSorted = [...t.topCombos].filter((p: any) => p.bullSignals > 0).sort((p: any, v: any) => v.bullScore - p.bullScore).slice(0, 25);
                  const bearSorted = [...t.topCombos].filter((p: any) => p.bearSignals > 0).sort((p: any, v: any) => v.bearScore - p.bearScore).slice(0, 25);
                  const longRows = sortGridCombos(bullSorted, "long", gridLongSort);
                  const shortRows = sortGridCombos(bearSorted, "short", gridShortSort);
                  const topLong = bullSorted[0];
                  const topShort = bearSorted[0];
                  const longHeader = (col: string, base: string) => `${base} cursor-pointer select-none hover:text-foreground ${gridLongSort.col === col ? "text-foreground" : ""}`;
                  const longArrow = (col: string) => (gridLongSort.col === col ? (gridLongSort.dir === "desc" ? " ▼" : " ▲") : "");
                  const longClick = (col: string) =>
                    setGridLongSort((q) => (q.col === col ? { col, dir: q.dir === "desc" ? "asc" : "desc" } : { col, dir: col === "legA" || col === "legB" || col === "side" ? "asc" : "desc" }));
                  const shortHeader = (col: string, base: string) => `${base} cursor-pointer select-none hover:text-foreground ${gridShortSort.col === col ? "text-foreground" : ""}`;
                  const shortArrow = (col: string) => (gridShortSort.col === col ? (gridShortSort.dir === "desc" ? " ▼" : " ▲") : "");
                  const shortClick = (col: string) =>
                    setGridShortSort((q) => (q.col === col ? { col, dir: q.dir === "desc" ? "asc" : "desc" } : { col, dir: col === "legA" || col === "legB" || col === "side" ? "asc" : "desc" }));
                  return (
                    <div key={t.ticker} className="mb-3 border border-border rounded overflow-hidden">
                      <button className="w-full flex items-start justify-between px-3 py-2 bg-card hover:bg-accent text-left" onClick={() => setExpandedGridTicker(open ? null : t.ticker)} data-testid={`grid-row-${t.ticker}`}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold font-mono text-foreground w-16">{t.ticker}</span>
                            <span className="text-[10px] text-muted-foreground">{t.name}</span>
                          </div>
                          {topLong && (
                            <div className="flex items-center gap-2 ml-16">
                              <span className="text-[10px] font-mono text-muted-foreground w-20">best long:</span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Combo Bull</span>
                              <span className="text-[10px] font-mono text-foreground">
                                {topLong.legAlabel} ∧ {topLong.legBlabel}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${scoreTextColor(topLong.bullScore)}`}>score {topLong.bullScore.toFixed(0)}</span>
                            </div>
                          )}
                          {topShort && (
                            <div className="flex items-center gap-2 ml-16">
                              <span className="text-[10px] font-mono text-muted-foreground w-20">best short:</span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-red-600/20 text-red-400 border-red-600/30">Combo Bear</span>
                              <span className="text-[10px] font-mono text-foreground">
                                {topShort.legAlabel} ∧ {topShort.legBlabel}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${scoreTextColor(topShort.bearScore)}`}>score {topShort.bearScore.toFixed(0)}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground self-center">
                          {open ? "▾" : "▸"} L:{longRows.length} S:{shortRows.length}
                        </span>
                      </button>
                      {open && (
                        <div className="overflow-x-auto bg-background">
                          {longRows.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-emerald-600/10 border-b border-emerald-600/20">
                                <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wider">Top Long Combos — Bull Signals</span>
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="bg-card border-b border-border">
                                  <tr className="text-muted-foreground">
                                    <th className="text-left px-2 py-1 font-medium">#</th>
                                    <th className={longHeader("side", "text-left px-2 py-1 font-medium")} onClick={() => longClick("side")} data-testid={`sort-grid-long-${t.ticker}-side`}>Side{longArrow("side")}</th>
                                    <th className={longHeader("legA", "text-left px-2 py-1 font-medium")} onClick={() => longClick("legA")} data-testid={`sort-grid-long-${t.ticker}-legA`}>Leg A (Px vs MA){longArrow("legA")}</th>
                                    <th className={longHeader("legB", "text-left px-2 py-1 font-medium")} onClick={() => longClick("legB")} data-testid={`sort-grid-long-${t.ticker}-legB`}>Leg B (MA vs MA){longArrow("legB")}</th>
                                    <th className={longHeader("signals", "text-right px-2 py-1 font-medium")} onClick={() => longClick("signals")} data-testid={`sort-grid-long-${t.ticker}-signals`}>Signals{longArrow("signals")}</th>
                                    <th className={longHeader("hit-1M", "text-right px-2 py-1 font-medium")} onClick={() => longClick("hit-1M")} data-testid={`sort-grid-long-${t.ticker}-hit-1M`}>Hit 1M{longArrow("hit-1M")}</th>
                                    <th className={longHeader("hit-3M", "text-right px-2 py-1 font-medium")} onClick={() => longClick("hit-3M")} data-testid={`sort-grid-long-${t.ticker}-hit-3M`}>Hit 3M{longArrow("hit-3M")}</th>
                                    <th className={longHeader("hit-6M", "text-right px-2 py-1 font-medium")} onClick={() => longClick("hit-6M")} data-testid={`sort-grid-long-${t.ticker}-hit-6M`}>Hit 6M{longArrow("hit-6M")}</th>
                                    <th className={longHeader("avg-3M", "text-right px-2 py-1 font-medium")} onClick={() => longClick("avg-3M")} data-testid={`sort-grid-long-${t.ticker}-avg-3M`}>Avg 3M{longArrow("avg-3M")}</th>
                                    <th className={longHeader("pf-3M", "text-right px-2 py-1 font-medium")} onClick={() => longClick("pf-3M")} data-testid={`sort-grid-long-${t.ticker}-pf-3M`}>PF 3M{longArrow("pf-3M")}</th>
                                    <th className={longHeader("score", "text-right px-2 py-1 font-medium")} onClick={() => longClick("score")} data-testid={`sort-grid-long-${t.ticker}-score`}>Score{longArrow("score")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {longRows.map((p: any, v: number) => {
                                    const s = p.bullSummary;
                                    return (
                                      <tr key={`l-${v}`} className="border-b border-border/50 hover:bg-accent/30">
                                        <td className="px-2 py-1 text-muted-foreground">{v + 1}</td>
                                        <td className="px-2 py-1">
                                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Long</span>
                                        </td>
                                        <td className="px-2 py-1">{p.legAlabel}</td>
                                        <td className="px-2 py-1">{p.legBlabel}</td>
                                        <td className="px-2 py-1 text-right text-muted-foreground">{p.bullSignals}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["1M"] !== null && s?.hitRate["1M"] !== undefined ? hitRateColor(s.hitRate["1M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["1M"] !== null && s?.hitRate["1M"] !== undefined ? pct(s.hitRate["1M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["3M"] !== null && s?.hitRate["3M"] !== undefined ? hitRateColor(s.hitRate["3M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["3M"] !== null && s?.hitRate["3M"] !== undefined ? pct(s.hitRate["3M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["6M"] !== null && s?.hitRate["6M"] !== undefined ? hitRateColor(s.hitRate["6M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["6M"] !== null && s?.hitRate["6M"] !== undefined ? pct(s.hitRate["6M"]) : "—"}</td>
                                        <td className="px-2 py-1 text-right">{s?.avgReturn["3M"] !== null && s?.avgReturn["3M"] !== undefined ? pctSigned(s.avgReturn["3M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.profitFactor["3M"] !== null && s?.profitFactor["3M"] !== undefined ? profitFactorColor(s.profitFactor["3M"]) : "text-muted-foreground/40"}`}>{s?.profitFactor["3M"] !== null && s?.profitFactor["3M"] !== undefined ? s.profitFactor["3M"].toFixed(2) : "—"}</td>
                                        <td className={`px-2 py-1 text-right font-bold ${scoreTextColor(p.bullScore)}`}>{p.bullScore.toFixed(0)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          )}
                          {shortRows.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-red-600/10 border-b border-t border-red-600/20">
                                <span className="text-[10px] font-bold font-mono text-red-400 uppercase tracking-wider">Top Short Combos — Bear Signals</span>
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="bg-card border-b border-border">
                                  <tr className="text-muted-foreground">
                                    <th className="text-left px-2 py-1 font-medium">#</th>
                                    <th className={shortHeader("side", "text-left px-2 py-1 font-medium")} onClick={() => shortClick("side")} data-testid={`sort-grid-short-${t.ticker}-side`}>Side{shortArrow("side")}</th>
                                    <th className={shortHeader("legA", "text-left px-2 py-1 font-medium")} onClick={() => shortClick("legA")} data-testid={`sort-grid-short-${t.ticker}-legA`}>Leg A (Px vs MA){shortArrow("legA")}</th>
                                    <th className={shortHeader("legB", "text-left px-2 py-1 font-medium")} onClick={() => shortClick("legB")} data-testid={`sort-grid-short-${t.ticker}-legB`}>Leg B (MA vs MA){shortArrow("legB")}</th>
                                    <th className={shortHeader("signals", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("signals")} data-testid={`sort-grid-short-${t.ticker}-signals`}>Signals{shortArrow("signals")}</th>
                                    <th className={shortHeader("hit-1M", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("hit-1M")} data-testid={`sort-grid-short-${t.ticker}-hit-1M`}>Hit 1M{shortArrow("hit-1M")}</th>
                                    <th className={shortHeader("hit-3M", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("hit-3M")} data-testid={`sort-grid-short-${t.ticker}-hit-3M`}>Hit 3M{shortArrow("hit-3M")}</th>
                                    <th className={shortHeader("hit-6M", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("hit-6M")} data-testid={`sort-grid-short-${t.ticker}-hit-6M`}>Hit 6M{shortArrow("hit-6M")}</th>
                                    <th className={shortHeader("avg-3M", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("avg-3M")} data-testid={`sort-grid-short-${t.ticker}-avg-3M`}>Avg 3M{shortArrow("avg-3M")}</th>
                                    <th className={shortHeader("pf-3M", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("pf-3M")} data-testid={`sort-grid-short-${t.ticker}-pf-3M`}>PF 3M{shortArrow("pf-3M")}</th>
                                    <th className={shortHeader("score", "text-right px-2 py-1 font-medium")} onClick={() => shortClick("score")} data-testid={`sort-grid-short-${t.ticker}-score`}>Score{shortArrow("score")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {shortRows.map((p: any, v: number) => {
                                    const s = p.bearSummary;
                                    return (
                                      <tr key={`s-${v}`} className="border-b border-border/50 hover:bg-accent/30">
                                        <td className="px-2 py-1 text-muted-foreground">{v + 1}</td>
                                        <td className="px-2 py-1">
                                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-red-600/20 text-red-400 border-red-600/30">Short</span>
                                        </td>
                                        <td className="px-2 py-1">{p.legAlabel}</td>
                                        <td className="px-2 py-1">{p.legBlabel}</td>
                                        <td className="px-2 py-1 text-right text-muted-foreground">{p.bearSignals}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["1M"] !== null && s?.hitRate["1M"] !== undefined ? hitRateColor(s.hitRate["1M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["1M"] !== null && s?.hitRate["1M"] !== undefined ? pct(s.hitRate["1M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["3M"] !== null && s?.hitRate["3M"] !== undefined ? hitRateColor(s.hitRate["3M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["3M"] !== null && s?.hitRate["3M"] !== undefined ? pct(s.hitRate["3M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.hitRate["6M"] !== null && s?.hitRate["6M"] !== undefined ? hitRateColor(s.hitRate["6M"]) : "text-muted-foreground/40"}`}>{s?.hitRate["6M"] !== null && s?.hitRate["6M"] !== undefined ? pct(s.hitRate["6M"]) : "—"}</td>
                                        <td className="px-2 py-1 text-right">{s?.avgReturn["3M"] !== null && s?.avgReturn["3M"] !== undefined ? pctSigned(s.avgReturn["3M"]) : "—"}</td>
                                        <td className={`px-2 py-1 text-right ${s?.profitFactor["3M"] !== null && s?.profitFactor["3M"] !== undefined ? profitFactorColor(s.profitFactor["3M"]) : "text-muted-foreground/40"}`}>{s?.profitFactor["3M"] !== null && s?.profitFactor["3M"] !== undefined ? s.profitFactor["3M"].toFixed(2) : "—"}</td>
                                        <td className={`px-2 py-1 text-right font-bold ${scoreTextColor(p.bearScore)}`}>{p.bearScore.toFixed(0)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          )}
                          <div className="px-2 py-2 flex justify-end gap-2">
                            {topLong && (
                              <button className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setLegA(topLong.legA); setLegB(topLong.legB); }} data-testid={`apply-top-long-${t.ticker}`}>
                                Apply Top Long
                              </button>
                            )}
                            {topShort && (
                              <button className="text-[10px] font-mono px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={() => { setLegA(topShort.legA); setLegB(topShort.legB); }} data-testid={`apply-top-short-${t.ticker}`}>
                                Apply Top Short
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {running && results.length === 0 && gridResults.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Computing MA signals...</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} {signalType === "combo" ? "combos" : "tickers × " + configCount + " configs"}
                  </div>
                  <div className="w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {filteredRows.length}
                    {resultsFilter ? ` of ${results.length}` : ""} tickers — {signalType === "combo" ? `combo: ${legLabel(legA)} ∧ ${legLabel(legB)}` : `${maType} ${signalType === "crossover" ? "crossover" : "price cross"}`} — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
                    {returnBasis === "relative" ? ` — vs ${peerLevel} median` : ""}
                  </h3>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Filter ticker / name…"
                      value={resultsFilter}
                      onChange={(e) => setResultsFilter(e.target.value)}
                      data-testid="input-results-filter"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {resultsFilter && (
                      <button onClick={() => setResultsFilter("")} data-testid="button-clear-results-filter" className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground">
                        Clear
                      </button>
                    )}
                    <span className="text-[9px] font-mono text-muted-foreground/70 mx-1">click column to sort</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                      <select data-testid="ma-rank-by" value={rankBy} onChange={(e) => setRankBy(e.target.value)} className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">
                        {RANK_BY_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={exportCsv} data-testid="export-csv">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-card text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                        {(() => {
                          const hcls = (col: string, base: string) => `${base} cursor-pointer select-none hover:text-foreground ${runSort.col === col ? "text-foreground" : ""}`;
                          const arrow = (col: string) => (runSort.col === col ? (runSort.dir === "desc" ? " ▼" : " ▲") : "");
                          return (
                            <>
                              <th className={hcls("ticker", "text-left px-2 py-1 font-bold sticky left-0 bg-card z-30 border-r border-border")} onClick={() => toggleRunSort("ticker")} data-testid="sort-header-ticker">Ticker{arrow("ticker")}</th>
                              <th className={hcls("currentSignal", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("currentSignal")} data-testid="sort-header-currentSignal">Current Signal{arrow("currentSignal")}</th>
                              <th className={hcls("side", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("side")} data-testid="sort-header-side">Side{arrow("side")}</th>
                              <th className={hcls("bestConfig", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("bestConfig")} data-testid="sort-header-bestConfig">Best Config{arrow("bestConfig")}</th>
                              <th className={hcls("bestSignal", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("bestSignal")} data-testid="sort-header-bestSignal">Best Signal{arrow("bestSignal")}</th>
                              <th className={hcls("signals", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("signals")} data-testid="sort-header-signals">N{arrow("signals")}</th>
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <th key={h.label} className={hcls(`hit-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort(`hit-${h.label}`)} data-testid={`sort-header-hit-${h.label}`}>
                                  {returnMode === "band" ? "Band" : "Hit"} {h.label}{arrow(`hit-${h.label}`)}
                                </th>
                              ))}
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <th key={`avg-${h.label}`} className={hcls(`avg-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort(`avg-${h.label}`)} data-testid={`sort-header-avg-${h.label}`}>
                                  Avg {h.label}{arrow(`avg-${h.label}`)}
                                </th>
                              ))}
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <th key={`pf-${h.label}`} className={hcls(`pf-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort(`pf-${h.label}`)} data-testid={`sort-header-pf-${h.label}`}>
                                  PF {h.label}{arrow(`pf-${h.label}`)}
                                </th>
                              ))}
                              <th className={hcls("score", "text-center px-2 py-1 font-bold bg-card")} onClick={() => toggleRunSort("score")} data-testid="sort-header-score">Score{arrow("score")}</th>
                            </>
                          );
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.flatMap((row) => {
                        const tr = row.tr;
                        const expanded = expandedTicker === tr.ticker;
                        return [
                          { key: "long" as const, data: row.longBest },
                          { key: "short" as const, data: row.shortBest },
                        ].map(({ key, data }, p) => {
                          const sideLabel = key === "long" ? "Long" : "Short";
                          const sideBadge = key === "long" ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-red-600/20 text-red-400 border-red-600/30";
                          const summary = data?.cat.summary ?? null;
                          const score = data?.score ?? 0;
                          const first = p === 0;
                          const curSig = currentSignalFor(tr, data?.cfg.configLabel);
                          const curVal = currentValueFor(tr, data?.cfg.configLabel);
                          const rawVal = data ? tr.currentValueByConfig?.[data.cfg.configLabel] : undefined;
                          const curDetail = currentDetailFor(tr, data?.cfg.configLabel);
                          const dir = signalDirection(curSig);
                          const rowCls = expanded ? "bg-primary/10" : dir === "buy" ? "bg-emerald-600/10 hover:bg-emerald-600/15" : dir === "short" ? "bg-red-600/10 hover:bg-red-600/15" : "hover:bg-white/5";
                          return (
                            <tr key={`${tr.ticker}-${key}`} className={`${rowCls} cursor-pointer ${first ? "border-t border-border" : "border-t border-border/30"}`} onClick={() => setExpandedTicker(expanded ? null : tr.ticker)} data-testid={`row-${tr.ticker}-${key}`}>
                              <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{first ? tr.ticker : ""}</td>
                              <td className="text-center px-2 py-1">
                                {data ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${signalBadgeColor(curSig)}`} data-testid={`current-signal-${tr.ticker}-${key}`}>
                                        {curSig}
                                      </span>
                                      {curVal && <span className={`text-[10px] font-bold tabular-nums ${(rawVal ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{curVal}</span>}
                                    </div>
                                    {curDetail && (
                                      <div className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap" title={curDetail} data-testid={`current-signal-detail-${tr.ticker}-${key}`}>
                                        {curDetail}
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </td>
                              <td className="text-center px-2 py-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${sideBadge}`}>{sideLabel}</span>
                              </td>
                              <td className="text-center px-2 py-1 text-muted-foreground">{data ? data.cfg.configLabel : "–"}</td>
                              <td className="text-center px-2 py-1 text-foreground">{data ? data.cat.label : "–"}</td>
                              <td className="text-center px-2 py-1 text-muted-foreground tabular-nums">{summary ? summary.count : "–"}</td>
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => {
                                const rate = summary ? (returnMode === "band" ? summary.bandHitRate?.[h.label] ?? summary.hitRate[h.label] : summary.hitRate[h.label]) : 0;
                                return (
                                  <td key={h.label} className={`text-center px-2 py-1 ${summary ? hitRateColor(rate) : ""}`}>
                                    {summary ? pct(rate) : "–"}
                                  </td>
                                );
                              })}
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${summary ? (summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                                  {summary ? pctSigned(summary.avgReturn[h.label]) : "–"}
                                </td>
                              ))}
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${summary ? profitFactorColor(summary.profitFactor[h.label]) : ""}`}>
                                  {summary ? (summary.profitFactor[h.label] >= 99 ? "∞" : summary.profitFactor[h.label].toFixed(2)) : "–"}
                                </td>
                              ))}
                              <td className="text-center px-2 py-1">
                                {data ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: scoreColor(score), color: scoreTextColor(score) }}>
                                    {score.toFixed(0)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">–</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>

                {detailTickerForExpanded &&
                  (() => {
                    const tr = scoredResults.find((s) => s.ticker === detailTickerForExpanded);
                    if (!tr) return null;
                    const sortedConfigs = [...tr.configs].sort((a: any, b: any) => b.bestScore - a.bestScore);
                    return (
                      <div className="border border-border rounded p-3 bg-card/50 mb-4">
                        <h4 className="text-xs font-bold text-foreground mb-1">
                          {tr.ticker} — {tr.name}
                        </h4>
                        <p className="text-[9px] text-muted-foreground mb-3">{sortedConfigs.length} configurations tested — showing top results</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {sortedConfigs.slice(0, 6).map((cfg: any, ci: number) => {
                            const bestCat = cfg._bestCategoryResult ?? cfg.categories.reduce((a: any, b: any) => (a.composite.score > b.composite.score ? a : b), cfg.categories[0]);
                            return (
                              <div key={ci} className="border border-border/50 rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-mono font-bold text-foreground">{cfg.configLabel}</span>
                                  <span className="text-[9px] text-muted-foreground">→ {bestCat.label}</span>
                                  <span className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: scoreColor(cfg.bestScore), color: scoreTextColor(cfg.bestScore) }}>
                                    {cfg.bestScore}
                                  </span>
                                </div>
                                {cfg.categories
                                  .filter((c: any) => c.summary.count > 0)
                                  .map((cat: any) => {
                                    const hitKey = `${tr.ticker}::${cfg.configLabel}::${cat.category}`;
                                    const hitsOpen = expandedHits.has(hitKey);
                                    const canHits = !!(cat.profiles && cat.profiles.length >= 10 && tr.priceContext);
                                    const catDir = cat.category === "golden_cross" || cat.category === "price_above" || cat.category === "combo_bull" || cat.category === "slope_up" || cat.category === "accel_up" ? "buy" : "sell";
                                    return (
                                      <div key={cat.category} className="mt-1">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span className={`text-[9px] font-bold ${signalBadgeColor(cat.label).split(" ").filter((c: string) => c.startsWith("text-")).join(" ")}`}>{cat.label}</span>
                                          <span className="text-[8px] text-muted-foreground">{cat.summary.count} signals</span>
                                          {canHits ? (
                                            <button
                                              type="button"
                                              onClick={() => toggleHits(hitKey)}
                                              className={`ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${hitsOpen ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                                              title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                            >
                                              {hitsOpen ? "▾" : "▸"} Hit Conditions
                                            </button>
                                          ) : null}
                                        </div>
                                        <table className="w-full text-[9px] font-mono">
                                          <thead>
                                            <tr className="text-muted-foreground">
                                              <th className="text-left px-1 py-0.5">Hz</th>
                                              <th className="text-center px-1 py-0.5">Hit</th>
                                              <th className="text-center px-1 py-0.5">Win</th>
                                              <th className="text-center px-1 py-0.5">Avg</th>
                                              <th className="text-center px-1 py-0.5">Med</th>
                                              <th className="text-center px-1 py-0.5">Peak</th>
                                              <th className="text-center px-1 py-0.5">Trough</th>
                                              <th className="text-center px-1 py-0.5">PF</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {FORWARD_HORIZONS.map((h) => (
                                              <tr key={h.label}>
                                                <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                                                <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.hitRate[h.label])}`}>{pct(cat.summary.hitRate[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.winRate[h.label])}`}>{pct(cat.summary.winRate[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.avgReturn[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.medianReturn[h.label])}</td>
                                                <td className="text-center px-1 py-0.5 text-green-400">{pctSigned(cat.summary.avgPeak[h.label])}</td>
                                                <td className="text-center px-1 py-0.5 text-red-400">{pctSigned(cat.summary.avgTrough[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${profitFactorColor(cat.summary.profitFactor[h.label])}`}>{cat.summary.profitFactor[h.label] >= 99 ? "∞" : cat.summary.profitFactor[h.label].toFixed(2)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {hitsOpen && tr.priceContext && cat.profiles ? (
                                          <div className="mt-2">
                                            <EvaluatorPanelLoader
                                              ticker={(tr.priceContext.mode === "pair" && tr.priceContext.pairLegA) || tr.ticker}
                                              priceContext={tr.priceContext}
                                              signals={cat.profiles}
                                              direction={catDir}
                                              title={`${cfg.configLabel} — ${cat.label}`}
                                              useBand={returnMode === "band"}
                                            />
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
