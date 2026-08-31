// MA Crossover optimizer kernel — extracted from MACrossoverOptimizer.tsx so
// the MA-combo sweep can run in a Web Worker (workers/maSweep.worker.ts) with
// the same function doubling as the main-thread fallback. Pure compute.
import { computeForwardProfile, summarizeSignals, computeCompositeScore } from "@/lib/forwardReturns";
import type { ForwardReturnProfile, ReturnBand } from "@/lib/forwardReturns";
import { mapWeeklyIndexToDaily } from "@/lib/weeklyDownsample";
import { yieldMain } from "@/lib/yieldMain";

// ── Slope/Curvature signal families ──

export const FAMILY_SIGNALS: Record<string, string[]> = {
  price_cross: ["price_above", "price_below"],
  slope: ["slope_up", "slope_down"],
  curvature: ["accel_up", "accel_down"],
  all: ["price_above", "price_below", "slope_up", "slope_down", "accel_up", "accel_down"],
};

export const SLOPE_SIGNAL_META: Record<
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

export function rocSeries(arr: (number | null)[], lookback: number): number[] {
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

export function diffSeries(arr: number[]): number[] {
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

export function findZeroCrossings(arr: number[], dir: "up" | "down"): number[] {
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

export function detectSlopeCurvatureSignals(
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

export function rocTransform(arr: number[], lookback: number): number[] {
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

export function rsiTransform(arr: number[], period: number): number[] {
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

export function momentumTransform(arr: number[], period: number): number[] {
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

export interface IndicatorSpec {
  kind: string;
  period?: number;
}

export function applyIndicator(arr: number[], spec: IndicatorSpec): number[] {
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

export function indicatorLabel(spec: IndicatorSpec): string {
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

export function indicatorShortLabel(spec: IndicatorSpec): string {
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

export function indicatorBurn(spec: IndicatorSpec): number {
  return spec.kind === "price" ? 0 : spec.period ?? 14;
}

// ── MA types & metadata ──

export const MA_TYPES = ["SMA", "EMA", "HMA", "WMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"] as const;

export const FAMILY_LABELS: Record<string, string> = {
  price_cross: "Price Cross",
  slope: "Slope",
  curvature: "Curvature",
  all: "All",
};

export const FAMILY_DESCRIPTIONS: Record<string, string> = {
  price_cross: "Price crosses above/below the MA",
  slope: "MA slope flips sign — trend turns up or down",
  curvature: "MA curvature flips sign — slope accelerates / decelerates",
  all: "All six signals: price-cross + slope + curvature",
};

export interface ComboLeg {
  kind: "price_cross" | "ma_cross";
  maType: string;
  slowMaType?: string;
  fastPeriod: number;
  slowPeriod: number;
  polarity: "above" | "below";
}

export function legSlowMaType(leg: ComboLeg): string {
  return leg.slowMaType ?? leg.maType;
}

export const CROSSOVER_DEFS: Record<string, { label: string; description: string }> = {
  golden_cross: {
    label: "Golden Cross",
    description: "Fast MA crosses above slow MA — bullish trend change",
  },
  death_cross: {
    label: "Death Cross",
    description: "Fast MA crosses below slow MA — bearish trend change",
  },
};

export const PRICE_CROSS_DEFS: Record<string, { label: string; description: string }> = {
  price_above: {
    label: "Price Cross Above",
    description: "Price crosses above MA from below — bullish breakout",
  },
  price_below: {
    label: "Price Cross Below",
    description: "Price crosses below MA from above — bearish breakdown",
  },
};

export const COMBO_DEFS: Record<string, { label: string; description: string }> = {
  combo_bull: {
    label: "Combo Bull",
    description: "Both legs flipped to true together — confluence entry",
  },
  combo_bear: {
    label: "Combo Bear",
    description: "At least one leg dropped — confluence broken",
  },
};

export const FAST_PERIODS = [10, 20, 50];
export const SLOW_PERIODS = [50, 100, 200];
export const PRICE_CROSS_PERIODS = Array.from({ length: 100 }, (_, i) => (i + 1) * 2);

// ── MA computation ──

export function computeSMA(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeEMA(prices: number[], period: number): (number | null)[] {
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

export function computeHMA(prices: number[], period: number): (number | null)[] {
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

export function computeWMA(prices: number[], period: number): (number | null)[] {
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

export function computeKAMA(prices: number[], period: number): (number | null)[] {
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

export function computeFRAMA(
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

export function computeT3(prices: number[], period: number, vf = 0.7): (number | null)[] {
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

export function computeALMA(prices: number[], period: number, offset = 0.85, sigma = 6): (number | null)[] {
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

export function linregMA(prices: number[], period: number, offset = 0): (number | null)[] {
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

export function computeLSMA(prices: number[], period: number, offset = 0): (number | null)[] {
  return linregMA(prices, period, offset);
}

export function computeSLSMA(prices: number[], period: number, offset = 0): (number | null)[] {
  const first = linregMA(prices, period, offset);
  return linregMA(first as number[], period, offset);
}

export interface MaOpts {
  highs?: number[];
  lows?: number[];
  framaFC?: number;
  framaSC?: number;
  t3VolumeFactor?: number;
  almaOffset?: number;
  almaSigma?: number;
  lsmaOffset?: number;
}

export function computeMA(prices: number[], period: number, type: string, opts?: MaOpts): (number | null)[] {
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

export function legLabel(leg: ComboLeg): string {
  const op = leg.polarity === "above" ? ">" : "<";
  return leg.kind === "price_cross"
    ? `Px ${op} ${leg.maType}${leg.fastPeriod}`
    : `${leg.maType}${leg.fastPeriod} ${op} ${legSlowMaType(leg)}${leg.slowPeriod}`;
}

export function maBurnFactor(type: string): number {
  return type === "SLSMA" ? 2 : 1.25;
}

export function legBurnIn(leg: ComboLeg): number {
  const fast = leg.fastPeriod;
  const slow = leg.kind === "price_cross" ? 0 : leg.slowPeriod;
  const maxP = Math.max(fast, slow);
  const factor = Math.max(maBurnFactor(leg.maType), maBurnFactor(legSlowMaType(leg)));
  return Math.ceil(maxP * factor) + Math.ceil(Math.sqrt(maxP));
}

// ── Per-ticker sweep (the block the page used to run inline) ──

export interface MaSweepPayload {
  scopeTypes: string[];
  signalType: string;
  signalFamily: string;
  frequency: string;
  weekly: any;
  baseSeries: number[];
  sigPrices: number[];
  workClose: number[];
  workHigh: number[];
  workLow: number[];
  wodWeekly: any;
  wodHighLow: any;
  framaFC: number;
  framaSC: number;
  t3Vf: number;
  almaOffset: number;
  almaSigma: number;
  slopeLookback: number;
  indicatorSource: string;
  indicatorSourcePeriod: number;
  maType: string;
  legA: ComboLeg;
  legB: ComboLeg;
  returnMode: string;
  bandMin: number;
  bandMax: number;
  targetReturn: number;
  minHold: number;
  benchmark: number[] | null;
  barMultiplier: number;
}

export interface MaSweepResult {
  configs: any[];
  bestCategoryKey: string;
  bestScore: number;
  currentSignal: string;
  currentSignalByConfig: Record<string, string>;
  currentValueByConfig: Record<string, number>;
  currentDetailByConfig: Record<string, any>;
}

export async function runMaSweep(pl: MaSweepPayload): Promise<MaSweepResult | null> {
  const { scopeTypes, signalType, signalFamily, frequency, weekly, baseSeries, sigPrices,
    workClose, workHigh, workLow, wodWeekly, wodHighLow, framaFC, framaSC, t3Vf,
    almaOffset, almaSigma, slopeLookback, indicatorSource, indicatorSourcePeriod,
    maType, legA, legB, returnMode, bandMin, bandMax, targetReturn, minHold,
    benchmark, barMultiplier } = pl;
  const mapHit = (i: number) => (weekly ? mapWeeklyIndexToDaily(weekly, i) : i);
    const configs: any[] = [];
    const maForWork = (type: string, period: number): (number | null)[] => {
      if (frequency.endsWith("_on_daily") && wodWeekly) {
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
      frequency.endsWith("_on_daily")
        ? Math.max(p * (frequency === "monthly_on_daily" ? 21 : 5), 21) + 126
        : frequency === "weekly" || frequency === "monthly"
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
      for (const fastType of scopeTypes) {
        await yieldMain(); // fallback responsiveness; cheap in a worker
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
      for (const type of scopeTypes) {
        await yieldMain(); // fallback responsiveness; cheap in a worker
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
      for (const type of scopeTypes) {
        await yieldMain(); // fallback responsiveness; cheap in a worker
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
      }
    } else {
      const spec: IndicatorSpec = { kind: indicatorSource, period: indicatorSourcePeriod };
      const indSeries = applyIndicator(workClose, spec);
      const wodInd = frequency.endsWith("_on_daily") && wodWeekly ? applyIndicator(wodWeekly.prices, spec) : null;
      const indMA = (type: string, period: number): (number | null)[] => {
        if (frequency.endsWith("_on_daily") && wodWeekly && wodInd) {
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
      for (const type of scopeTypes) {
        await yieldMain(); // fallback responsiveness; cheap in a worker
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
    }

    if (configs.length === 0) return null;
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
        const wodInd = frequency.endsWith("_on_daily") && wodWeekly ? applyIndicator(wodWeekly.prices, spec) : null;
        const indMA = ((type: string, period: number): (number | null)[] => {
          if (frequency.endsWith("_on_daily") && wodWeekly && wodInd) {
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
  return {
    configs,
    bestCategoryKey: bestConfig.bestCategory,
    bestScore: bestConfig.bestScore,
    currentSignal,
    currentSignalByConfig,
    currentValueByConfig,
    currentDetailByConfig,
  };
}
