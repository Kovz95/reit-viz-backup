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
// Event family (7 signals)
// ---------------------------------------------------------------------------

const eventSignals: CatalogSignal[] = [
  {
    id: "event.gap_reversion",
    family: "event",
    label: "Price gap (fill trade)",
    mode: "single",
    directions: ["long", "short"],
    requires: { ohlc: true },
    paramPresets: [
      { id: "g2", label: "≥2% gap", params: { minGapPct: 2 } },
      { id: "g4", label: "≥4% gap", params: { minGapPct: 4 } },
    ],
    // Full gaps on adjusted OHLC, same definition as GapFillScreener:
    // gap DOWN at t (high[t] < low[t-1]) → long the fill (rally back);
    // gap UP at t (low[t] > high[t-1])   → short the fill (fade back).
    detect: (b, p, dir) => {
      const g = Number(p.minGapPct);
      const out: number[] = [];
      for (let t = 1; t < b.dates.length; t++) {
        if (dir === "long") {
          const prevLow = b.lows![t - 1];
          const gapPct = prevLow > 0 ? (100 * (prevLow - b.highs![t])) / prevLow : 0;
          if (b.highs![t] < prevLow && gapPct >= g) out.push(t);
        } else {
          const prevHigh = b.highs![t - 1];
          const gapPct = prevHigh > 0 ? (100 * (b.lows![t] - prevHigh)) / prevHigh : 0;
          if (b.lows![t] > prevHigh && gapPct >= g) out.push(t);
        }
      }
      return out;
    },
  },
  {
    id: "event.52wk_break",
    family: "event",
    label: "New high/low break",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    paramPresets: [
      { id: "n252", label: "252d", params: { window: 252 } },
      { id: "n126", label: "126d", params: { window: 126 } },
    ],
    // Long = new N-day closing high (continuation); short = new N-day low.
    detect: (b, p, dir) => {
      const w = Number(p.window);
      const out: number[] = [];
      let prevExtreme: boolean | null = null;
      for (let i = w; i < b.closes.length; i++) {
        let ext = dir === "long" ? -Infinity : Infinity;
        for (let j = i - w; j < i; j++) {
          const c = b.closes[j];
          if (dir === "long" ? c > ext : c < ext) ext = c;
        }
        const isBreak = dir === "long" ? b.closes[i] > ext : b.closes[i] < ext;
        if (prevExtreme === false && isBreak) out.push(i);
        prevExtreme = isBreak;
      }
      return out;
    },
  },
  {
    id: "event.capitulation",
    family: "event",
    label: "Capitulation day",
    mode: "single",
    directions: ["long"],
    requires: {},
    paramPresets: [
      { id: "k25", label: "< −2.5σ day", params: { k: 2.5 } },
      { id: "k3", label: "< −3σ day", params: { k: 3 } },
    ],
    // 1-day return below −k × trailing-252d daily return σ → long reversion.
    detect: (b, p) => {
      const k = Number(p.k);
      const rets: (number | null)[] = [null];
      for (let i = 1; i < b.closes.length; i++) {
        rets.push(b.closes[i - 1] > 0 ? b.closes[i] / b.closes[i - 1] - 1 : null);
      }
      const out: number[] = [];
      const W = 252;
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let i = 1; i < rets.length; i++) {
        const r = rets[i];
        if (i > W) {
          const old = rets[i - W];
          if (old !== null) {
            sum -= old;
            sumSq -= old * old;
            n--;
          }
        }
        if (r === null) continue;
        if (n > 60) {
          const mean = sum / n;
          const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
          if (std > 0 && r < -k * std) out.push(i);
        }
        sum += r;
        sumSq += r * r;
        n++;
      }
      return out;
    },
  },
  {
    id: "event.down_streak",
    family: "event",
    label: "Down-streak reversion",
    mode: "single",
    directions: ["long"],
    requires: {},
    paramPresets: [
      { id: "s5", label: "5 down closes", params: { streak: 5 } },
      { id: "s7", label: "7 down closes", params: { streak: 7 } },
    ],
    // Fire on the Nth consecutive down close (cross-into: exactly N, not N+1…
    // handled by only firing when the streak length equals N).
    detect: (b, p) => {
      const need = Number(p.streak);
      const out: number[] = [];
      let streak = 0;
      for (let i = 1; i < b.closes.length; i++) {
        streak = b.closes[i] < b.closes[i - 1] ? streak + 1 : 0;
        if (streak === need) out.push(i);
      }
      return out;
    },
  },
  {
    id: "event.volume_spike",
    family: "event",
    label: "Volume spike",
    mode: "single",
    directions: ["long", "short"],
    requires: { volume: true },
    paramPresets: [{ id: "m3", label: "3× 63d avg", params: { mult: 3 } }],
    // Volume > mult × trailing-63d avg with a down close (long capitulation)
    // or an up close (short exhaustion).
    detect: (b, p, dir) => {
      if (!b.volumes) return [];
      const avg = rollingMean(b.volumes, 63);
      const out: number[] = [];
      for (let i = 63; i < b.closes.length; i++) {
        const a = avg[i - 1];
        if (a === null || a <= 0) continue;
        if (b.volumes[i] <= Number(p.mult) * a) continue;
        const down = b.closes[i] < b.closes[i - 1];
        if ((dir === "long" && down) || (dir === "short" && !down)) out.push(i);
      }
      return out;
    },
  },
  {
    id: "event.drawdown_extreme",
    family: "event",
    label: "Drawdown extreme",
    mode: "single",
    directions: ["long"],
    requires: {},
    paramPresets: [
      { id: "d25", label: "−25% off 252d high", params: { dd: 25 } },
      { id: "d35", label: "−35% off 252d high", params: { dd: 35 } },
    ],
    // % off the trailing 252d closing high crosses below −dd%.
    detect: (b, p) => {
      const W = 252;
      const dd = Number(p.dd);
      const vals: (number | null)[] = new Array(b.closes.length).fill(null);
      for (let i = W; i < b.closes.length; i++) {
        let hi = -Infinity;
        for (let j = i - W; j <= i; j++) if (b.closes[j] > hi) hi = b.closes[j];
        if (hi > 0) vals[i] = (100 * (b.closes[i] - hi)) / hi;
      }
      return detectCrossings(vals, (v) => v <= -dd);
    },
  },
  {
    id: "event.channel_break",
    family: "event",
    label: "Regression channel break",
    mode: "single",
    directions: ["long", "short"],
    requires: {},
    costly: true,
    paramPresets: [{ id: "c100", label: "100d ±2σ", params: { window: 100, k: 2 } }],
    // Rolling linear-regression channel breakout. (detectChannels in
    // computeAutoTrendlines only describes CURRENT end-of-series structures,
    // so historical events use this backtestable equivalent instead.)
    detect: (b, p, dir) => {
      const w = Number(p.window);
      const k = Number(p.k);
      const n = b.closes.length;
      const vals: (number | null)[] = new Array(n).fill(null);
      for (let i = w - 1; i < n; i++) {
        // OLS fit over the window ending at i.
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (let j = 0; j < w; j++) {
          const y = b.closes[i - w + 1 + j];
          sx += j; sy += y; sxy += j * y; sxx += j * j;
        }
        const denom = w * sxx - sx * sx;
        if (denom === 0) continue;
        const slope = (w * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / w;
        let sse = 0;
        for (let j = 0; j < w; j++) {
          const resid = b.closes[i - w + 1 + j] - (intercept + slope * j);
          sse += resid * resid;
        }
        const sigma = Math.sqrt(sse / w);
        if (sigma <= 0) continue;
        const fitted = intercept + slope * (w - 1);
        vals[i] = (b.closes[i] - fitted) / sigma;
      }
      return detectCrossings(vals, dir === "long" ? (v) => v >= k : (v) => v <= -k);
    },
  },
];

// ---------------------------------------------------------------------------
// Valuation family (workbook tickers only — gated on metric availability).
// Metric keys match the EvaluatorPanel fundamental fetch path
// ("P/FFO FY2", "FFO Yield FY2", "Dividend Yield", "EV/EBITDA FY2").
// ---------------------------------------------------------------------------

/** Rolling z-score over a nullable series (nulls skipped, window = bars). */
function rollingZScoreN(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    const cur = values[i];
    if (cur === null) continue;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (v === null) continue;
      sum += v;
      sumSq += v * v;
      n++;
    }
    if (n < Math.floor(window / 2)) continue;
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    if (std > 0) out[i] = (cur - mean) / std;
  }
  return out;
}

function valuationZSignal(opts: {
  id: string;
  label: string;
  metric: string;
  /** true = LOW metric value is cheap (multiples); false = HIGH is cheap (yields). */
  lowIsCheap: boolean;
  presets: { id: string; label: string; z: number }[];
  longOnly?: boolean;
}): CatalogSignal {
  return {
    id: opts.id,
    family: "valuation",
    label: opts.label,
    mode: "single",
    directions: opts.longOnly ? ["long"] : ["long", "short"],
    requires: { valuation: [opts.metric] },
    paramPresets: opts.presets.map((p) => ({ id: p.id, label: p.label, params: { z: p.z } })),
    detect: (b, p, dir) => {
      const series = b.valuation?.[opts.metric];
      if (!series) return [];
      const z = rollingZScoreN(series, 252);
      const lim = Number(p.z);
      // "Cheap" fires long, "rich" fires short.
      const cheapTest = opts.lowIsCheap ? (v: number) => v <= -lim : (v: number) => v >= lim;
      const richTest = opts.lowIsCheap ? (v: number) => v >= lim : (v: number) => v <= -lim;
      return detectCrossings(z, dir === "long" ? cheapTest : richTest);
    },
  };
}

const valuationSignals: CatalogSignal[] = [
  valuationZSignal({
    id: "val.pffo_z",
    label: "P/FFO z-score extreme",
    metric: "P/FFO FY2",
    lowIsCheap: true,
    presets: [
      { id: "z15", label: "252d ±1.5σ", z: 1.5 },
      { id: "z2", label: "252d ±2σ", z: 2 },
    ],
  }),
  valuationZSignal({
    id: "val.ev_ebitda_z",
    label: "EV/EBITDA z-score extreme",
    metric: "EV/EBITDA FY2",
    lowIsCheap: true,
    presets: [
      { id: "z15", label: "252d ±1.5σ", z: 1.5 },
      { id: "z2", label: "252d ±2σ", z: 2 },
    ],
  }),
  valuationZSignal({
    id: "val.ffo_yield_z",
    label: "FFO yield rich vs history",
    metric: "FFO Yield FY2",
    lowIsCheap: false,
    longOnly: true,
    presets: [{ id: "z15", label: "252d +1.5σ", z: 1.5 }],
  }),
  {
    id: "val.div_yield_pctile",
    family: "valuation",
    label: "Dividend yield percentile",
    mode: "single",
    directions: ["long", "short"],
    requires: { valuation: ["Dividend Yield"] },
    paramPresets: [{ id: "p90", label: "252d 90th/10th", params: { hi: 90, lo: 10 } }],
    // High yield percentile = cheap → long; low percentile = rich → short.
    detect: (b, p, dir) => {
      const series = b.valuation?.["Dividend Yield"];
      if (!series) return [];
      const pct = rollingPercentileRank(series, 252);
      return dir === "long"
        ? detectCrossings(pct, (v) => v >= Number(p.hi))
        : detectCrossings(pct, (v) => v <= Number(p.lo));
    },
  },
];

/** Union of valuation metric keys needed by a set of enabled signal ids. */
export function requiredValuationMetrics(enabledIds: Set<string>): string[] {
  const metrics = new Set<string>();
  for (const s of UNIVERSAL_SIGNAL_CATALOG) {
    if (!enabledIds.has(s.id) || !s.requires.valuation) continue;
    for (const m of s.requires.valuation) metrics.add(m);
  }
  return [...metrics];
}

// ---------------------------------------------------------------------------
// Pair family (mode "pair": bundle.closes is the ratio A÷B; direction "long"
// = long the ratio, i.e. long A / short B)
// ---------------------------------------------------------------------------

const pairSignals: CatalogSignal[] = [
  {
    id: "pair.ratio_z",
    family: "pair",
    label: "Ratio z-score extreme",
    mode: "pair",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/pair-optimizer",
    paramPresets: [
      { id: "w126", label: "126d ±2σ", params: { window: 126, z: 2 } },
      { id: "w252", label: "252d ±2σ", params: { window: 252, z: 2 } },
    ],
    detect: (b, p, dir) => {
      const z = rollingZScore(b.closes, Number(p.window));
      const lim = Number(p.z);
      return detectCrossings(z, dir === "long" ? (v) => v <= -lim : (v) => v >= lim);
    },
  },
  {
    id: "pair.ratio_rsi",
    family: "pair",
    label: "Ratio RSI extreme",
    mode: "pair",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/pair-optimizer",
    paramPresets: [{ id: "r14", label: "RSI(14) 30/70", params: { period: 14, low: 30, high: 70 } }],
    detect: (b, p, dir) => {
      const rsi = alignToBars(b, computeRSI(toPoints(b), Number(p.period)));
      return dir === "long"
        ? detectCrossings(rsi, (v) => v <= Number(p.low))
        : detectCrossings(rsi, (v) => v >= Number(p.high));
    },
  },
  {
    id: "pair.ratio_dist200",
    family: "pair",
    label: "Ratio % from 200d MA",
    mode: "pair",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/pair-optimizer",
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
    id: "pair.ols_spread_z",
    family: "pair",
    label: "OLS spread z-score",
    mode: "pair",
    directions: ["long", "short"],
    requires: {},
    optimizerRoute: "/pair-optimizer",
    paramPresets: [{ id: "w252", label: "252d ±2σ", params: { window: 252, z: 2 } }],
    // Rolling OLS of log(A) on log(B); z of the current residual vs the
    // window's residual distribution. Needs real legs — the bundle builder
    // attaches them best-effort; without legs this signal is skipped.
    detect: (b, p, dir) => {
      const legs = b.pair;
      if (!legs || legs.aCloses.length !== b.closes.length || legs.aCloses.length === 0) return [];
      const w = Number(p.window);
      const lim = Number(p.z);
      const n = b.closes.length;
      const la = legs.aCloses.map((v) => (v > 0 ? Math.log(v) : NaN));
      const lb = legs.bCloses.map((v) => (v > 0 ? Math.log(v) : NaN));
      const vals: (number | null)[] = new Array(n).fill(null);
      for (let i = w - 1; i < n; i++) {
        let sx = 0, sy = 0, sxy = 0, sxx = 0, m = 0;
        for (let j = i - w + 1; j <= i; j++) {
          const x = lb[j];
          const y = la[j];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          sx += x; sy += y; sxy += x * y; sxx += x * x; m++;
        }
        if (m < Math.floor(w / 2)) continue;
        const denom = m * sxx - sx * sx;
        if (denom === 0) continue;
        const beta = (m * sxy - sx * sy) / denom;
        const alpha = (sy - beta * sx) / m;
        // Residual distribution over the window.
        let rs = 0, rss = 0, rn = 0;
        for (let j = i - w + 1; j <= i; j++) {
          const x = lb[j];
          const y = la[j];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const resid = y - (alpha + beta * x);
          rs += resid; rss += resid * resid; rn++;
        }
        const mean = rs / rn;
        const std = Math.sqrt(Math.max(0, rss / rn - mean * mean));
        if (std <= 0) continue;
        const cur = la[i] - (alpha + beta * lb[i]);
        vals[i] = (cur - mean) / std;
      }
      return detectCrossings(vals, dir === "long" ? (v) => v <= -lim : (v) => v >= lim);
    },
  },
];

// ---------------------------------------------------------------------------
// Catalog assembly
// ---------------------------------------------------------------------------

export const UNIVERSAL_SIGNAL_CATALOG: CatalogSignal[] = [
  ...technicalSignals,
  ...eventSignals,
  ...valuationSignals,
  ...pairSignals,
];

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
