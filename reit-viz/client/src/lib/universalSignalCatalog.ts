// Universal Hit-Rate Screener — signal catalog.
//
// A declarative registry of every screenable signal across four families
// (technical / event / valuation / pair). Each entry exposes a pure
// `detect(bundle, params, direction)` that returns bar indices into
// `bundle.dates`; the sweep engine feeds those indices into the shared
// backtest kernel (`buildBacktestResult` in EvaluatorPanel), so hit-rate
// semantics are identical across families. For pairs, `bundle.closes` is the
// ratio A÷B and the same detectors apply.
//
// All detectors are cross-into-zone style (previous bar outside the
// condition, current bar inside — the same pattern the optimizer pages use),
// which naturally deduplicates consecutive firings.

import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeMACD,
  computeROC,
  computeBollingerBands,
  computeSlowStochastic,
  computeSupertrend,
  computeDonchian,
  computeWilliamsR,
  type DataPoint,
  type OhlcBar,
} from "@/lib/indicators";

export type SignalFamily = "technical" | "event" | "valuation" | "pair";
export type SignalDirection = "long" | "short";

export interface SeriesBundle {
  /** "AVB" for singles, "AVB/EQR" for pairs. */
  subject: string;
  dates: string[];
  /** Close series; for pairs this is the ratio A÷B. */
  closes: number[];
  opens?: number[];
  highs?: number[];
  lows?: number[];
  /** May be all-zero (fetchOhlcSeries fallback) — volume signals must gate. */
  volumes?: number[];
  benchCloses?: number[];
  /** Valuation metric series forward-aligned to `dates` (workbook tickers). */
  valuation?: Record<string, (number | null)[]>;
  pair?: { aCloses: number[]; bCloses: number[] };
}

export interface ParamPreset {
  id: string;
  label: string;
  params: Record<string, number | string>;
}

export interface CatalogSignal {
  id: string;
  family: SignalFamily;
  label: string;
  mode: "single" | "pair";
  directions: SignalDirection[];
  requires: {
    ohlc?: boolean;
    volume?: boolean;
    valuation?: string[];
  };
  /** Costly signals are excluded from the sweep unless explicitly enabled. */
  costly?: boolean;
  detect: (
    b: SeriesBundle,
    params: Record<string, number | string>,
    dir: SignalDirection,
  ) => number[];
  paramPresets: ParamPreset[];
  /** Drill-through route for "refine in optimizer". */
  optimizerRoute?: string;
}

// ---------------------------------------------------------------------------
// Bundle helpers (memoized per bundle — detectors run ~100+ times per subject)
// ---------------------------------------------------------------------------

const pointsMemo = new WeakMap<SeriesBundle, DataPoint[]>();
const barsMemo = new WeakMap<SeriesBundle, OhlcBar[] | null>();
const indexMemo = new WeakMap<SeriesBundle, Map<string, number>>();

function toPoints(b: SeriesBundle): DataPoint[] {
  let pts = pointsMemo.get(b);
  if (!pts) {
    pts = b.dates.map((time, i) => ({ time, value: b.closes[i] }));
    pointsMemo.set(b, pts);
  }
  return pts;
}

export function bundleHasOhlc(b: SeriesBundle): boolean {
  return !!(b.highs && b.lows && b.opens && b.highs.length === b.closes.length);
}

export function bundleHasVolume(b: SeriesBundle): boolean {
  return !!b.volumes && b.volumes.some((v) => v > 0);
}

function toBars(b: SeriesBundle): OhlcBar[] | null {
  if (barsMemo.has(b)) return barsMemo.get(b)!;
  let bars: OhlcBar[] | null = null;
  if (bundleHasOhlc(b)) {
    bars = b.dates.map((time, i) => ({
      time,
      open: b.opens![i],
      high: b.highs![i],
      low: b.lows![i],
      close: b.closes[i],
    }));
  }
  barsMemo.set(b, bars);
  return bars;
}

function dateIndex(b: SeriesBundle): Map<string, number> {
  let m = indexMemo.get(b);
  if (!m) {
    m = new Map(b.dates.map((d, i) => [d, i]));
    indexMemo.set(b, m);
  }
  return m;
}

/** Spread a warm-up-trimmed DataPoint[] back onto the full bar axis. */
function alignToBars(b: SeriesBundle, series: DataPoint[]): (number | null)[] {
  const idx = dateIndex(b);
  const out: (number | null)[] = new Array(b.dates.length).fill(null);
  for (const p of series) {
    const i = idx.get(p.time);
    if (i !== undefined) out[i] = p.value;
  }
  return out;
}

/**
 * Cross-into-zone detector: fire at bar i when `inZone` flips false→true.
 * A null value resets state (no firing across gaps).
 */
function detectCrossings(
  values: (number | null)[],
  inZone: (v: number) => boolean,
): number[] {
  const out: number[] = [];
  let prev: boolean | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      prev = null;
      continue;
    }
    const cur = inZone(v);
    if (prev === false && cur) out.push(i);
    prev = cur;
  }
  return out;
}

/** Fire when a[i] crosses above b[i] (long) — pass swapped for crosses-below. */
function detectSeriesCross(
  a: (number | null)[],
  bSeries: (number | null)[],
): number[] {
  const out: number[] = [];
  let prevAbove: boolean | null = null;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = bSeries[i];
    if (av === null || bv === null) {
      prevAbove = null;
      continue;
    }
    const above = av > bv;
    if (prevAbove === false && above) out.push(i);
    prevAbove = above;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Local math helpers (module-private in their source pages — small copies)
// ---------------------------------------------------------------------------

/** Rolling z-score of closes vs their own rolling mean/std. */
function rollingZScore(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    sumSq += values[i] * values[i];
    if (i >= window) {
      const old = values[i - window];
      sum -= old;
      sumSq -= old * old;
    }
    if (i >= window - 1) {
      const mean = sum / window;
      const variance = Math.max(0, sumSq / window - mean * mean);
      const std = Math.sqrt(variance);
      out[i] = std > 0 ? (values[i] - mean) / std : null;
    }
  }
  return out;
}

/** Trailing-return momentum: close[i]/close[i-lookback] − 1. */
function momentumReturn(closes: number[], lookback: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = lookback; i < closes.length; i++) {
    const base = closes[i - lookback];
    if (base > 0) out[i] = closes[i] / base - 1;
  }
  return out;
}

/** Percentile rank (0–100) of values[i] within the trailing `window` values. */
function rollingPercentileRank(
  values: (number | null)[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window; i < values.length; i++) {
    const cur = values[i];
    if (cur === null) continue;
    let below = 0;
    let n = 0;
    for (let j = i - window; j < i; j++) {
      const v = values[j];
      if (v === null) continue;
      n++;
      if (v < cur) below++;
    }
    if (n >= Math.floor(window / 2)) out[i] = (100 * below) / n;
  }
  return out;
}

/** Rolling SMA on a raw number[] aligned to the same indices. */
function rollingMean(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Technical family (12 signals)
// ---------------------------------------------------------------------------

const technicalSignals: CatalogSignal[] = [
  {
    id: "tech.zscore_revert",
    family: "technical",
    label: "Price z-score extreme",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/z-optimizer",
    paramPresets: [
      { id: "w63z2", label: "63d, ±2σ", params: { window: 63, z: 2 } },
      { id: "w126z2", label: "126d, ±2σ", params: { window: 126, z: 2 } },
      { id: "w252z15", label: "252d, ±1.5σ", params: { window: 252, z: 1.5 } },
    ],
    detect: (b, p, dir) => {
      const z = rollingZScore(b.closes, Number(p.window));
      const lim = Number(p.z);
      return detectCrossings(z, dir === "long" ? (v) => v <= -lim : (v) => v >= lim);
    },
  },
  {
    id: "tech.rsi_extreme",
    family: "technical",
    label: "RSI extreme",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/rsi-regime",
    paramPresets: [
      { id: "r14_30", label: "RSI(14) 30/70", params: { period: 14, low: 30, high: 70 } },
      { id: "r14_25", label: "RSI(14) 25/75", params: { period: 14, low: 25, high: 75 } },
      { id: "r7_20", label: "RSI(7) 20/80", params: { period: 7, low: 20, high: 80 } },
    ],
    detect: (b, p, dir) => {
      const rsi = alignToBars(b, computeRSI(toPoints(b), Number(p.period)));
      return dir === "long"
        ? detectCrossings(rsi, (v) => v <= Number(p.low))
        : detectCrossings(rsi, (v) => v >= Number(p.high));
    },
  },
  {
    id: "tech.ma_cross",
    family: "technical",
    label: "MA crossover",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/ma-crossover",
    paramPresets: [
      { id: "s20_50", label: "SMA 20/50", params: { type: "sma", fast: 20, slow: 50 } },
      { id: "s50_200", label: "SMA 50/200", params: { type: "sma", fast: 50, slow: 200 } },
      { id: "e10_30", label: "EMA 10/30", params: { type: "ema", fast: 10, slow: 30 } },
    ],
    detect: (b, p, dir) => {
      const pts = toPoints(b);
      const fn = p.type === "ema" ? computeEMA : computeSMA;
      const fast = alignToBars(b, fn(pts, Number(p.fast)));
      const slow = alignToBars(b, fn(pts, Number(p.slow)));
      return dir === "long" ? detectSeriesCross(fast, slow) : detectSeriesCross(slow, fast);
    },
  },
  {
    id: "tech.dist_200ma",
    family: "technical",
    label: "% from 200d MA extreme",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    paramPresets: [
      { id: "d10", label: "±10%", params: { dist: 10 } },
      { id: "d15", label: "±15%", params: { dist: 15 } },
    ],
    detect: (b, p, dir) => {
      const ma = rollingMean(b.closes, 200);
      const dist: (number | null)[] = b.closes.map((c, i) => {
        const m = ma[i];
        return m && m > 0 ? (100 * (c - m)) / m : null;
      });
      const d = Number(p.dist);
      return detectCrossings(dist, dir === "long" ? (v) => v <= -d : (v) => v >= d);
    },
  },
  {
    id: "tech.momentum_thresh",
    family: "technical",
    label: "Momentum zero-cross",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/momentum",
    paramPresets: [
      { id: "lb63", label: "3M lookback", params: { lookback: 63 } },
      { id: "lb126", label: "6M lookback", params: { lookback: 126 } },
    ],
    detect: (b, p, dir) => {
      const mom = momentumReturn(b.closes, Number(p.lookback));
      return detectCrossings(mom, dir === "long" ? (v) => v >= 0 : (v) => v < 0);
    },
  },
  {
    id: "tech.roc_pctile",
    family: "technical",
    label: "ROC percentile extreme",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/roc-optimizer",
    paramPresets: [
      { id: "roc21", label: "ROC(21), 252d pctile", params: { period: 21, window: 252 } },
      { id: "roc63", label: "ROC(63), 252d pctile", params: { period: 63, window: 252 } },
    ],
    detect: (b, p, dir) => {
      const roc = alignToBars(b, computeROC(toPoints(b), Number(p.period)));
      const pct = rollingPercentileRank(roc, Number(p.window));
      return detectCrossings(pct, dir === "long" ? (v) => v <= 10 : (v) => v >= 90);
    },
  },
  {
    id: "tech.slow_stoch",
    family: "technical",
    label: "Slow Stochastic reversal",
    mode: "single",
    directions: ["long", "short"],
    requires: { ohlc: true },
    optimizerRoute: "/slow-stoch-optimizer",
    paramPresets: [
      { id: "k14", label: "(14,3,3)", params: { k: 14, d: 3, slowing: 3 } },
      { id: "k21", label: "(21,5,5)", params: { k: 21, d: 5, slowing: 5 } },
    ],
    detect: (b, p, dir) => {
      const bars = toBars(b);
      if (!bars) return [];
      const { k } = computeSlowStochastic(bars, Number(p.k), Number(p.d), Number(p.slowing));
      const kAligned = alignToBars(b, k);
      // Long = %K crosses up through 20 (exits oversold); short = crosses
      // down through 80 (exits overbought). detectCrossings fires on the
      // false→true transition of the zone test, which is exactly the cross.
      return dir === "long"
        ? detectCrossings(kAligned, (v) => v >= 20)
        : detectCrossings(kAligned, (v) => v <= 80);
    },
  },
  {
    id: "tech.bollinger_touch",
    family: "technical",
    label: "Bollinger band touch",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/oscillators",
    paramPresets: [
      { id: "b20_2", label: "(20, 2σ)", params: { period: 20, mult: 2 } },
      { id: "b20_25", label: "(20, 2.5σ)", params: { period: 20, mult: 2.5 } },
    ],
    detect: (b, p, dir) => {
      const { upper, lower } = computeBollingerBands(toPoints(b), Number(p.period), Number(p.mult));
      const closes: (number | null)[] = b.closes.slice();
      return dir === "long"
        ? detectSeriesCross(alignToBars(b, lower), closes)
        : detectSeriesCross(closes, alignToBars(b, upper));
    },
  },
  {
    id: "tech.macd_cross",
    family: "technical",
    label: "MACD signal cross",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/oscillators",
    paramPresets: [{ id: "m12_26_9", label: "(12,26,9)", params: { fast: 12, slow: 26, signal: 9 } }],
    detect: (b, p, dir) => {
      const { macdLine, signalLine } = computeMACD(toPoints(b), Number(p.fast), Number(p.slow), Number(p.signal));
      const m = alignToBars(b, macdLine);
      const s = alignToBars(b, signalLine);
      return dir === "long" ? detectSeriesCross(m, s) : detectSeriesCross(s, m);
    },
  },
  {
    id: "tech.supertrend_flip",
    family: "technical",
    label: "Supertrend flip",
    mode: "single",
    directions: ["long", "short"],
    requires: { ohlc: true },
    paramPresets: [
      { id: "st10_3", label: "(10, 3)", params: { period: 10, mult: 3 } },
      { id: "st14_2", label: "(14, 2)", params: { period: 14, mult: 2 } },
    ],
    detect: (b, p, dir) => {
      const bars = toBars(b);
      if (!bars) return [];
      const st = computeSupertrend(bars, Number(p.period), Number(p.mult));
      const trend = alignToBars(
        b,
        st.map((d) => ({ time: d.time, value: d.trend })),
      );
      const want = dir === "long" ? 1 : -1;
      return detectCrossings(trend, (v) => v === want);
    },
  },
  {
    id: "tech.donchian_break",
    family: "technical",
    label: "Donchian channel break",
    mode: "single",
    directions: ["long", "short"],
    requires: { ohlc: true },
    optimizerRoute: "/range-optimizer",
    paramPresets: [
      { id: "dc20", label: "20d", params: { period: 20 } },
      { id: "dc55", label: "55d", params: { period: 55 } },
    ],
    detect: (b, p, dir) => {
      const bars = toBars(b);
      if (!bars) return [];
      const { upper, lower } = computeDonchian(bars, Number(p.period));
      // Break = close beyond the channel of the window ending at the PRIOR bar.
      const up = alignToBars(b, upper);
      const lo = alignToBars(b, lower);
      const shift = (arr: (number | null)[]) => [null, ...arr.slice(0, -1)];
      const closes: (number | null)[] = b.closes.slice();
      return dir === "long"
        ? detectSeriesCross(closes, shift(up))
        : detectSeriesCross(shift(lo), closes);
    },
  },
  {
    id: "tech.williams_r",
    family: "technical",
    label: "Williams %R reversal",
    mode: "single",
    directions: ["long", "short"],
    requires: { ohlc: true },
    optimizerRoute: "/oscillators",
    paramPresets: [{ id: "wr14", label: "(14) −80/−20", params: { period: 14, low: -80, high: -20 } }],
    detect: (b, p, dir) => {
      const bars = toBars(b);
      if (!bars) return [];
      const wr = alignToBars(b, computeWilliamsR(bars, Number(p.period)));
      // Long = crosses up through low (exits oversold); short = crosses down
      // through high (exits overbought).
      return dir === "long"
        ? detectCrossings(wr, (v) => v >= Number(p.low))
        : detectCrossings(wr, (v) => v <= Number(p.high));
    },
  },
];

// ---------------------------------------------------------------------------
// Catalog assembly
// ---------------------------------------------------------------------------

export const UNIVERSAL_SIGNAL_CATALOG: CatalogSignal[] = [...technicalSignals];

export function getCatalogSignal(id: string): CatalogSignal | undefined {
  return UNIVERSAL_SIGNAL_CATALOG.find((s) => s.id === id);
}

/**
 * Signals runnable against a given bundle: family + explicit enablement +
 * data-requirement gating (OHLC / volume / valuation series availability).
 */
export function signalsForBundle(
  b: SeriesBundle,
  enabledFamilies: Set<SignalFamily>,
  enabledIds: Set<string>,
): CatalogSignal[] {
  const isPair = !!b.pair;
  return UNIVERSAL_SIGNAL_CATALOG.filter((s) => {
    if (!enabledFamilies.has(s.family)) return false;
    if (!enabledIds.has(s.id)) return false;
    if (s.mode === "pair" !== isPair) return false;
    if (s.requires.ohlc && !bundleHasOhlc(b)) return false;
    if (s.requires.volume && !bundleHasVolume(b)) return false;
    if (s.requires.valuation) {
      const v = b.valuation;
      if (!v) return false;
      if (!s.requires.valuation.every((m) => v[m]?.some((x) => x !== null))) return false;
    }
    return true;
  });
}

/** Default-enabled signal ids (everything not marked costly). */
export function defaultEnabledSignalIds(): string[] {
  return UNIVERSAL_SIGNAL_CATALOG.filter((s) => !s.costly).map((s) => s.id);
}
